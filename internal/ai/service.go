package ai

import (
	"context"
	"errors"
	"fmt"
	"sync"

	"github.com/google/uuid"
	"github.com/philipparndt/go-logger"

	"github.com/philipparndt/goprofiler/internal/connection"
	"github.com/philipparndt/goprofiler/internal/settings"
	"github.com/philipparndt/goprofiler/internal/traceparser"
)

// TraceDataLoader loads parsed trace data for a profile ID. Provided by the
// hosting app (Wails App or HTTP Handler) so the service doesn't need to know
// how traces are stored or cached.
type TraceDataLoader interface {
	LoadTraceData(profileID string) (*traceparser.TraceData, error)
}

// AnalysisRequest is a profile-analysis request.
type AnalysisRequest struct {
	TargetID        string         `json:"targetId"`
	ProfileID       string         `json:"profileId"`
	Mode            string         `json:"mode"` // "explain", "optimize", "explain-function"
	ProfileType     string         `json:"profileType,omitempty"`
	FunctionName    string         `json:"functionName,omitempty"`
	Functions       []FunctionInfo `json:"functions,omitempty"`
	Format          string         `json:"format,omitempty"`          // "pprof", "jfr"
	PermissionLevel string         `json:"permissionLevel,omitempty"` // "read-only", "edit-files", "full"
}

// TraceAnalysisRequest is a trace-analysis request.
type TraceAnalysisRequest struct {
	TargetURL     string              `json:"targetUrl"`
	ProfileID     string              `json:"profileId"`
	Mode          string              `json:"mode"`
	GoroutineID   *uint64             `json:"goroutineId,omitempty"`
	BlockingIdx   *int                `json:"blockingIdx,omitempty"`
	Span          *GoroutineSpanInfo  `json:"span,omitempty"`
	GoroutineName string              `json:"goroutineName,omitempty"`
	AdjacentSpans []GoroutineSpanInfo `json:"adjacentSpans,omitempty"`
}

// FollowUpRequest continues an existing analysis session.
type FollowUpRequest struct {
	TargetURL       string `json:"targetUrl"`
	Message         string `json:"message"`
	PermissionLevel string `json:"permissionLevel,omitempty"`
}

// AnalysisService coordinates AI analysis runs. A single run is active at a
// time per instance; starting a new run cancels the previous.
//
// For the Claude provider, the service keeps a long-lived ClaudeSession around
// so follow-up turns don't pay the CLI cold-start cost. For the Copilot
// provider (and when the installed Claude CLI is too old to support streaming
// input), it falls back to a per-turn one-shot invocation.
type AnalysisService struct {
	connections *connection.Store
	settings    *settings.Store
	traces      TraceDataLoader

	mu        sync.Mutex
	sessionID string

	// streams holds per-turn event channels keyed by streamID. Entries are
	// removed when the turn ends (either by a `result` event on the Claude
	// session path, or by the Copilot one-shot relay exiting).
	streams map[string]chan StreamEvent

	// session + related bookkeeping for the Claude session path. Guarded by mu.
	session         *ClaudeSession
	currentOut      chan StreamEvent
	currentStreamID string

	// oneShotCancel cancels the currently-active Copilot (or fall-back) run.
	oneShotCancel context.CancelFunc

	// sessionUnsupported is set to true after we've observed the installed
	// Claude CLI reject our streaming-input flags. Once true, the Claude path
	// also goes through the one-shot code. Guarded by mu.
	sessionUnsupported bool
}

func NewAnalysisService(connections *connection.Store, settingsStore *settings.Store, traces TraceDataLoader) *AnalysisService {
	return &AnalysisService{
		connections: connections,
		settings:    settingsStore,
		traces:      traces,
		streams:     make(map[string]chan StreamEvent),
	}
}

// Subscribe returns the event channel for an active (or just-started) stream.
// Only one consumer per streamID is expected.
func (s *AnalysisService) Subscribe(streamID string) (<-chan StreamEvent, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	ch, ok := s.streams[streamID]
	return ch, ok
}

// ProviderInfo describes a supported AI provider and its current state.
type ProviderInfo struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Available bool   `json:"available"`
	Active    bool   `json:"active"`
}

