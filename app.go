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
	cpuMonitor  *monitor.CpuService
	collector   *profiler.Collector

	mu              sync.Mutex
	activeCancel    map[string]context.CancelFunc
	activeRecording map[string]*recordingState
	traceCache      map[string]*traceparser.TraceData

	analysisCancel    context.CancelFunc
	analysisSessionID string
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

	for _, t := range connStore.List() {
		monitorSvc.StartTarget(t.ID, t.URL)
	}

	connStore.OnConnect = func(id, url string) { monitorSvc.StartTarget(id, url) }
	connStore.OnDisconnect = func(id string) {
		monitorSvc.StopTarget(id)
		cpuMonitorSvc.StopTarget(id)
	}

	logger.Info("GoProfiler desktop started")
}

func (a *App) shutdown(ctx context.Context) {
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
	return a.connections.Reconnect(id)
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
	if rec.Type != "trace" {
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

	td, err := traceparser.ParseTrace(data)
	if err != nil {
		return nil, fmt.Errorf("parse trace: %w", err)
	}

	a.mu.Lock()
	a.traceCache[profileID] = td
	a.mu.Unlock()

	return td, nil
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
	}
}

func (a *App) UpdateSettings(s map[string]string) {
	current := a.settings.Get()
	if v, ok := s["aiProvider"]; ok {
		current.AIProvider = v
	}
	a.settings.Update(current)
}

func (a *App) GetAvailableAIProviders() []map[string]any {
	providers := []struct {
		id, name string
	}{
		{"claude", "Claude Code"},
		{"gh-copilot", "GitHub Copilot"},
	}
	var result []map[string]any
	for _, p := range providers {
		result = append(result, map[string]any{
			"id":        p.id,
			"name":      p.name,
			"available": ai.CheckAvailable(ai.Provider(p.id)),
		})
	}
	return result
}

type AnalysisRequest struct {
	TargetID     string            `json:"targetId"`
	ProfileID    string            `json:"profileId"`
	Mode         string            `json:"mode"` // "explain", "optimize", "explain-function"
	ProfileType  string            `json:"profileType,omitempty"`
	FunctionName string            `json:"functionName,omitempty"`
	Functions       []ai.FunctionInfo `json:"functions,omitempty"`
	PermissionLevel string            `json:"permissionLevel,omitempty"` // "read-only", "edit-files", "full"
}

func (a *App) StartAnalysis(req AnalysisRequest) error {
	// Get source directory — try by target ID first, then search all targets by URL
	sourceDir := ""
	if req.TargetID != "" {
		if target, ok := a.connections.Get(req.TargetID); ok {
			sourceDir = target.SourceDir
		} else {
			// Search by URL in case targetId is actually a URL
			for _, t := range a.connections.List() {
				if t.URL == req.TargetID {
					sourceDir = t.SourceDir
					break
				}
			}
		}
	}

	if sourceDir == "" {
		return fmt.Errorf("no source directory configured for this target")
	}

	// Cancel any existing analysis
	a.CancelAnalysis()

	// Build prompt
	var prompt string
	switch req.Mode {
	case "explain":
		prompt = ai.BuildExplainPrompt(req.Functions, sourceDir, req.ProfileType)
	case "optimize":
		prompt = ai.BuildOptimizePrompt(req.Functions, sourceDir, req.ProfileType)
	case "explain-function":
		prompt = ai.BuildExplainFunctionPrompt(req.FunctionName, req.Functions, req.ProfileType)
	default:
		return fmt.Errorf("unknown analysis mode: %s", req.Mode)
	}

	ctx, cancel := context.WithCancel(context.Background())
	a.analysisCancel = cancel

	a.analysisSessionID = "" // new session
	provider := ai.Provider(a.settings.Get().AIProvider)
	permLevel := ai.PermissionLevel(req.PermissionLevel)
	if permLevel == "" {
		permLevel = ai.PermReadOnly
	}
	events, err := ai.RunWithProvider(ctx, provider, sourceDir, prompt, "", permLevel)
	if err != nil {
		cancel()
		return err
	}

	// Stream events to frontend via Wails events, capture session ID
	go func() {
		defer cancel()
		for evt := range events {
			if evt.SessionID != "" {
				a.analysisSessionID = evt.SessionID
			}
			wailsRuntime.EventsEmit(a.ctx, "ai:event", evt)
		}
		wailsRuntime.EventsEmit(a.ctx, "ai:done", nil)
	}()

	return nil
}

type FollowUpRequest struct {
	TargetURL       string `json:"targetUrl"`
	Message         string `json:"message"`
	PermissionLevel string `json:"permissionLevel,omitempty"`
}

func (a *App) FollowUpAnalysis(req FollowUpRequest) error {
	a.CancelAnalysis()

	// Look up source dir by target URL
	sourceDir := ""
	for _, t := range a.connections.List() {
		if t.URL == req.TargetURL {
			sourceDir = t.SourceDir
			break
		}
	}
	if sourceDir == "" {
		return fmt.Errorf("no source directory configured for this target")
	}

	ctx, cancel := context.WithCancel(context.Background())
	a.analysisCancel = cancel

	provider := ai.Provider(a.settings.Get().AIProvider)
	// Resume the existing session if we have one
	followPermLevel := ai.PermissionLevel(req.PermissionLevel)
	if followPermLevel == "" {
		followPermLevel = ai.PermReadOnly
	}
	events, err := ai.RunWithProvider(ctx, provider, sourceDir, req.Message, a.analysisSessionID, followPermLevel)
	if err != nil {
		cancel()
		return err
	}

	go func() {
		defer cancel()
		for evt := range events {
			if evt.SessionID != "" {
				a.analysisSessionID = evt.SessionID
			}
			wailsRuntime.EventsEmit(a.ctx, "ai:event", evt)
		}
		wailsRuntime.EventsEmit(a.ctx, "ai:done", nil)
	}()

	return nil
}

func (a *App) CancelAnalysis() {
	if a.analysisCancel != nil {
		a.analysisCancel()
		a.analysisCancel = nil
	}
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
	return a.storage.GetProfileData(id)
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
