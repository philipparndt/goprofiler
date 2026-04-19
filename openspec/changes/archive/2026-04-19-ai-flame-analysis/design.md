## Context

GoProfiler is a Wails desktop app (and web app) for profiling Go processes. The Wails app has full local filesystem access and can spawn processes. Claude Code (`claude` CLI) is Anthropic's CLI tool that can be invoked non-interactively with `claude -p "prompt" --output-format text` to get AI analysis.

The profiler already has:
- `FlameNode` tree with function names and values
- `TopFunction` list with flat/cumulative stats
- `CallTreeNode` with self/cumulative breakdown
- Source code lives on the user's local machine in Go module directories

## Goals / Non-Goals

**Goals:**
- Let users point the profiler at their source directory
- Provide one-click AI analysis of hot paths (explain + optimize)
- Allow right-click "Explain" on individual flame graph frames
- Stream Claude Code output to a results panel
- Desktop-only feature (Wails app)

**Non-Goals:**
- Building a full code editor or source browser
- Supporting AI providers other than Claude Code CLI
- Web app support (no local process spawning)
- Automatic source directory detection (user configures manually)

## Decisions

### 1. Use Claude Code CLI via `os/exec`

**Decision:** Spawn `claude -p "<prompt>" --output-format stream-json` as a child process using Go's `os/exec`. The Wails app captures stdout and streams results back to the frontend via Wails events.

**Why:** Claude Code is already installed on developer machines, handles authentication itself (API key or OAuth), and provides a high-quality analysis experience. No need to manage API keys or implement an API client — Claude Code handles all of that.

**Alternatives considered:**
- Direct Anthropic API calls: Would require API key management, token counting, and HTTP client implementation. More work, less capability than Claude Code.
- Embedded AI SDK: Heavy dependency, complex to maintain.

### 2. Source directory stored per target in connection config

**Decision:** Add a `sourceDir` field to the target/connection configuration. Users set it via a settings panel in the connection detail view. Persisted alongside other target config.

**Why:** Different targets may correspond to different Go projects. Per-target config allows users to profile multiple services with correct source context.

### 3. Prompt construction with profile context

**Decision:** Build prompts that include:
- The top N hot functions with their flat/cumulative stats
- The call tree path for the selected function (if context menu)
- The source directory path (Claude Code can read files itself)
- A clear instruction to analyze the Go source code at that path

**Why:** Claude Code has filesystem access and can read source files directly. We just need to tell it which functions to investigate and where the code lives.

### 4. Results displayed in a slide-out panel

**Decision:** AI analysis results appear in a slide-out panel on the right side of the profile viewer. The panel shows streaming markdown output from Claude Code with a loading indicator.

**Why:** Keeps the flame graph visible while reading the analysis. Slide-out panels are a common pattern for secondary content.

### 5. Context menu via right-click on flame graph frames

**Decision:** Add a `contextmenu` event handler on the flame graph SVG. When a frame is right-clicked, show a small menu with "Explain this function" that triggers AI analysis scoped to that frame's function name and call chain.

**Why:** Natural UX for acting on a specific element. Users already click frames to zoom; right-click for analysis is intuitive.

## Risks / Trade-offs

- **[Claude Code availability]** User must have `claude` CLI installed and authenticated. → Mitigation: Check for `claude` at startup, show a helpful message if not found. Gray out AI buttons.
- **[Long analysis time]** Complex profiles may take 10-30s to analyze. → Mitigation: Stream output progressively, show a cancel button.
- **[Prompt size]** Large profiles could generate very long prompts. → Mitigation: Limit to top 10-20 functions, summarize call chains.
- **[Desktop-only]** Web app users don't get this feature. → Mitigation: Clearly mark as desktop feature. Could add API-based analysis for web later.
