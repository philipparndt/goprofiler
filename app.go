package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/pprof/profile"
	"github.com/google/uuid"
	"github.com/philipparndt/go-logger"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"github.com/philipparndt/goprofiler/internal/ai"
	"github.com/philipparndt/goprofiler/internal/connection"
	"github.com/philipparndt/goprofiler/internal/java"
	"github.com/philipparndt/goprofiler/internal/k8s"
	"github.com/philipparndt/goprofiler/internal/settings"
	"github.com/philipparndt/goprofiler/internal/expvar"
	"github.com/philipparndt/goprofiler/internal/flamegraph"
	"github.com/philipparndt/goprofiler/internal/monitor"
	"github.com/philipparndt/goprofiler/internal/profiler"
	"github.com/philipparndt/goprofiler/internal/storage"
	"github.com/philipparndt/goprofiler/internal/traceparser"
)

type recordingState struct {
	cancel    context.CancelFunc
	done      chan struct{}
	profileID string
	err       error
	ptype     string
}

type App struct {
	ctx         context.Context
	connections *connection.Store
	storage     *storage.Store
	settings    *settings.Store
	monitor     *monitor.Service
	cpuMonitor    *monitor.CpuService
	javaMonitor   *java.JavaMonitorService
	collector   *profiler.Collector

	mu              sync.Mutex
	activeCancel    map[string]context.CancelFunc
	activeRecording map[string]*recordingState
	traceCache      map[string]*traceparser.TraceData

	analysis          *ai.AnalysisService
	portForwardMgr    *k8s.PortForwardManager
}