// ListProviders returns all known AI providers with availability and a flag
// marking which one is currently selected in settings. This is the single
// source of truth — Wails bindings and HTTP handlers both call through here.
func (s *AnalysisService) ListProviders() []ProviderInfo {
	active := ""
	if s.settings != nil {
		active = s.settings.Get().AIProvider
	}
	defs := []struct{ id, name string }{
		{"claude", "Claude Code"},
		{"gh-copilot", "GitHub Copilot"},
	}
	out := make([]ProviderInfo, 0, len(defs))
	for _, d := range defs {
		out = append(out, ProviderInfo{
			ID:        d.id,
			Name:      d.name,
			Available: CheckAvailable(Provider(d.id)),
			Active:    d.id == active,
		})
	}
	return out
}

// StartAnalysis begins a profile-analysis run. Any prior run (session or
// one-shot) is terminated before the new one starts.
func (s *AnalysisService) StartAnalysis(req AnalysisRequest) (string, <-chan StreamEvent, error) {
	sourceDir := s.resolveSourceDirByID(req.TargetID)
	if sourceDir == "" {
		return "", nil, fmt.Errorf("no source directory configured for this target")
	}

	prompt, err := buildAnalysisPrompt(req, sourceDir)
	if err != nil {
		return "", nil, err
	}

	permLevel := PermissionLevel(req.PermissionLevel)
	if permLevel == "" {
		permLevel = PermReadOnly
	}

	return s.startFresh(sourceDir, prompt, permLevel)
}

// StartTraceAnalysis begins a trace-analysis run.
func (s *AnalysisService) StartTraceAnalysis(req TraceAnalysisRequest) (string, <-chan StreamEvent, error) {
	sourceDir := s.resolveSourceDirByURL(req.TargetURL)
	if sourceDir == "" {
		return "", nil, fmt.Errorf("no source directory configured for this target")
	}
	if s.traces == nil {
		return "", nil, fmt.Errorf("trace loader not configured")
	}

	td, err := s.traces.LoadTraceData(req.ProfileID)
	if err != nil {
		return "", nil, fmt.Errorf("load trace data: %w", err)
	}

	prompt, err := buildTracePrompt(req, td)
	if err != nil {
		return "", nil, err
	}

	return s.startFresh(sourceDir, prompt, PermReadOnly)
}

// FollowUp continues the current analysis session with a new message.
func (s *AnalysisService) FollowUp(req FollowUpRequest) (string, <-chan StreamEvent, error) {
	sourceDir := s.resolveSourceDirByURL(req.TargetURL)
	if sourceDir == "" {
		return "", nil, fmt.Errorf("no source directory configured for this target")
	}

	permLevel := PermissionLevel(req.PermissionLevel)
	if permLevel == "" {
		permLevel = PermReadOnly
	}

	provider := s.currentProvider()
	if provider == ProviderClaude && !s.sessionFallbackActive() {
		return s.followUpOnSession(sourceDir, req.Message, permLevel)
	}
	// Copilot or fall-back path: one-shot with resume-by-id semantics where
	// the provider supports it.
	s.mu.Lock()
	sessionID := s.sessionID
	s.mu.Unlock()
	return s.runOneShotTurn(sourceDir, req.Message, sessionID, permLevel, false /* preserveSessionID */)
}

// Cancel stops any running analysis. Safe to call when idle.
func (s *AnalysisService) Cancel() {
	s.closeClaudeSession()

	s.mu.Lock()
	cancel := s.oneShotCancel
	s.oneShotCancel = nil
	s.mu.Unlock()
	if cancel != nil {
		cancel()
	}
}

func (s *AnalysisService) currentProvider() Provider {
	if s.settings == nil {
		return ProviderClaude
	}
	return Provider(s.settings.Get().AIProvider)
}

func (s *AnalysisService) sessionFallbackActive() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.sessionUnsupported
}

