package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/pprof/profile"
	"github.com/google/uuid"
	"github.com/philipparndt/go-logger"

	"github.com/philipparndt/goprofiler/internal/connection"
	"github.com/philipparndt/goprofiler/internal/k8s"
	"github.com/philipparndt/goprofiler/internal/expvar"
	"github.com/philipparndt/goprofiler/internal/flamegraph"
	"github.com/philipparndt/goprofiler/internal/traceparser"
	"github.com/philipparndt/goprofiler/internal/monitor"
	"github.com/philipparndt/goprofiler/internal/profiler"
	"github.com/philipparndt/goprofiler/internal/storage"
)

type recordingState struct {
	cancel    context.CancelFunc
	done      chan struct{}
	profileID string
	err       error
	ptype     string
}

type Handler struct {
	connections *connection.Store
	storage     *storage.Store
	collector   *profiler.Collector
	monitor     *monitor.Service
	cpuMonitor  *monitor.CpuService
	k8sConfig   *K8sConfig

	mu              sync.Mutex
	activeCancel    map[string]context.CancelFunc
	activeRecording map[string]*recordingState
	traceCache      map[string]*traceparser.TraceData
}

func NewHandler(connections *connection.Store, storage *storage.Store, monitorSvc *monitor.Service, cpuMonitorSvc *monitor.CpuService) *Handler {
	return &Handler{
		connections:  connections,
		storage:      storage,
		collector:    profiler.NewCollector(),
		monitor:      monitorSvc,
		cpuMonitor:   cpuMonitorSvc,
		activeCancel:    make(map[string]context.CancelFunc),
		activeRecording: make(map[string]*recordingState),
		traceCache:      make(map[string]*traceparser.TraceData),
	}
}

func (h *Handler) SetK8sConfig(cfg *K8sConfig) {
	h.k8sConfig = cfg
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()

	r.Route("/targets", func(r chi.Router) {
		r.Get("/", h.listTargets)
		r.Post("/", h.connectTarget)
		r.Delete("/{id}", h.disconnectTarget)
		r.Post("/{id}/profiles", h.startProfile)
		r.Get("/{id}/profiles/active", h.getRecordingStatus)
		r.Post("/{id}/profiles/stop", h.stopRecording)
		r.Delete("/{id}/profiles/active", h.cancelProfile)
		r.Get("/{id}/memstats/history", h.getMemStatsHistory)
		r.Get("/{id}/cpu/history", h.getCpuHistory)
		r.Post("/{id}/cpu/enable", h.enableCpuMonitoring)
		r.Post("/{id}/cpu/disable", h.disableCpuMonitoring)
		r.Get("/{id}/process-info", h.getProcessInfo)
		r.Get("/{id}/profiles/available", h.getAvailableProfiles)
		r.Get("/{id}/goroutine-groups", h.getGoroutineGroups)
		r.Get("/{id}/expvars", h.getExpvars)

		r.Get("/saved", h.listSavedTargets)
		r.Post("/saved/{id}/reconnect", h.reconnectTarget)
		r.Delete("/saved/{id}", h.removeSavedTarget)
	})

	r.Route("/profiles", func(r chi.Router) {
		r.Get("/", h.listProfiles)
		r.Get("/diff", h.diffProfiles)
		r.Get("/{id}", h.getProfile)
		r.Delete("/{id}", h.deleteProfile)
		r.Put("/{id}/label", h.updateLabel)
		r.Put("/{id}/tags", h.setTags)
		r.Post("/{id}/refresh", h.refreshProfile)
		r.Get("/{id}/raw", h.exportProfile)
		r.Get("/{id}/trace-data", h.getTraceData)
	})

	r.Get("/tags", h.listTags)

	r.Route("/k8s", func(r chi.Router) {
		r.Get("/discover", h.discoverK8s)
		r.Get("/contexts", h.listK8sContexts)
		r.Get("/namespaces", h.listK8sNamespaces)
		r.Get("/pods", h.listK8sPods)
		r.Post("/connect", h.connectK8sPod)
	})

	return r
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	http.Error(w, msg, status)
}