func NewApp() *App {
	return &App{
		collector:       profiler.NewCollector(),
		activeCancel:    make(map[string]context.CancelFunc),
		activeRecording: make(map[string]*recordingState),
		traceCache:      make(map[string]*traceparser.TraceData),
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	home, _ := os.UserHomeDir()
	dataDir := filepath.Join(home, ".goprofiler")

	store, err := storage.NewStore(dataDir)
	if err != nil {
		logger.Error("failed to initialize storage", "error", err)
		return
	}
	a.storage = store

	configDir := filepath.Join(home, ".config", "goprofiler")
	connStore, err := connection.NewStore(configDir)
	if err != nil {
		logger.Error("failed to initialize connection store", "error", err)
		return
	}
	a.connections = connStore

	settingsStore, err := settings.NewStore(configDir)
	if err != nil {
		logger.Error("failed to initialize settings store", "error", err)
		return
	}
	a.settings = settingsStore

	monitorSvc := monitor.NewService()
	a.monitor = monitorSvc

	cpuMonitorSvc := monitor.NewCpuService()
	a.cpuMonitor = cpuMonitorSvc

	javaMonitorSvc := java.NewJavaMonitorService()
	a.javaMonitor = javaMonitorSvc

	for _, t := range connStore.List() {
		if t.Language == connection.LangJava {
			javaMonitorSvc.StartTarget(t.ID, t.URL)
		} else {
			monitorSvc.StartTarget(t.ID, t.URL)
		}
	}

	connStore.OnConnect = func(id, url string) {
		// Check language to start the right monitor
		if t, ok := connStore.Get(id); ok && t.Language == connection.LangJava {
			javaMonitorSvc.StartTarget(id, url)
		} else {
			monitorSvc.StartTarget(id, url)
		}
	}
	connStore.OnDisconnect = func(id string) {
		monitorSvc.StopTarget(id)
		cpuMonitorSvc.StopTarget(id)
		javaMonitorSvc.StopTarget(id)
		if a.portForwardMgr != nil {
			a.portForwardMgr.Stop(id)
		}
	}
	connStore.OnURLChange = func(id, oldURL, newURL string) {
		// K8s port-forwards change the local port on reconnect; keep the
		// recorded profiles attached to the target's new dial URL.
		if err := store.ReassignProfiles(oldURL, newURL); err != nil {
			logger.Error("failed to reassign profiles on url change", "error", err)
		}
	}
	connStore.ValidateJava = func(url string) error {
		host, port, err := java.ParseJMXAddress(url)
		if err != nil {
			return err
		}
		return java.ValidateConnection(host, port)
	}

	a.analysis = ai.NewAnalysisService(connStore, settingsStore, appTraceLoader{app: a})

	logger.Info("GoProfiler desktop started")
}

// appTraceLoader adapts App.GetTraceData to the ai.TraceDataLoader interface.
type appTraceLoader struct {
	app *App
}

func (l appTraceLoader) LoadTraceData(profileID string) (*traceparser.TraceData, error) {
	return l.app.GetTraceData(profileID)
}

func (a *App) shutdown(ctx context.Context) {
	if a.portForwardMgr != nil {
		a.portForwardMgr.StopAll()
	}
	if a.javaMonitor != nil {
		a.javaMonitor.Close()
	}
	if a.cpuMonitor != nil {
		a.cpuMonitor.Close()
	}
	if a.monitor != nil {
		a.monitor.Close()
	}
	if a.connections != nil {
		a.connections.Close()
	}
	if a.storage != nil {
		a.storage.Close()
	}
}

// --- Connection bindings ---

type TargetWithCount struct {
	*connection.Target
	ProfileCount int `json:"profileCount"`
}

func (a *App) ListTargets() ([]TargetWithCount, error) {
	targets := a.connections.List()
	counts, _ := a.storage.ProfileCountsByTarget()
	result := make([]TargetWithCount, len(targets))
	for i, t := range targets {
		result[i] = TargetWithCount{Target: t, ProfileCount: counts[t.URL]}
	}
	return result, nil
}

func (a *App) AddTarget(url string) (*connection.Target, error) {
	return a.connections.Connect(url)
}

func (a *App) AddJavaTarget(address string) (*connection.Target, error) {
	host, port, err := java.ParseJMXAddress(address)
	if err != nil {
		return nil, err
	}
	if err := java.ValidateConnection(host, port); err != nil {
		return nil, err
	}
	jmxURL := fmt.Sprintf("%s:%d", host, port)
	return a.connections.ConnectJava(jmxURL, "jmx")
}

func (a *App) RemoveTarget(id string) error {
	return a.connections.Remove(id)
}

func (a *App) DisconnectTarget(id string) error {
	a.mu.Lock()
	if cancel, ok := a.activeCancel[id]; ok {
		cancel()
		delete(a.activeCancel, id)
	}
	a.mu.Unlock()
	return a.connections.Disconnect(id)
}

func (a *App) ListSavedTargets() ([]TargetWithCount, error) {
	targets := a.connections.ListSaved()
	counts, _ := a.storage.ProfileCountsByTarget()
	result := make([]TargetWithCount, len(targets))
	for i, t := range targets {
		result[i] = TargetWithCount{Target: t, ProfileCount: counts[t.URL]}
	}
	return result, nil
}

func (a *App) ReconnectTarget(id string) (*connection.Target, error) {
	// Check if this is a K8s target that needs a fresh port-forward
	// Look in both saved and active (unreachable targets stay in active)
	var target *connection.Target
	if t, ok := a.connections.GetSaved(id); ok {
		target = t
	} else if t, ok := a.connections.Get(id); ok {
		target = t
	}

	if target != nil && target.IsK8s() {
		return a.reconnectK8s(id, target)
	}
	return a.connections.Reconnect(id)
}

func (a *App) reconnectK8s(id string, saved *connection.Target) (*connection.Target, error) {
	if a.portForwardMgr == nil {
		a.portForwardMgr = k8s.NewPortForwardManager()
	}

	// Pod names change on every deploy/restart — resolve the workload's
	// current pod instead of blindly reusing the stored name.
	return a.reconnectK8sToPod(id, saved, a.resolveCurrentK8sPod(id, saved))
}

// reconnectK8sToPod tears down the target's old port-forward/monitors,
// forwards to the given pod, and reconnects the target on the new local port.
func (a *App) reconnectK8sToPod(id string, saved *connection.Target, podName string) (*connection.Target, error) {
	// If the target is still in the active set (unreachable ones stay
	// there), move it to saved first: this also stops monitors and the old
	// port-forward, and Reconnect below only accepts saved targets.
	if _, ok := a.connections.Get(id); ok {
		_ = a.connections.Disconnect(id)
	} else {
		a.portForwardMgr.Stop(id)
	}

	// Start a fresh port-forward
	localPort, err := a.portForwardMgr.Start(saved.K8sContext, saved.K8sNamespace, podName, saved.K8sPort, id)
	if err != nil {
		return nil, fmt.Errorf("port-forward: %w", err)
	}

	if podName != saved.K8sPod {
		a.connections.SetK8sInfo(id, saved.K8sContext, saved.K8sNamespace, podName, saved.K8sPort)
	}

	// Update the saved target's URL (port-forward is already ready) to the new local port, then reconnect
	newURL := fmt.Sprintf("http://localhost:%d", localPort)
	if saved.Language == connection.LangJava {
		newURL = fmt.Sprintf("localhost:%d", localPort)
	}
	a.connections.UpdateURL(id, newURL)

	t, err := a.connections.Reconnect(id)
	if err != nil {
		return nil, err
	}
	// Migrate pre-workload targets labeled with an ephemeral pod name to the
	// stable workload name.
	if t.K8sWorkloadName != "" && (t.Label == "" || t.Label == saved.K8sPod || t.Label == t.K8sPod) {
		a.connections.SetLabel(id, t.K8sWorkloadName)
		t.Label = t.K8sWorkloadName
	}
	return t, nil
}

// resolveCurrentK8sPod returns the name of the pod currently backing the
// target's workload, falling back to the stored pod name. Targets saved
// before workload tracking existed get their workload backfilled from the
// stored pod if it still exists.
func (a *App) resolveCurrentK8sPod(id string, target *connection.Target) string {
	kubeconfigPath := a.settings.Get().KubeconfigPath

	kind, name := target.K8sWorkloadKind, target.K8sWorkloadName
	if kind == "" {
		k, n, err := k8s.ResolveWorkload(kubeconfigPath, target.K8sContext, target.K8sNamespace, target.K8sPod)
		if err != nil {
			logger.Warn("could not backfill workload for k8s target", "pod", target.K8sPod, "error", err)
			return target.K8sPod
		}
		kind, name = k, n
		a.connections.SetK8sWorkload(id, kind, name)
	}

	current, err := k8s.FindPodForWorkload(kubeconfigPath, target.K8sContext, target.K8sNamespace, kind, name)
	if err != nil {
		logger.Warn("could not resolve current pod for workload", "workload", kind+"/"+name, "error", err)
		return target.K8sPod
	}
	if current != target.K8sPod {
		logger.Info("k8s pod changed since last connect", "workload", kind+"/"+name, "old", target.K8sPod, "new", current)
	}
	return current
}

// --- Profile bindings ---

func (a *App) ListProfiles(typeFilter, targetFilter, tagFilter string) ([]storage.ProfileRecord, error) {
	profiles, err := a.storage.ListProfiles(typeFilter, targetFilter, tagFilter)
	if err != nil {
		return nil, err
	}
	if profiles == nil {
		profiles = []storage.ProfileRecord{}
	}
	return profiles, nil
}

func (a *App) StartProfile(targetID, profileType string, durationSec int) (map[string]any, error) {
	target, ok := a.connections.Get(targetID)
	if !ok {
		return nil, fmt.Errorf("target not found")
	}

	// Java targets use JFR profiling, not pprof
	if target.Language == connection.LangJava {
		return a.startJavaProfile(target, profileType, durationSec)
	}

	ptype := profiler.ProfileType(profileType)

	if profileType == "all_snapshots" {
		types := []profiler.ProfileType{profiler.Heap, profiler.Goroutine, profiler.Block, profiler.Mutex, profiler.Allocs, profiler.ThreadCreate}
		var results []storage.ProfileRecord
		for _, pt := range types {
			collected, err := a.collector.CollectSnapshot(a.ctx, target.URL, pt)
			if err != nil {
				logger.Error("snapshot failed", "type", pt, "error", err)
				continue
			}
			rec, err := a.saveCollected(collected)
			if err != nil {
				logger.Error("save failed", "type", pt, "error", err)
				continue
			}
			results = append(results, *rec)
		}
		return map[string]any{"profiles": results}, nil
	}

	if ptype == profiler.CPU || ptype == profiler.Trace {
		ctx, cancel := context.WithCancel(context.Background())
		rs := &recordingState{
			cancel: cancel,
			done:   make(chan struct{}),
			ptype:  string(ptype),
		}

		a.mu.Lock()
		a.activeCancel[targetID] = cancel
		a.activeRecording[targetID] = rs
		a.mu.Unlock()

		go func() {
			defer close(rs.done)
			var collected *profiler.CollectedProfile
			var err error
			if ptype == profiler.Trace {
				collected, err = a.collector.CollectTrace(ctx, target.URL, durationSec)
			} else {
				collected, err = a.collector.CollectCPU(ctx, target.URL, durationSec)
			}
			if err != nil {
				if collected != nil && len(collected.Data) > 0 {
					if rec, saveErr := a.saveCollected(collected); saveErr == nil {
						rs.profileID = rec.ID
					} else {
						rs.err = saveErr
					}
				} else {
					rs.err = err
				}
				return
			}
			rec, err := a.saveCollected(collected)
			if err != nil {
				rs.err = err
				return
			}
			rs.profileID = rec.ID
		}()

		return map[string]any{"status": "recording", "type": string(ptype)}, nil
	}

	collected, err := a.collector.CollectSnapshot(a.ctx, target.URL, ptype)
	if err != nil {
		return nil, err
	}
	rec, err := a.saveCollected(collected)
	if err != nil {
		return nil, err
	}
	return map[string]any{"profile": rec}, nil
}

func (a *App) GetRecordingStatus(targetID string) map[string]string {
	a.mu.Lock()
	rs, ok := a.activeRecording[targetID]
	a.mu.Unlock()

	if !ok {
		return map[string]string{"status": "idle"}
	}

	select {
	case <-rs.done:
		a.mu.Lock()
		delete(a.activeCancel, targetID)
		delete(a.activeRecording, targetID)
		a.mu.Unlock()
		if rs.err != nil {
			return map[string]string{"status": "failed", "error": rs.err.Error()}
		}
		return map[string]string{"status": "done", "profileId": rs.profileID}
	default:
		return map[string]string{"status": "recording", "type": rs.ptype}
	}
}

func (a *App) StopRecording(targetID string) (map[string]string, error) {
	a.mu.Lock()
	rs, ok := a.activeRecording[targetID]
	cancel, hasCancel := a.activeCancel[targetID]
	a.mu.Unlock()

	if !ok {
		return nil, fmt.Errorf("no active recording")
	}

	if hasCancel {
		cancel()
	}

	<-rs.done

	a.mu.Lock()
	delete(a.activeCancel, targetID)
	delete(a.activeRecording, targetID)
	a.mu.Unlock()

	if rs.profileID != "" {
		return map[string]string{"status": "done", "profileId": rs.profileID}, nil
	}
	if rs.err != nil {
		return map[string]string{"status": "no_data", "error": "Recording stopped but no data was captured."}, nil
	}
	return map[string]string{"status": "no_data", "error": "No data captured"}, nil
}

func (a *App) CancelProfile(targetID string) error {
	a.mu.Lock()
	cancel, ok := a.activeCancel[targetID]
	if ok {
		cancel()
		delete(a.activeCancel, targetID)
		delete(a.activeRecording, targetID)
	}
	a.mu.Unlock()
	if !ok {
		return fmt.Errorf("no active profiling session")
	}
	return nil
}

func (a *App) GetProfile(id string, filter string, valueMode string) (map[string]any, error) {
	rec, err := a.storage.GetProfile(id)
	if err != nil {
		return nil, err
	}

	data, err := a.storage.GetProfileData(id)
	if err != nil {
		return nil, err
	}

	if rec.Type == "trace" {
		return map[string]any{
			"id": rec.ID, "targetURL": rec.TargetURL, "type": rec.Type,
			"timestamp": rec.Timestamp, "durationSec": rec.DurationSec,
			"size": rec.Size, "label": rec.Label, "tags": rec.Tags, "traceType": true,
		}, nil
	}

	// Handle Java heap histogram format
	if rec.Format == "java-heap-histogram" {
		var hist java.HeapHistogram
		if err := json.Unmarshal(data, &hist); err != nil {
			return nil, fmt.Errorf("parse heap histogram: %w", err)
		}

		root := &flamegraph.Node{Name: "root", Value: hist.TotalBytes, Samples: hist.TotalInstances}
		for _, c := range hist.Classes {
			root.Children = append(root.Children, &flamegraph.Node{
				Name: c.ClassName, Value: c.Bytes, Samples: c.Instances,
			})
		}

		var topFuncs []flamegraph.TopFunction
		for _, c := range hist.Classes {
			topFuncs = append(topFuncs, flamegraph.TopFunction{
				Name:    c.ClassName,
				Flat:    java.FormatJFRValue(c.Bytes, java.JFRProfileAlloc),
				FlatPct: float64(c.Bytes) / float64(max(hist.TotalBytes, 1)) * 100,
				Cum:     java.FormatJFRValue(c.Bytes, java.JFRProfileAlloc),
				CumPct:  float64(c.Bytes) / float64(max(hist.TotalBytes, 1)) * 100,
			})
		}

		formatFn := func(v int64) string { return java.FormatJFRValue(v, java.JFRProfileAlloc) }
		callTree := flamegraph.BuildCallTreeFromFlameGraph(root, formatFn)

		return map[string]any{
			"id": rec.ID, "targetURL": rec.TargetURL, "type": rec.Type,
			"timestamp": rec.Timestamp, "durationSec": rec.DurationSec,
			"size": rec.Size, "label": rec.Label, "tags": rec.Tags,
			"format": rec.Format,
			"flameGraph": root, "topFunctions": topFuncs, "callTree": callTree,
		}, nil
	}

	// Handle JFR format
	if rec.Format == "jfr" {
		jfrType := java.JFRProfileCPU
		switch rec.Type {
		case "heap", "allocs":
			jfrType = java.JFRProfileAlloc
		case "lock", "mutex":
			jfrType = java.JFRProfileLock
		}
		result, err := java.ParseJFR(data, jfrType)
		if err != nil {
			return nil, fmt.Errorf("failed to parse JFR: %w", err)
		}
		formatFn := func(v int64) string {
			return java.FormatJFRValue(v, jfrType)
		}
		callTree := flamegraph.BuildCallTreeFromFlameGraph(result.FlameGraph, formatFn)
		resp := map[string]any{
			"id": rec.ID, "targetURL": rec.TargetURL, "type": rec.Type,
			"timestamp": rec.Timestamp, "durationSec": rec.DurationSec,
			"size": rec.Size, "label": rec.Label, "tags": rec.Tags,
			"format": "jfr",
			"flameGraph": result.FlameGraph, "topFunctions": result.TopFunctions,
			"callTree": callTree,
		}
		return resp, nil
	}

	prof, err := profile.ParseData(data)
	if err != nil {
		return nil, fmt.Errorf("failed to parse profile: %w", err)
	}

	if filter == "pprof" {
		flamegraph.FilterPprofOverhead(prof)
	}

	valueOverride := -1
	if valueMode == "alloc" && len(prof.SampleType) >= 4 {
		for i, st := range prof.SampleType {
			if st.Type == "alloc_space" && st.Unit == "bytes" {
				valueOverride = i
				break
			}
		}
	}

	result := flamegraph.Convert(prof, valueOverride)
	callTree := flamegraph.BuildCallTree(prof, valueOverride)

	resp := map[string]any{
		"id": rec.ID, "targetURL": rec.TargetURL, "type": rec.Type,
		"timestamp": rec.Timestamp, "durationSec": rec.DurationSec,
		"size": rec.Size, "label": rec.Label, "tags": rec.Tags,
		"flameGraph": result.FlameGraph, "topFunctions": result.TopFunctions, "callTree": callTree,
	}

	if len(prof.SampleType) >= 4 {
		summary := map[string]int64{}
		for _, s := range prof.Sample {
			for i, st := range prof.SampleType {
				if i < len(s.Value) {
					summary[st.Type] += s.Value[i]
				}
			}
		}
		resp["heapSummary"] = map[string]any{
			"inuseObjects": summary["inuse_objects"], "inuseSpace": summary["inuse_space"],
			"allocObjects": summary["alloc_objects"], "allocSpace": summary["alloc_space"],
		}
	}

	return resp, nil
}

func (a *App) DeleteProfile(id string) error {
	return a.storage.DeleteProfile(id)
}

func (a *App) UpdateLabel(id, label string) error {
	return a.storage.UpdateLabel(id, label)
}

func (a *App) SetTags(id string, tags []string) error {
	tagsJSON, _ := json.Marshal(tags)
	return a.storage.SetTags(id, string(tagsJSON))
}

func (a *App) RefreshProfile(id string) (map[string]any, error) {
	rec, err := a.storage.GetProfile(id)
	if err != nil {
		return nil, err
	}

	recordingTypes := map[string]bool{"cpu": true, "trace": true}
	if recordingTypes[rec.Type] {
		return nil, fmt.Errorf("refresh is only available for snapshot profiles")
	}

	oldData, _ := a.storage.GetProfileData(id)

	ptype := profiler.ProfileType(rec.Type)
	collected, err := a.collector.CollectSnapshot(a.ctx, rec.TargetURL, ptype)
	if err != nil {
		return nil, err
	}

	if err := a.storage.RefreshProfile(id, collected.Data, collected.Timestamp); err != nil {
		return nil, err
	}

	a.mu.Lock()
	delete(a.traceCache, id)
	a.mu.Unlock()

	updated, _ := a.storage.GetProfile(id)
	if updated == nil {
		return nil, nil
	}

	resp := map[string]any{
		"id": updated.ID, "targetURL": updated.TargetURL, "type": updated.Type,
		"timestamp": updated.Timestamp, "durationSec": updated.DurationSec,
		"size": updated.Size, "label": updated.Label, "tags": updated.Tags,
	}

	if oldData != nil && len(oldData) > 0 {
		oldProf, oldErr := profile.ParseData(oldData)
		newProf, newErr := profile.ParseData(collected.Data)
		if oldErr == nil && newErr == nil {
			allocIdx := -1
			for i, st := range newProf.SampleType {
				if st.Type == "alloc_space" && st.Unit == "bytes" {
					allocIdx = i
					break
				}
			}
			if allocIdx >= 0 {
				flamegraph.FilterPprofOverhead(oldProf)
				flamegraph.FilterPprofOverhead(newProf)
				oldProf.Scale(-1)
				merged, mergeErr := profile.Merge([]*profile.Profile{oldProf, newProf})
				if mergeErr == nil {
					diffResult := flamegraph.Convert(merged, allocIdx)
					diffCallTree := flamegraph.BuildCallTree(merged, allocIdx)
					resp["refreshDiff"] = map[string]any{
						"flameGraph": diffResult.FlameGraph, "topFunctions": diffResult.TopFunctions, "callTree": diffCallTree,
					}
				}
			}
		}
	}

	return resp, nil
}

func (a *App) DiffProfiles(baseID, compareID string) (map[string]any, error) {
	baseData, err := a.storage.GetProfileData(baseID)
	if err != nil {
		return nil, fmt.Errorf("base profile: %w", err)
	}
	compareData, err := a.storage.GetProfileData(compareID)
	if err != nil {
		return nil, fmt.Errorf("compare profile: %w", err)
	}

	baseProf, err := profile.ParseData(baseData)
	if err != nil {
		return nil, fmt.Errorf("parse base: %w", err)
	}
	compareProf, err := profile.ParseData(compareData)
	if err != nil {
		return nil, fmt.Errorf("parse compare: %w", err)
	}

	baseProf.Scale(-1)
	merged, err := profile.Merge([]*profile.Profile{baseProf, compareProf})
	if err != nil {
		return nil, fmt.Errorf("merge profiles: %w", err)
	}

	result := flamegraph.Convert(merged)
	callTree := flamegraph.BuildCallTree(merged)

	baseRec, _ := a.storage.GetProfile(baseID)
	compareRec, _ := a.storage.GetProfile(compareID)

	resp := map[string]any{
		"flameGraph": result.FlameGraph, "topFunctions": result.TopFunctions,
		"callTree": callTree, "type": "diff",
	}
	if baseRec != nil {
		resp["base"] = baseRec
	}
	if compareRec != nil {
		resp["compare"] = compareRec
	}
	return resp, nil
}

func (a *App) ListTags() ([]string, error) {
	tags, err := a.storage.ListAllTags()
	if err != nil {
		return nil, err
	}
	if tags == nil {
		tags = []string{}
	}
	return tags, nil
}

// --- Monitor bindings ---

func (a *App) GetMemStatsHistory(targetID, since string) (any, error) {
	target, ok := a.connections.Get(targetID)
	if !ok {
		return nil, fmt.Errorf("target not found")
	}

	var sinceTime time.Time
	if since != "" {
		if ts, err := time.Parse(time.RFC3339Nano, since); err == nil {
			sinceTime = ts
		}
	}

	return a.monitor.GetHistory(target.URL, sinceTime), nil
}

func (a *App) GetCpuHistory(targetID, since string) (any, error) {
	target, ok := a.connections.Get(targetID)
	if !ok {
		return nil, fmt.Errorf("target not found")
	}

	var sinceTime time.Time
	if since != "" {
		if ts, err := time.Parse(time.RFC3339Nano, since); err == nil {
			sinceTime = ts
		}
	}

	history := a.cpuMonitor.GetHistory(target.URL, sinceTime)
	return map[string]any{
		"points": history.Points,
		"active": a.cpuMonitor.IsActive(targetID),
	}, nil
}

func (a *App) EnableCpuMonitoring(targetID string) (map[string]string, error) {
	target, ok := a.connections.Get(targetID)
	if !ok {
		return nil, fmt.Errorf("target not found")
	}

	a.cpuMonitor.StartTarget(targetID, target.URL)
	return map[string]string{"status": "enabled"}, nil
}

func (a *App) DisableCpuMonitoring(targetID string) (map[string]string, error) {
	if _, ok := a.connections.Get(targetID); !ok {
		return nil, fmt.Errorf("target not found")
	}

	a.cpuMonitor.StopTarget(targetID)
	return map[string]string{"status": "disabled"}, nil
}

func (a *App) GetJavaMonitorHistory(targetID, since string) (any, error) {
	target, ok := a.connections.Get(targetID)
	if !ok {
		return nil, fmt.Errorf("target not found")
	}

	var sinceTime time.Time
	if since != "" {
		if ts, err := time.Parse(time.RFC3339Nano, since); err == nil {
			sinceTime = ts
		}
	}

	return a.javaMonitor.GetHistory(target.URL, sinceTime), nil
}

func (a *App) EnableJavaMonitoring(targetID string) (map[string]string, error) {
	target, ok := a.connections.Get(targetID)
	if !ok {
		return nil, fmt.Errorf("target not found")
	}
	a.javaMonitor.StartTarget(targetID, target.URL)
	return map[string]string{"status": "enabled"}, nil
}

func (a *App) DisableJavaMonitoring(targetID string) (map[string]string, error) {
	if _, ok := a.connections.Get(targetID); !ok {
		return nil, fmt.Errorf("target not found")
	}
	a.javaMonitor.StopTarget(targetID)
	return map[string]string{"status": "disabled"}, nil
}

func (a *App) GetGoroutineGroups(targetID string, top int) (any, error) {
	target, ok := a.connections.Get(targetID)
	if !ok {
		return nil, fmt.Errorf("target not found")
	}

	if top <= 0 {
		top = 20
	}

	client := &http.Client{Timeout: 10 * time.Second}
	return monitor.FetchGoroutineGroups(client, target.URL, top)
}

func (a *App) GetExpvars(targetID string) (map[string]any, error) {
	target, ok := a.connections.Get(targetID)
	if !ok {
		return nil, fmt.Errorf("target not found")
	}

	client := &http.Client{Timeout: 5 * time.Second}
	metrics, ts, err := expvar.Fetch(client, target.URL)
	if err != nil {
		return nil, err
	}

	return map[string]any{"timestamp": ts, "metrics": metrics}, nil
}

// --- Trace bindings ---

func (a *App) GetTraceData(profileID string) (*traceparser.TraceData, error) {
	rec, err := a.storage.GetProfile(profileID)
	if err != nil {
		return nil, err
	}
	if rec.Type != "trace" && rec.Format != "jfr" {
		return nil, fmt.Errorf("not a trace profile")
	}

	a.mu.Lock()
	if cached, ok := a.traceCache[profileID]; ok {
		a.mu.Unlock()
		return cached, nil
	}
	a.mu.Unlock()

	data, err := a.storage.GetProfileData(profileID)
	if err != nil {
		return nil, err
	}

	var td *traceparser.TraceData
	if rec.Format == "jfr" {
		td, err = java.ParseJFRThreads(data)
	} else {
		td, err = traceparser.ParseTrace(data)
	}
	if err != nil {
		return nil, fmt.Errorf("parse trace: %w", err)
	}

	a.mu.Lock()
	a.traceCache[profileID] = td
	a.mu.Unlock()

	return td, nil
}

// --- Java profiling ---

func (a *App) DiscoverLocalJVMs() ([]java.LocalJVM, error) {
	return java.DiscoverLocalJVMs()
}

func (a *App) ConnectLocalJVM(pid int) (*connection.Target, error) {
	result, err := java.ConnectLocal(pid)
	if err != nil {
		return nil, fmt.Errorf("attach to JVM %d: %w", pid, err)
	}

	logger.Info("local JVM connected", "pid", result.PID, "mainClass", result.MainClass, "jmxPort", result.JMXPort, "url", result.URL)

	// Set PID on java monitor BEFORE connecting (so OnConnect's monitor start can use it)
	if a.javaMonitor != nil {
		a.javaMonitor.SetPid(result.URL, result.PID)
	}

	// Create target via connection store
	target, err := a.connections.ConnectJava(result.URL, "jmx")
	if err != nil {
		return nil, fmt.Errorf("create target: %w", err)
	}

	// Store PID and main class for lifecycle tracking
	a.connections.SetLocalPid(target.ID, result.PID, result.MainClass)

	t, ok := a.connections.Get(target.ID)
	if !ok {
		return target, nil
	}
	return t, nil
}

func (a *App) startJavaProfile(target *connection.Target, profileType string, durationSec int) (map[string]any, error) {
	pid := target.LocalPid
	targetID := target.ID
	targetURL := target.URL

	// For Java "heap": use jcmd class histogram (local) or bridge (remote)
	if profileType == "heap" {
		if pid > 0 {
			return a.startJavaHeapHistogram(target)
		}
		// For remote targets, fall through to JFR alloc recording
		profileType = "allocs"
	}

	// No local PID and no Java available for bridge — can't profile
	if pid == 0 && !java.CheckJavaAvailable() {
		return nil, fmt.Errorf("Java runtime required for profiling. Install JDK and ensure 'java' is in PATH.")
	}

	if durationSec <= 0 {
		durationSec = 10
	}

	jfrType := java.JFRProfileCPU
	switch profileType {
	case "allocs":
		jfrType = java.JFRProfileAlloc
	case "lock", "mutex", "block":
		jfrType = java.JFRProfileLock
	}

	// For snapshots, run in background and return immediately
	ctx, cancel := context.WithCancel(context.Background())
	rs := &recordingState{
		cancel: cancel,
		done:   make(chan struct{}),
		ptype:  profileType,
	}

	a.mu.Lock()
	a.activeCancel[targetID] = cancel
	a.activeRecording[targetID] = rs
	a.mu.Unlock()

	go func() {
		defer close(rs.done)

		var data []byte
		var err error

		if pid > 0 {
			// Local JVM: use jcmd JFR
			settings := java.JFRSettingsForProfile(jfrType)
			data, err = java.CollectJFRProfile(ctx, pid, durationSec, settings)
		} else {
			// Remote JVM: use JMX bridge JFR
			data, err = java.CollectJFRViaBridge(ctx, targetURL, durationSec, jfrType)
		}
		if err != nil {
			rs.err = err
			return
		}

		rec := &storage.ProfileRecord{
			ID:          uuid.New().String(),
			TargetURL:   targetURL,
			Type:        profileType,
			Format:      "jfr",
			Timestamp:   time.Now(),
			DurationSec: durationSec,
		}
		if err := a.storage.SaveProfile(rec, data); err != nil {
			rs.err = err
			return
		}
		rs.profileID = rec.ID
	}()

	return map[string]any{"status": "recording", "type": profileType}, nil
}

func (a *App) startJavaHeapHistogram(target *connection.Target) (map[string]any, error) {
	hist, err := java.CaptureHeapHistogram(target.LocalPid)
	if err != nil {
		return nil, fmt.Errorf("heap histogram: %w", err)
	}

	rec := &storage.ProfileRecord{
		ID:        uuid.New().String(),
		TargetURL: target.URL,
		Type:      "heap",
		Format:    "java-heap-histogram",
		Timestamp: time.Now(),
	}

	// Serialize histogram as JSON for storage
	histJSON, _ := json.Marshal(hist)
	if err := a.storage.SaveProfile(rec, histJSON); err != nil {
		return nil, err
	}

	return map[string]any{
		"profile": rec,
	}, nil
}

// --- AI analysis bindings ---

func (a *App) CheckClaudeAvailable() bool {
	provider := ai.Provider(a.settings.Get().AIProvider)
	return ai.CheckAvailable(provider)
}

func (a *App) GetSettings() map[string]string {
	s := a.settings.Get()
	return map[string]string{
		"aiProvider": s.AIProvider,
		"aiModel":    s.AIModel,
	}
}

func (a *App) UpdateSettings(s map[string]string) {
	current := a.settings.Get()
	if v, ok := s["aiProvider"]; ok {
		current.AIProvider = v
	}
	if v, ok := s["aiModel"]; ok {
		current.AIModel = v
	}
	a.settings.Update(current)
}

func (a *App) GetAvailableAIProviders() []ai.ProviderInfo {
	return a.analysis.ListProviders()
}

func (a *App) StartAnalysis(req ai.AnalysisRequest) error {
	_, events, err := a.analysis.StartAnalysis(req)
	if err != nil {
		return err
	}
	a.pumpToWailsBus(events)
	return nil
}

func (a *App) FollowUpAnalysis(req ai.FollowUpRequest) error {
	_, events, err := a.analysis.FollowUp(req)
	if err != nil {
		return err
	}
	a.pumpToWailsBus(events)
	return nil
}

func (a *App) CancelAnalysis() {
	a.analysis.Cancel()
}

func (a *App) pumpToWailsBus(events <-chan ai.StreamEvent) {
	go func() {
		for evt := range events {
			wailsRuntime.EventsEmit(a.ctx, "ai:event", evt)
		}
		wailsRuntime.EventsEmit(a.ctx, "ai:done", nil)
	}()
}

// --- Trace AI analysis bindings ---

func (a *App) StartTraceAnalysis(req ai.TraceAnalysisRequest) error {
	_, events, err := a.analysis.StartTraceAnalysis(req)
	if err != nil {
		return err
	}
	a.pumpToWailsBus(events)
	return nil
}

func (a *App) CheckJavaAvailable() bool {
	return java.CheckJavaAvailable()
}

func (a *App) GetJavaThreadDump(targetID string) (*java.JmxThreadDump, error) {
	target, ok := a.connections.Get(targetID)
	if !ok {
		return nil, fmt.Errorf("target not found")
	}
	return java.CaptureThreadDumpViaBridge(target.URL)
}

// --- Kubernetes bindings ---

func (a *App) DiscoverK8s(contextName, namespace, search string) (*k8s.DiscoveryResult, error) {
	kubeconfigPath := a.settings.Get().KubeconfigPath
	return k8s.Discover(kubeconfigPath, contextName, namespace, search)
}

// Keep individual endpoints for backward compat
func (a *App) ListK8sContexts() ([]k8s.KubeContext, error) {
	kubeconfigPath := a.settings.Get().KubeconfigPath
	return k8s.ListContexts(kubeconfigPath)
}

func (a *App) ListK8sNamespaces(contextName string) ([]string, error) {
	kubeconfigPath := a.settings.Get().KubeconfigPath
	return k8s.ListNamespaces(kubeconfigPath, contextName)
}

func (a *App) ListK8sPods(contextName, namespace, search string) ([]k8s.PodInfo, error) {
	kubeconfigPath := a.settings.Get().KubeconfigPath
	return k8s.ListPods(kubeconfigPath, contextName, namespace, search)
}

func (a *App) ConnectK8sPod(contextName, namespace, podName string, port int, language string) (*connection.Target, error) {
	if a.portForwardMgr == nil {
		a.portForwardMgr = k8s.NewPortForwardManager()
	}

	// Resolve the stable workload (Deployment etc.) behind the pod so the
	// connection survives pod restarts and redeploys.
	kubeconfigPath := a.settings.Get().KubeconfigPath
	wKind, wName, err := k8s.ResolveWorkload(kubeconfigPath, contextName, namespace, podName)
	if err != nil {
		logger.Warn("could not resolve workload, tracking pod directly", "pod", podName, "error", err)
		wKind, wName = "Pod", podName
	}

	// Reuse an existing target for the same workload instead of piling up
	// one sidebar entry per pod instance.
	if existing, ok := a.connections.FindK8sWorkload(contextName, namespace, wKind, wName, port); ok {
		logger.Info("reusing existing k8s target for workload", "workload", wKind+"/"+wName, "target", existing.ID)
		return a.reconnectK8sToPod(existing.ID, existing, podName)
	}

	// Create a temporary target ID
	targetID := uuid.New().String()

	// Start port-forward
	localPort, err := a.portForwardMgr.Start(contextName, namespace, podName, port, targetID)
	if err != nil {
		return nil, fmt.Errorf("port-forward: %w", err)
	}

	// Connect based on language (port-forward is already ready)
	var target *connection.Target
	url := fmt.Sprintf("localhost:%d", localPort)

	if language == "java" {
		target, err = a.connections.ConnectJava(url, "jmx")
	} else {
		httpURL := fmt.Sprintf("http://localhost:%d", localPort)
		target, err = a.connections.Connect(httpURL)
	}
	if err != nil {
		a.portForwardMgr.Stop(targetID)
		return nil, fmt.Errorf("connect: %w", err)
	}

	// Reassign port-forward to the real target ID (without restarting)
	a.portForwardMgr.Reassign(targetID, target.ID)

	// Store K8s metadata; label with the stable workload name, not the
	// ephemeral pod instance name.
	a.connections.SetK8sInfo(target.ID, contextName, namespace, podName, port)
	a.connections.SetK8sWorkload(target.ID, wKind, wName)
	a.connections.SetLabel(target.ID, wName)

	t, ok := a.connections.Get(target.ID)
	if !ok {
		return target, nil
	}
	return t, nil
}

// --- Source directory bindings ---

func (a *App) BrowseSourceDir() (string, error) {
	dir, err := wailsRuntime.OpenDirectoryDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title: "Select Source Directory",
	})
	if err != nil {
		return "", err
	}
	return dir, nil
}