// startFresh kills any prior session/turn and starts a new analysis. For the
// Claude provider (on a CLI that supports streaming input) it spawns a new
// ClaudeSession; otherwise it runs a single one-shot invocation.
func (s *AnalysisService) startFresh(sourceDir, prompt string, permLvl PermissionLevel) (string, <-chan StreamEvent, error) {
	// Clear any prior state.
	s.Cancel()

	s.mu.Lock()
	s.sessionID = ""
	provider := s.currentProvider()
	unsupported := s.sessionUnsupported
	s.mu.Unlock()

	if provider == ProviderClaude && !unsupported {
		streamID, out, err := s.startClaudeSession(sourceDir, prompt, permLvl)
		if errors.Is(err, ErrSessionUnsupported) {
			s.mu.Lock()
			s.sessionUnsupported = true
			s.mu.Unlock()
			logger.Warn("claude CLI too old for streaming input; falling back to one-shot mode")
			return s.runOneShotTurn(sourceDir, prompt, "", permLvl, true)
		}
		return streamID, out, err
	}

	return s.runOneShotTurn(sourceDir, prompt, "", permLvl, true)
}

// startClaudeSession spawns a fresh ClaudeSession, wires a forwarder goroutine,
// and sends the initial prompt. Returns the per-turn streamID and event channel.
func (s *AnalysisService) startClaudeSession(sourceDir, prompt string, permLvl PermissionLevel) (string, <-chan StreamEvent, error) {
	model := s.settings.Get().AIModel
	ctx, cancel := context.WithCancel(context.Background())
	session, err := StartClaudeSession(ctx, sourceDir, permLvl, model)
	if err != nil {
		cancel()
		return "", nil, err
	}

	s.mu.Lock()
	s.session = session
	s.mu.Unlock()

	// One forwarder per session distributes events to whichever per-turn
	// channel is currently registered.
	go s.sessionForwarder(session, cancel)

	return s.attachTurn(session, prompt)
}

// followUpOnSession reuses the live ClaudeSession for a follow-up turn. If the
// session's sourceDir or permission level no longer matches, the session is
// closed and a fresh one is spawned (paying a cold start for this turn).
func (s *AnalysisService) followUpOnSession(sourceDir, prompt string, permLvl PermissionLevel) (string, <-chan StreamEvent, error) {
	s.mu.Lock()
	session := s.session
	s.mu.Unlock()

	if session == nil || session.Closed() {
		return "", nil, fmt.Errorf("no active analysis to follow up on")
	}

	if session.SourceDir() != sourceDir || session.PermLevel() != permLvl {
		logger.Info("claude session being respawned due to changed source dir or permission level")
		s.closeClaudeSession()
		return s.startClaudeSession(sourceDir, prompt, permLvl)
	}

	return s.attachTurn(session, prompt)
}

// attachTurn registers a new per-turn event channel with the session
// forwarder and sends the prompt on the session's stdin.
func (s *AnalysisService) attachTurn(session *ClaudeSession, prompt string) (string, <-chan StreamEvent, error) {
	out := make(chan StreamEvent, 64)
	streamID := uuid.New().String()

	s.mu.Lock()
	// Defensively close any stale leftover per-turn channel. Shouldn't happen
	// in single-active-analysis mode but keeps us crash-safe.
	if s.currentOut != nil {
		close(s.currentOut)
		delete(s.streams, s.currentStreamID)
	}
	s.currentOut = out
	s.currentStreamID = streamID
	s.streams[streamID] = out
	s.mu.Unlock()

	if err := session.Send(prompt); err != nil {
		s.mu.Lock()
		if s.currentOut == out {
			s.currentOut = nil
			s.currentStreamID = ""
		}
		delete(s.streams, streamID)
		s.mu.Unlock()
		close(out)
		return "", nil, err
	}

	return streamID, out, nil
}

// sessionForwarder runs for the lifetime of a ClaudeSession. It reads the
// session's event channel and routes events to whichever per-turn channel is
// registered in s.currentOut at the moment. A `result` event ends the current
// turn — the per-turn channel is closed and the next turn starts fresh.
func (s *AnalysisService) sessionForwarder(session *ClaudeSession, sessionCancel context.CancelFunc) {
	defer sessionCancel()

	for evt := range session.Events() {
		if evt.SessionID != "" {
			s.mu.Lock()
			s.sessionID = evt.SessionID
			s.mu.Unlock()
		}

		s.mu.Lock()
		out := s.currentOut
		streamID := s.currentStreamID
		s.mu.Unlock()

		if out == nil {
			// No active turn — drop the event. In practice this should only
			// happen for events emitted after the user cancelled or the
			// panel closed.
			continue
		}

		out <- evt

		if evt.Type == "result" {
			s.mu.Lock()
			if s.currentOut == out {
				close(out)
				delete(s.streams, streamID)
				s.currentOut = nil
				s.currentStreamID = ""
			}
			s.mu.Unlock()
		}
	}

	// Session ended (Close() or process exit). Tear down any turn still
	// attached and clear the session pointer if it's still ours.
	s.mu.Lock()
	if s.currentOut != nil {
		close(s.currentOut)
		delete(s.streams, s.currentStreamID)
		s.currentOut = nil
		s.currentStreamID = ""
	}
	if s.session == session {
		s.session = nil
	}
	s.mu.Unlock()
}

