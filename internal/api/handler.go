package api

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/pprof/profile"
	"github.com/google/uuid"
	vlog "github1.vg.vector.int/pes/vehub-vlog-go"

	"github.com/philipparndt/goprofiler/internal/connection"
	"github.com/philipparndt/goprofiler/internal/flamegraph"
	"github.com/philipparndt/goprofiler/internal/monitor"
	"github.com/philipparndt/goprofiler/internal/profiler"
	"github.com/philipparndt/goprofiler/internal/storage"
)

type Handler struct {
	connections *connection.Store
	storage     *storage.Store
	collector   *profiler.Collector
	monitor     *monitor.Service

	mu           sync.Mutex
	activeCancel map[string]context.CancelFunc
}

func NewHandler(connections *connection.Store, storage *storage.Store, monitorSvc *monitor.Service) *Handler {
	return &Handler{
		connections:  connections,
		storage:      storage,
		collector:    profiler.NewCollector(),
		monitor:      monitorSvc,
		activeCancel: make(map[string]context.CancelFunc),
	}
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()

	r.Route("/targets", func(r chi.Router) {
		r.Get("/", h.listTargets)
		r.Post("/", h.connectTarget)
		r.Delete("/{id}", h.disconnectTarget)
		r.Post("/{id}/profiles", h.startProfile)
		r.Delete("/{id}/profiles/active", h.cancelProfile)
		r.Get("/{id}/memstats/history", h.getMemStatsHistory)

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
		r.Get("/{id}/raw", h.exportProfile)
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

	ptype := profiler.ProfileType(req.Type)

	// Handle "all_snapshots" special case
	if req.Type == "all_snapshots" {
		types := []profiler.ProfileType{profiler.Heap, profiler.Goroutine, profiler.Block, profiler.Mutex}
		var results []storage.ProfileRecord

		for _, pt := range types {
			collected, err := h.collector.CollectSnapshot(r.Context(), target.URL, pt)
			if err != nil {
				vlog.Error("snapshot failed", "type", pt, "error", err)
				continue
			}
			rec, err := h.saveCollected(collected)
			if err != nil {
				vlog.Error("save failed", "type", pt, "error", err)
				continue
			}
			results = append(results, *rec)
		}

		writeJSON(w, http.StatusOK, results)
		return
	}

	if ptype == profiler.CPU {
		ctx, cancel := context.WithCancel(context.Background())
		h.mu.Lock()
		h.activeCancel[targetID] = cancel
		h.mu.Unlock()

		defer func() {
			h.mu.Lock()
			delete(h.activeCancel, targetID)
			h.mu.Unlock()
		}()

		collected, err := h.collector.CollectCPU(ctx, target.URL, req.DurationSec)
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
	}
	h.mu.Unlock()

	if !ok {
		writeError(w, http.StatusNotFound, "no active profiling session")
		return
	}

	w.WriteHeader(http.StatusNoContent)
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

func (h *Handler) listProfiles(w http.ResponseWriter, r *http.Request) {
	typeFilter := r.URL.Query().Get("type")
	targetFilter := r.URL.Query().Get("target")
	profiles, err := h.storage.ListProfiles(typeFilter, targetFilter)
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

	prof, err := profile.ParseData(data)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to parse profile: "+err.Error())
		return
	}

	result := flamegraph.Convert(prof)
	callTree := flamegraph.BuildCallTree(prof)

	resp := map[string]any{
		"id":           rec.ID,
		"targetURL":    rec.TargetURL,
		"type":         rec.Type,
		"timestamp":    rec.Timestamp,
		"durationSec":  rec.DurationSec,
		"size":         rec.Size,
		"label":        rec.Label,
		"flameGraph":   result.FlameGraph,
		"topFunctions": result.TopFunctions,
		"callTree":     callTree,
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

func (h *Handler) exportProfile(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	data, err := h.storage.GetProfileData(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", "attachment; filename="+id+".pb.gz")
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

	writeJSON(w, http.StatusOK, map[string]any{
		"flameGraph":   result.FlameGraph,
		"topFunctions": result.TopFunctions,
		"type":         "diff",
	})
}