func (h *Handler) listTargets(w http.ResponseWriter, r *http.Request) {
	targets := h.connections.List()
	counts, _ := h.storage.ProfileCountsByTarget()

	type targetWithCount struct {
		*connection.Target
		ProfileCount int `json:"profileCount"`
	}

	result := make([]targetWithCount, len(targets))
	for i, t := range targets {
		result[i] = targetWithCount{Target: t, ProfileCount: counts[t.URL]}
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *Handler) connectTarget(w http.ResponseWriter, r *http.Request) {
	var req struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if req.URL == "" {
		writeError(w, http.StatusBadRequest, "url is required")
		return
	}

	target, err := h.connections.Connect(req.URL)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, target)
}

func (h *Handler) disconnectTarget(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// Cancel any active profiling
	h.mu.Lock()
	if cancel, ok := h.activeCancel[id]; ok {
		cancel()
		delete(h.activeCancel, id)
	}
	h.mu.Unlock()

	if err := h.connections.Disconnect(id); err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) listSavedTargets(w http.ResponseWriter, r *http.Request) {
	targets := h.connections.ListSaved()
	counts, _ := h.storage.ProfileCountsByTarget()

	type targetWithCount struct {
		*connection.Target
		ProfileCount int `json:"profileCount"`
	}

	result := make([]targetWithCount, len(targets))
	for i, t := range targets {
		result[i] = targetWithCount{Target: t, ProfileCount: counts[t.URL]}
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *Handler) reconnectTarget(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// Check if K8s target needing fresh port-forward
	if h.k8sConfig != nil && h.k8sConfig.PortForwardMgr != nil {
		var saved *connection.Target
		if t, ok := h.connections.GetSaved(id); ok {
			saved = t
		}
		if saved != nil && saved.IsK8s() {
			h.k8sConfig.PortForwardMgr.Stop(id)
			localPort, err := h.k8sConfig.PortForwardMgr.Start(saved.K8sContext, saved.K8sNamespace, saved.K8sPod, saved.K8sPort, id)
			if err != nil {
				writeError(w, http.StatusBadGateway, "port-forward: "+err.Error())
				return
			}
			newURL := fmt.Sprintf("http://localhost:%d", localPort)
			if saved.Language == connection.LangJava {
				newURL = fmt.Sprintf("localhost:%d", localPort)
			}
			h.connections.UpdateURL(id, newURL)
		}
	}

	target, err := h.connections.Reconnect(id)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, target)
}

