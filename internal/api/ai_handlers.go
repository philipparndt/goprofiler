package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/philipparndt/goprofiler/internal/ai"
)

// --- Source directory HTTP endpoints ---

func (h *Handler) getSourceDir(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	target, ok := h.connections.Get(id)
	if !ok {
		writeError(w, http.StatusNotFound, "target not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"sourceDir": target.SourceDir})
}

func (h *Handler) setSourceDir(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		SourceDir string `json:"sourceDir"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body: "+err.Error())
		return
	}
	if err := h.connections.SetSourceDir(id, body.SourceDir); err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- AI HTTP endpoints ---

func (h *Handler) aiProviders(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.analysis.ListProviders())
}

func (h *Handler) aiAnalyze(w http.ResponseWriter, r *http.Request) {
	var req ai.AnalysisRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body: "+err.Error())
		return
	}
	streamID, _, err := h.analysis.StartAnalysis(req)
	if err != nil {
		writeError(w, aiErrorStatus(err), err.Error())
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]string{"streamId": streamID})
}

func (h *Handler) aiTraceAnalyze(w http.ResponseWriter, r *http.Request) {
	var req ai.TraceAnalysisRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body: "+err.Error())
		return
	}
	streamID, _, err := h.analysis.StartTraceAnalysis(req)
	if err != nil {
		writeError(w, aiErrorStatus(err), err.Error())
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]string{"streamId": streamID})
}

func (h *Handler) aiFollowUp(w http.ResponseWriter, r *http.Request) {
	var req ai.FollowUpRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body: "+err.Error())
		return
	}
	streamID, _, err := h.analysis.FollowUp(req)
	if err != nil {
		writeError(w, aiErrorStatus(err), err.Error())
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]string{"streamId": streamID})
}

func (h *Handler) aiCancel(w http.ResponseWriter, r *http.Request) {
	h.analysis.Cancel()
	w.WriteHeader(http.StatusNoContent)
}

// aiStream serves analysis events to the browser as Server-Sent Events.
func (h *Handler) aiStream(w http.ResponseWriter, r *http.Request) {
	streamID := chi.URLParam(r, "streamId")
	events, ok := h.analysis.Subscribe(streamID)
	if !ok {
		writeError(w, http.StatusNotFound, "stream not found")
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming not supported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	ctx := r.Context()
	heartbeat := time.NewTicker(15 * time.Second)
	defer heartbeat.Stop()

	writeSSEEvent := func(event string, payload any) error {
		data, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		_, err = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, data)
		if err != nil {
			return err
		}
		flusher.Flush()
		return nil
	}

	for {
		select {
		case <-ctx.Done():
			return
		case <-heartbeat.C:
			if _, err := fmt.Fprint(w, ": ping\n\n"); err != nil {
				return
			}
			flusher.Flush()
		case evt, ok := <-events:
			if !ok {
				// Channel closed — analysis finished or was canceled.
				_ = writeSSEEvent("ai:done", nil)
				return
			}
			if err := writeSSEEvent("ai:event", evt); err != nil {
				return
			}
		}
	}
}

// aiErrorStatus maps a service error to an HTTP status. Missing source-dir and
// validation errors should be 400; unknown target is 404; everything else 500.
func aiErrorStatus(err error) int {
	if err == nil {
		return http.StatusOK
	}
	msg := err.Error()
	switch {
	case contains(msg, "no source directory"),
		contains(msg, "unknown analysis mode"),
		contains(msg, "unknown trace analysis mode"),
		contains(msg, "required for"),
		contains(msg, "out of range"):
		return http.StatusBadRequest
	case contains(msg, "not found"):
		return http.StatusNotFound
	case errors.Is(err, context.Canceled):
		return http.StatusGone
	default:
		return http.StatusInternalServerError
	}
}

func contains(s, sub string) bool {
	return len(sub) > 0 && len(s) >= len(sub) && indexOf(s, sub) >= 0
}

func indexOf(s, sub string) int {
	n := len(sub)
	if n == 0 {
		return 0
	}
	for i := 0; i+n <= len(s); i++ {
		if s[i:i+n] == sub {
			return i
		}
	}
	return -1
}