// closeClaudeSession closes the active ClaudeSession (if any) and waits for
// the forwarder goroutine to finish tearing it down.
func (s *AnalysisService) closeClaudeSession() {
	s.mu.Lock()
	session := s.session
	s.mu.Unlock()

	if session != nil {
		session.Close() // triggers forwarder to close per-turn out and nil the session
	}
}

// runOneShotTurn is the legacy per-invocation path, used by Copilot and by the
// Claude fall-back when the CLI is too old for streaming input.
func (s *AnalysisService) runOneShotTurn(sourceDir, prompt, sessionID string, permLvl PermissionLevel, newSession bool) (string, <-chan StreamEvent, error) {
	s.mu.Lock()
	if s.oneShotCancel != nil {
		s.oneShotCancel()
		s.oneShotCancel = nil
	}
	if newSession {
		s.sessionID = ""
	}
	provider := s.currentProvider()
	ctx, cancel := context.WithCancel(context.Background())
	s.oneShotCancel = cancel
	s.mu.Unlock()

	events, err := RunWithProvider(ctx, provider, sourceDir, prompt, sessionID, permLvl)
	if err != nil {
		cancel()
		return "", nil, err
	}

	streamID := uuid.New().String()
	out := make(chan StreamEvent, 64)

	s.mu.Lock()
	s.streams[streamID] = out
	s.mu.Unlock()

	go func() {
		defer func() {
			close(out)
			s.mu.Lock()
			delete(s.streams, streamID)
			if s.oneShotCancel != nil {
				// best-effort: may already be nil-ed by Cancel or a new turn
			}
			s.mu.Unlock()
			cancel()
		}()
		for evt := range events {
			if evt.SessionID != "" {
				s.mu.Lock()
				s.sessionID = evt.SessionID
				s.mu.Unlock()
			}
			select {
			case out <- evt:
			case <-ctx.Done():
				return
			}
		}
	}()

	return streamID, out, nil
}

func (s *AnalysisService) resolveSourceDirByID(targetID string) string {
	if targetID == "" || s.connections == nil {
		return ""
	}
	if t, ok := s.connections.Get(targetID); ok {
		return t.SourceDir
	}
	// Fallback: some callers pass a URL in the targetId field.
	for _, t := range s.connections.List() {
		if t.URL == targetID {
			return t.SourceDir
		}
	}
	return ""
}

func (s *AnalysisService) resolveSourceDirByURL(url string) string {
	if url == "" || s.connections == nil {
		return ""
	}
	for _, t := range s.connections.List() {
		if t.URL == url {
			return t.SourceDir
		}
	}
	return ""
}

func buildAnalysisPrompt(req AnalysisRequest, sourceDir string) (string, error) {
	if req.Format == "jfr" {
		switch req.Mode {
		case "explain":
			switch req.ProfileType {
			case "heap", "allocs":
				return BuildJavaAllocExplainPrompt(req.Functions, sourceDir), nil
			case "lock", "mutex":
				return BuildJavaLockExplainPrompt(req.Functions, sourceDir), nil
			default:
				return BuildJavaCPUExplainPrompt(req.Functions, sourceDir), nil
			}
		case "optimize":
			return BuildJavaCPUExplainPrompt(req.Functions, sourceDir), nil
		case "explain-function":
			return BuildExplainFunctionPrompt(req.FunctionName, req.Functions, req.ProfileType), nil
		default:
			return "", fmt.Errorf("unknown analysis mode: %s", req.Mode)
		}
	}
	switch req.Mode {
	case "explain":
		return BuildExplainPrompt(req.Functions, sourceDir, req.ProfileType, req.Format), nil
	case "optimize":
		return BuildOptimizePrompt(req.Functions, sourceDir, req.ProfileType, req.Format), nil
	case "explain-function":
		return BuildExplainFunctionPrompt(req.FunctionName, req.Functions, req.ProfileType, req.Format), nil
	default:
		return "", fmt.Errorf("unknown analysis mode: %s", req.Mode)
	}
}