func (h *Handler) removeSavedTarget(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.connections.Remove(id); err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) startProfile(w http.ResponseWriter, r *http.Request) {
	targetID := chi.URLParam(r, "id")

	target, ok := h.connections.Get(targetID)
	if !ok {
		writeError(w, http.StatusNotFound, "target not found")
		return
	}

	var req struct {
		Type        string `json:"type"`
		DurationSec int    `json:"durationSec"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	// Java targets cannot be profiled via pprof
	if target.Language == connection.LangJava {
		writeError(w, http.StatusBadRequest,
			"Java profiling is not yet available for remote JMX targets. "+
				"Use the desktop app with 'Local Java' connection, or capture a JFR recording externally.")
		return
	}

	ptype := profiler.ProfileType(req.Type)

	// Handle "all_snapshots" special case
	if req.Type == "all_snapshots" {
		types := []profiler.ProfileType{profiler.Heap, profiler.Goroutine, profiler.Block, profiler.Mutex, profiler.Allocs, profiler.ThreadCreate}
		var results []storage.ProfileRecord

		for _, pt := range types {
			collected, err := h.collector.CollectSnapshot(r.Context(), target.URL, pt)
			if err != nil {
				logger.Error("snapshot failed", "type", pt, "error", err)
				continue
			}
			rec, err := h.saveCollected(collected)
			if err != nil {
				logger.Error("save failed", "type", pt, "error", err)
				continue
			}
			results = append(results, *rec)
		}

		writeJSON(w, http.StatusOK, results)
		return
	}

	if ptype == profiler.CPU || ptype == profiler.Trace {
		ctx, cancel := context.WithCancel(context.Background())

		rs := &recordingState{
			cancel: cancel,
			done:   make(chan struct{}),
			ptype:  string(ptype),
		}

		h.mu.Lock()
		h.activeCancel[targetID] = cancel
		h.activeRecording[targetID] = rs
		h.mu.Unlock()

		// Run recording in background goroutine
		go func() {
			defer close(rs.done)

			var collected *profiler.CollectedProfile
			var err error
			if ptype == profiler.Trace {
				collected, err = h.collector.CollectTrace(ctx, target.URL, req.DurationSec)
			} else {
				collected, err = h.collector.CollectCPU(ctx, target.URL, req.DurationSec)
			}

			if err != nil {
				// Check if we got data despite the error (context cancellation with partial data)
				if collected != nil && len(collected.Data) > 0 {
					// Save partial data
					if rec, saveErr := h.saveCollected(collected); saveErr == nil {
						rs.profileID = rec.ID
					} else {
						rs.err = saveErr
					}
				} else {
					rs.err = err
				}
				return
			}

			rec, err := h.saveCollected(collected)
			if err != nil {
				rs.err = err
				return
			}
			rs.profileID = rec.ID
		}()

		writeJSON(w, http.StatusAccepted, map[string]string{
			"status": "recording",
			"type":   string(ptype),
		})
		return
	}

	// Snapshot profiles
	collected, err := h.collector.CollectSnapshot(r.Context(), target.URL, ptype)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	rec, err := h.saveCollected(collected)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, rec)
}

func (h *Handler) saveCollected(collected *profiler.CollectedProfile) (*storage.ProfileRecord, error) {
	rec := &storage.ProfileRecord{
		ID:          uuid.New().String(),
		TargetURL:   collected.TargetURL,
		Type:        string(collected.Type),
		Timestamp:   collected.Timestamp,
		DurationSec: collected.DurationSec,
	}

	return rec, h.storage.SaveProfile(rec, collected.Data)
}

func (h *Handler) cancelProfile(w http.ResponseWriter, r *http.Request) {
	targetID := chi.URLParam(r, "id")

	h.mu.Lock()
	cancel, ok := h.activeCancel[targetID]
	if ok {
		cancel()
		delete(h.activeCancel, targetID)
		delete(h.activeRecording, targetID)
	}
	h.mu.Unlock()

	if !ok {
		writeError(w, http.StatusNotFound, "no active profiling session")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) getRecordingStatus(w http.ResponseWriter, r *http.Request) {
	targetID := chi.URLParam(r, "id")

	h.mu.Lock()
	rs, ok := h.activeRecording[targetID]
	h.mu.Unlock()

	if !ok {
		writeJSON(w, http.StatusOK, map[string]string{"status": "idle"})
		return
	}

	select {
	case <-rs.done:
		// Recording finished
		h.mu.Lock()
		delete(h.activeCancel, targetID)
		delete(h.activeRecording, targetID)
		h.mu.Unlock()

		if rs.err != nil {
			writeJSON(w, http.StatusOK, map[string]string{
				"status": "failed",
				"error":  rs.err.Error(),
			})
		} else {
			writeJSON(w, http.StatusOK, map[string]string{
				"status":    "done",
				"profileId": rs.profileID,
			})
		}
	default:
		writeJSON(w, http.StatusOK, map[string]string{
			"status": "recording",
			"type":   rs.ptype,
		})
	}
}

func (h *Handler) stopRecording(w http.ResponseWriter, r *http.Request) {
	targetID := chi.URLParam(r, "id")

	h.mu.Lock()
	rs, ok := h.activeRecording[targetID]
	cancel, hasCancel := h.activeCancel[targetID]
	h.mu.Unlock()

	if !ok {
		writeError(w, http.StatusNotFound, "no active recording")
		return
	}

	// Cancel the pprof request to stop early
	if hasCancel {
		cancel()
	}

	// Wait for the goroutine to finish (it may save partial data)
	<-rs.done

	h.mu.Lock()
	delete(h.activeCancel, targetID)
	delete(h.activeRecording, targetID)
	h.mu.Unlock()

	if rs.profileID != "" {
		writeJSON(w, http.StatusOK, map[string]string{
			"status":    "done",
			"profileId": rs.profileID,
		})
	} else if rs.err != nil {
		writeJSON(w, http.StatusOK, map[string]string{
			"status": "no_data",
			"error":  "Recording stopped but no data was captured. Try a longer recording.",
		})
	} else {
		writeJSON(w, http.StatusOK, map[string]string{
			"status": "no_data",
			"error":  "No data captured",
		})
	}
}

func (h *Handler) getMemStatsHistory(w http.ResponseWriter, r *http.Request) {
	targetID := chi.URLParam(r, "id")

	target, ok := h.connections.Get(targetID)
	if !ok {
		writeError(w, http.StatusNotFound, "target not found")
		return
	}

	var since time.Time
	if s := r.URL.Query().Get("since"); s != "" {
		if ts, err := time.Parse(time.RFC3339Nano, s); err == nil {
			since = ts
		}
	}

	history := h.monitor.GetHistory(target.URL, since)
	writeJSON(w, http.StatusOK, history)
}

func (h *Handler) getCpuHistory(w http.ResponseWriter, r *http.Request) {
	targetID := chi.URLParam(r, "id")

	target, ok := h.connections.Get(targetID)
	if !ok {
		writeError(w, http.StatusNotFound, "target not found")
		return
	}

	var since time.Time
	if s := r.URL.Query().Get("since"); s != "" {
		if ts, err := time.Parse(time.RFC3339Nano, s); err == nil {
			since = ts
		}
	}

	history := h.cpuMonitor.GetHistory(target.URL, since)
	writeJSON(w, http.StatusOK, map[string]any{
		"points": history.Points,
		"active": h.cpuMonitor.IsActive(targetID),
	})
}

func (h *Handler) enableCpuMonitoring(w http.ResponseWriter, r *http.Request) {
	targetID := chi.URLParam(r, "id")

	target, ok := h.connections.Get(targetID)
	if !ok {
		writeError(w, http.StatusNotFound, "target not found")
		return
	}

	h.cpuMonitor.StartTarget(targetID, target.URL)
	writeJSON(w, http.StatusOK, map[string]string{"status": "enabled"})
}

func (h *Handler) disableCpuMonitoring(w http.ResponseWriter, r *http.Request) {
	targetID := chi.URLParam(r, "id")

	if _, ok := h.connections.Get(targetID); !ok {
		writeError(w, http.StatusNotFound, "target not found")
		return
	}

	h.cpuMonitor.StopTarget(targetID)
	writeJSON(w, http.StatusOK, map[string]string{"status": "disabled"})
}

func (h *Handler) getExpvars(w http.ResponseWriter, r *http.Request) {
	targetID := chi.URLParam(r, "id")

	target, ok := h.connections.Get(targetID)
	if !ok {
		writeError(w, http.StatusNotFound, "target not found")
		return
	}

	client := &http.Client{Timeout: 5 * time.Second}
	metrics, ts, err := expvar.Fetch(client, target.URL)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"timestamp": ts,
		"metrics":   metrics,
	})
}

func (h *Handler) getGoroutineGroups(w http.ResponseWriter, r *http.Request) {
	targetID := chi.URLParam(r, "id")

	target, ok := h.connections.Get(targetID)
	if !ok {
		writeError(w, http.StatusNotFound, "target not found")
		return
	}

	topN := 20
	if s := r.URL.Query().Get("top"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 {
			topN = n
		}
	}

	client := &http.Client{Timeout: 10 * time.Second}
	result, err := monitor.FetchGoroutineGroups(client, target.URL, topN)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func (h *Handler) getAvailableProfiles(w http.ResponseWriter, r *http.Request) {
	targetID := chi.URLParam(r, "id")

	target, ok := h.connections.Get(targetID)
	if !ok {
		writeError(w, http.StatusNotFound, "target not found")
		return
	}

	profiles, err := profiler.FetchAvailableProfiles(r.Context(), target.URL)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, profiles)
}

func (h *Handler) listProfiles(w http.ResponseWriter, r *http.Request) {
	typeFilter := r.URL.Query().Get("type")
	targetFilter := r.URL.Query().Get("target")
	tagFilter := r.URL.Query().Get("tag")
	profiles, err := h.storage.ListProfiles(typeFilter, targetFilter, tagFilter)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if profiles == nil {
		profiles = []storage.ProfileRecord{}
	}
	writeJSON(w, http.StatusOK, profiles)
}

func (h *Handler) getProfile(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	rec, err := h.storage.GetProfile(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	data, err := h.storage.GetProfileData(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Traces are binary, not pprof format -- return metadata only
	if rec.Type == "trace" {
		resp := map[string]any{
			"id":          rec.ID,
			"targetURL":   rec.TargetURL,
			"type":        rec.Type,
			"timestamp":   rec.Timestamp,
			"durationSec": rec.DurationSec,
			"size":        rec.Size,
			"label":       rec.Label,
			"tags":        rec.Tags,
			"traceType":   true,
		}
		writeJSON(w, http.StatusOK, resp)
		return
	}

	prof, err := profile.ParseData(data)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to parse profile: "+err.Error())
		return
	}

	// Apply pprof overhead filter if requested
	if r.URL.Query().Get("filter") == "pprof" {
		flamegraph.FilterPprofOverhead(prof)
	}

	// Determine value index override for heap profiles
	valueOverride := -1
	if r.URL.Query().Get("valueMode") == "alloc" && len(prof.SampleType) >= 4 {
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
		"id":           rec.ID,
		"targetURL":    rec.TargetURL,
		"type":         rec.Type,
		"timestamp":    rec.Timestamp,
		"durationSec":  rec.DurationSec,
		"size":         rec.Size,
		"label":        rec.Label,
		"tags":         rec.Tags,
		"flameGraph":   result.FlameGraph,
		"topFunctions": result.TopFunctions,
		"callTree":     callTree,
	}

	// For heap-like profiles, add summary with inuse and alloc totals
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
			"inuseObjects": summary["inuse_objects"],
			"inuseSpace":   summary["inuse_space"],
			"allocObjects": summary["alloc_objects"],
			"allocSpace":   summary["alloc_space"],
		}
	}

	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) deleteProfile(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.storage.DeleteProfile(id); err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) updateLabel(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req struct {
		Label string `json:"label"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if err := h.storage.UpdateLabel(id, req.Label); err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) setTags(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req struct {
		Tags []string `json:"tags"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	tagsJSON, _ := json.Marshal(req.Tags)
	if err := h.storage.SetTags(id, string(tagsJSON)); err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) refreshProfile(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	rec, err := h.storage.GetProfile(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	// Only allow refresh for snapshot types
	recordingTypes := map[string]bool{"cpu": true, "trace": true}
	if recordingTypes[rec.Type] {
		writeError(w, http.StatusBadRequest, "refresh is only available for snapshot profiles, not recordings")
		return
	}

	// Read old data before overwriting (for diff computation)
	oldData, _ := h.storage.GetProfileData(id)

	// Collect fresh snapshot
	ptype := profiler.ProfileType(rec.Type)
	collected, err := h.collector.CollectSnapshot(r.Context(), rec.TargetURL, ptype)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	// Overwrite existing data
	if err := h.storage.RefreshProfile(id, collected.Data, collected.Timestamp); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Evict caches
	h.mu.Lock()
	delete(h.traceCache, id)
	h.mu.Unlock()

	// Build response
	updated, _ := h.storage.GetProfile(id)
	if updated == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	resp := map[string]any{
		"id":          updated.ID,
		"targetURL":   updated.TargetURL,
		"type":        updated.Type,
		"timestamp":   updated.Timestamp,
		"durationSec": updated.DurationSec,
		"size":        updated.Size,
		"label":       updated.Label,
		"tags":        updated.Tags,
	}

	// Compute alloc diff if we have old data and it's a heap-like profile
	if oldData != nil && len(oldData) > 0 {
		oldProf, oldErr := profile.ParseData(oldData)
		newProf, newErr := profile.ParseData(collected.Data)
		if oldErr == nil && newErr == nil {
			// Find alloc_space index
			allocIdx := -1
			for i, st := range newProf.SampleType {
				if st.Type == "alloc_space" && st.Unit == "bytes" {
					allocIdx = i
					break
				}
			}
			if allocIdx >= 0 {
				// Apply pprof filter to both before diffing
				flamegraph.FilterPprofOverhead(oldProf)
				flamegraph.FilterPprofOverhead(newProf)
				// Compute diff: negate old, merge with new
				oldProf.Scale(-1)
				merged, mergeErr := profile.Merge([]*profile.Profile{oldProf, newProf})
				if mergeErr == nil {
					diffResult := flamegraph.Convert(merged, allocIdx)
					diffCallTree := flamegraph.BuildCallTree(merged, allocIdx)
					resp["refreshDiff"] = map[string]any{
						"flameGraph":   diffResult.FlameGraph,
						"topFunctions": diffResult.TopFunctions,
						"callTree":     diffCallTree,
					}
				}
			}
		}
	}

	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) listTags(w http.ResponseWriter, r *http.Request) {
	tags, err := h.storage.ListAllTags()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if tags == nil {
		tags = []string{}
	}
	writeJSON(w, http.StatusOK, tags)
}

func (h *Handler) getTraceData(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	rec, err := h.storage.GetProfile(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	if rec.Type != "trace" {
		writeError(w, http.StatusBadRequest, "not a trace profile")
		return
	}

	// Check cache
	h.mu.Lock()
	if cached, ok := h.traceCache[id]; ok {
		h.mu.Unlock()
		writeJSON(w, http.StatusOK, cached)
		return
	}
	h.mu.Unlock()

	data, err := h.storage.GetProfileData(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	td, err := traceparser.ParseTrace(data)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "parse trace: "+err.Error())
		return
	}

	// Cache
	h.mu.Lock()
	h.traceCache[id] = td
	h.mu.Unlock()

	writeJSON(w, http.StatusOK, td)
}

func (h *Handler) exportProfile(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	rec, err := h.storage.GetProfile(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	data, err := h.storage.GetProfileData(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	ext := ".pb.gz"
	if rec.Type == "trace" {
		ext = ".trace"
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", "attachment; filename="+id+ext)
	w.Write(data)
}

func (h *Handler) diffProfiles(w http.ResponseWriter, r *http.Request) {
	baseID := r.URL.Query().Get("base")
	compareID := r.URL.Query().Get("compare")

	if baseID == "" || compareID == "" {
		writeError(w, http.StatusBadRequest, "base and compare query parameters required")
		return
	}

	baseData, err := h.storage.GetProfileData(baseID)
	if err != nil {
		writeError(w, http.StatusNotFound, "base profile: "+err.Error())
		return
	}

	compareData, err := h.storage.GetProfileData(compareID)
	if err != nil {
		writeError(w, http.StatusNotFound, "compare profile: "+err.Error())
		return
	}

	baseProf, err := profile.ParseData(baseData)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "parse base: "+err.Error())
		return
	}

	compareProf, err := profile.ParseData(compareData)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "parse compare: "+err.Error())
		return
	}

	// Negate base profile values for diff
	baseProf.Scale(-1)

	merged, err := profile.Merge([]*profile.Profile{baseProf, compareProf})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "merge profiles: "+err.Error())
		return
	}

	result := flamegraph.Convert(merged)
	callTree := flamegraph.BuildCallTree(merged)

	baseRec, _ := h.storage.GetProfile(baseID)
	compareRec, _ := h.storage.GetProfile(compareID)

	resp := map[string]any{
		"flameGraph":   result.FlameGraph,
		"topFunctions": result.TopFunctions,
		"callTree":     callTree,
		"type":         "diff",
	}
	if baseRec != nil {
		resp["base"] = baseRec
	}
	if compareRec != nil {
		resp["compare"] = compareRec
	}

	writeJSON(w, http.StatusOK, resp)
}

// --- Kubernetes handlers ---

type K8sConfig struct {
	KubeconfigPath string
	PortForwardMgr *k8s.PortForwardManager
}

func (h *Handler) discoverK8s(w http.ResponseWriter, r *http.Request) {
	ctxName := r.URL.Query().Get("context")
	ns := r.URL.Query().Get("namespace")
	search := r.URL.Query().Get("search")
	kubeconfigPath := ""
	if h.k8sConfig != nil {
		kubeconfigPath = h.k8sConfig.KubeconfigPath
	}
	result, err := k8s.Discover(kubeconfigPath, ctxName, ns, search)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *Handler) listK8sContexts(w http.ResponseWriter, r *http.Request) {
	kubeconfigPath := ""
	if h.k8sConfig != nil {
		kubeconfigPath = h.k8sConfig.KubeconfigPath
	}
	contexts, err := k8s.ListContexts(kubeconfigPath)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, contexts)
}

func (h *Handler) listK8sNamespaces(w http.ResponseWriter, r *http.Request) {
	ctxName := r.URL.Query().Get("context")
	kubeconfigPath := ""
	if h.k8sConfig != nil {
		kubeconfigPath = h.k8sConfig.KubeconfigPath
	}
	namespaces, err := k8s.ListNamespaces(kubeconfigPath, ctxName)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, namespaces)
}

func (h *Handler) listK8sPods(w http.ResponseWriter, r *http.Request) {
	ctxName := r.URL.Query().Get("context")
	ns := r.URL.Query().Get("namespace")
	search := r.URL.Query().Get("search")
	kubeconfigPath := ""
	if h.k8sConfig != nil {
		kubeconfigPath = h.k8sConfig.KubeconfigPath
	}
	pods, err := k8s.ListPods(kubeconfigPath, ctxName, ns, search)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, pods)
}

func (h *Handler) connectK8sPod(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Context   string `json:"context"`
		Namespace string `json:"namespace"`
		Pod       string `json:"pod"`
		Port      int    `json:"port"`
		Language  string `json:"language"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	if h.k8sConfig == nil || h.k8sConfig.PortForwardMgr == nil {
		writeError(w, http.StatusInternalServerError, "K8s port-forward manager not configured")
		return
	}

	targetID := uuid.New().String()
	localPort, err := h.k8sConfig.PortForwardMgr.Start(req.Context, req.Namespace, req.Pod, req.Port, targetID)
	if err != nil {
		writeError(w, http.StatusBadGateway, "port-forward: "+err.Error())
		return
	}

	var target *connection.Target
	if req.Language == "java" {
		url := fmt.Sprintf("localhost:%d", localPort)
		target, err = h.connections.ConnectJava(url, "jmx")
	} else {
		url := fmt.Sprintf("http://localhost:%d", localPort)
		target, err = h.connections.Connect(url)
	}
	if err != nil {
		h.k8sConfig.PortForwardMgr.Stop(targetID)
		writeError(w, http.StatusBadGateway, "connect: "+err.Error())
		return
	}

	h.k8sConfig.PortForwardMgr.Reassign(targetID, target.ID)
	h.connections.SetK8sInfo(target.ID, req.Context, req.Namespace, req.Pod, req.Port)
	h.connections.SetLabel(target.ID, req.Pod)

	writeJSON(w, http.StatusOK, target)
}