func (a *App) SetSourceDir(targetID, path string) error {
	return a.connections.SetSourceDir(targetID, path)
}

func (a *App) GetSourceDir(targetID string) (string, error) {
	target, ok := a.connections.Get(targetID)
	if !ok {
		return "", fmt.Errorf("target not found")
	}
	return target.SourceDir, nil
}

// --- Process info / discovery bindings ---

func (a *App) GetProcessInfo(targetID string) (map[string]any, error) {
	target, ok := a.connections.Get(targetID)
	if !ok {
		return nil, fmt.Errorf("target not found")
	}

	client := &http.Client{Timeout: 5 * time.Second}
	info := map[string]any{}

	if resp, err := client.Get(target.URL + "/debug/pprof/cmdline"); err == nil {
		defer resp.Body.Close()
		if resp.StatusCode == http.StatusOK {
			body, _ := readBody(resp)
			if body != "" {
				info["cmdline"] = splitCmdline(body)
			}
		}
	}

	return info, nil
}

func (a *App) GetAvailableProfiles(targetID string) (any, error) {
	target, ok := a.connections.Get(targetID)
	if !ok {
		return nil, fmt.Errorf("target not found")
	}
	return profiler.FetchAvailableProfiles(a.ctx, target.URL)
}

func (a *App) ExportProfileData(id string) ([]byte, error) {
	data, err := a.storage.GetProfileData(id)
	if err != nil {
		logger.Error("ExportProfileData failed", "id", id, "error", err)
		return nil, err
	}
	logger.Debug("ExportProfileData", "id", id, "bytes", len(data))
	return data, nil
}