func buildTracePrompt(req TraceAnalysisRequest, td *traceparser.TraceData) (string, error) {
	meta := TraceMeta{
		DurationNs:     td.Meta.DurationNs,
		GoroutineCount: td.Meta.GoroutineCount,
		ProcessorCount: td.Meta.ProcessorCount,
		GCCount:        td.Meta.GCCount,
	}

	switch req.Mode {
	case "trace-overview":
		return BuildTraceOverviewPrompt(meta, convertGoroutines(td), convertBlocking(td), convertGCEvents(td)), nil

	case "trace-goroutine":
		if req.GoroutineID == nil {
			return "", fmt.Errorf("goroutineId required for trace-goroutine mode")
		}
		g := findGoroutine(td, *req.GoroutineID)
		if g == nil {
			return "", fmt.Errorf("goroutine %d not found", *req.GoroutineID)
		}
		return BuildTraceGoroutinePrompt(*g, meta), nil

	case "trace-blocking":
		if req.BlockingIdx == nil {
			return "", fmt.Errorf("blockingIdx required for trace-blocking mode")
		}
		blocking := convertBlocking(td)
		if *req.BlockingIdx >= len(blocking) {
			return "", fmt.Errorf("blocking index out of range")
		}
		return BuildTraceBlockingPrompt(blocking[*req.BlockingIdx], blocking, meta), nil

	case "trace-span":
		if req.Span == nil {
			return "", fmt.Errorf("span required for trace-span mode")
		}
		return BuildTraceSpanPrompt(*req.Span, req.GoroutineName, req.AdjacentSpans), nil

	case "trace-gc":
		return BuildTraceGCPrompt(convertGCEvents(td), meta), nil

	case "trace-goroutines-tab":
		return BuildTraceGoroutinesTabPrompt(convertGoroutines(td), meta), nil

	case "trace-blocking-tab":
		return BuildTraceBlockingTabPrompt(convertBlocking(td), meta), nil

	default:
		return "", fmt.Errorf("unknown trace analysis mode: %s", req.Mode)
	}
}

func convertGoroutines(td *traceparser.TraceData) []GoroutineInfo {
	result := make([]GoroutineInfo, len(td.Goroutines))
	for i, g := range td.Goroutines {
		spans := make([]GoroutineSpanInfo, len(g.Spans))
		for j, sp := range g.Spans {
			spans[j] = GoroutineSpanInfo{
				State: sp.State, StartNs: sp.StartNs, EndNs: sp.EndNs,
				Reason: sp.Reason, Stack: sp.Stack,
			}
		}
		result[i] = GoroutineInfo{ID: g.ID, Name: g.Name, Spans: spans}
	}
	return result
}

func convertBlocking(td *traceparser.TraceData) []BlockingInfo {
	result := make([]BlockingInfo, len(td.BlockingSummary))
	for i, b := range td.BlockingSummary {
		result[i] = BlockingInfo{
			Location: b.Location, Category: b.Category,
			TotalDuration: b.TotalDuration, Count: b.Count, Stack: b.Stack,
		}
	}
	return result
}

func convertGCEvents(td *traceparser.TraceData) []GCEventInfo {
	result := make([]GCEventInfo, len(td.GCEvents))
	for i, e := range td.GCEvents {
		result[i] = GCEventInfo{StartNs: e.StartNs, EndNs: e.EndNs, PauseNs: e.PauseNs}
	}
	return result
}

func findGoroutine(td *traceparser.TraceData, id uint64) *GoroutineInfo {
	for _, g := range td.Goroutines {
		if g.ID == id {
			spans := make([]GoroutineSpanInfo, len(g.Spans))
			for j, sp := range g.Spans {
				spans[j] = GoroutineSpanInfo{
					State: sp.State, StartNs: sp.StartNs, EndNs: sp.EndNs,
					Reason: sp.Reason, Stack: sp.Stack,
				}
			}
			result := GoroutineInfo{ID: g.ID, Name: g.Name, Spans: spans}
			return &result
		}
	}
	return nil
}