// ExportProfileToFile writes the profile data to a user-chosen path via the
// native save dialog. This avoids the Blob + <a>.click() download path which
// can be unreliable in the WKWebView used by Wails.
func (a *App) ExportProfileToFile(id string) (string, error) {
	data, err := a.storage.GetProfileData(id)
	if err != nil {
		logger.Error("ExportProfileToFile fetch failed", "id", id, "error", err)
		return "", err
	}

	rec, err := a.storage.GetProfile(id)
	ext := ".pb.gz"
	if err == nil && rec.Type == "trace" {
		ext = ".trace"
	}

	path, err := wailsRuntime.SaveFileDialog(a.ctx, wailsRuntime.SaveDialogOptions{
		Title:           "Save profile",
		DefaultFilename: id + ext,
	})
	if err != nil {
		logger.Error("SaveFileDialog failed", "error", err)
		return "", err
	}
	if path == "" {
		// User canceled
		return "", nil
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		logger.Error("write profile file failed", "path", path, "error", err)
		return "", err
	}
	logger.Info("profile exported", "path", path, "bytes", len(data))
	return path, nil
}

// LogFrontend lets the frontend write log lines to the same log sink the Go
// side uses. Useful for debugging production Wails builds where the browser
// DevTools are not available.
func (a *App) LogFrontend(level, msg string) {
	switch level {
	case "error":
		logger.Error("frontend: " + msg)
	case "warn":
		logger.Warn("frontend: " + msg)
	case "debug":
		logger.Debug("frontend: " + msg)
	default:
		logger.Info("frontend: " + msg)
	}
}

// --- Helpers ---

func (a *App) saveCollected(collected *profiler.CollectedProfile) (*storage.ProfileRecord, error) {
	rec := &storage.ProfileRecord{
		ID:          uuid.New().String(),
		TargetURL:   collected.TargetURL,
		Type:        string(collected.Type),
		Timestamp:   collected.Timestamp,
		DurationSec: collected.DurationSec,
	}
	return rec, a.storage.SaveProfile(rec, collected.Data)
}

func readBody(resp *http.Response) (string, error) {
	body := make([]byte, 0, 4096)
	buf := make([]byte, 4096)
	for {
		n, err := resp.Body.Read(buf)
		if n > 0 {
			body = append(body, buf[:n]...)
		}
		if err != nil {
			break
		}
	}
	s := string(body)
	for len(s) > 0 && s[len(s)-1] == 0 {
		s = s[:len(s)-1]
	}
	return s, nil
}

func splitCmdline(raw string) []string {
	var parts []string
	start := 0
	for i := range len(raw) {
		if raw[i] == 0 {
			if start < i {
				parts = append(parts, raw[start:i])
			}
			start = i + 1
		}
	}
	if start < len(raw) {
		parts = append(parts, raw[start:])
	}
	return parts
}
