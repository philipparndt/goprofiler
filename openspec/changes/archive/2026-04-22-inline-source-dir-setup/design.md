## Context

The AI panel is a generic component used from both `ProfileViewer` and `TraceViewer`. Today it receives an `error?: string` prop; when the error text contains "source directory" it renders a multi-line markdown instruction (`frontend/src/components/AiAnalysisPanel.tsx` around the `displayError` branch). The instruction tells the user to go to the Info tab and set the source dir.

Backend emits the error from `AnalysisService.StartAnalysis` / `StartTraceAnalysis` / `FollowUp` as exactly `"no source directory configured for this target"`. The same string surfaces through both Wails bindings (thrown to JS) and the HTTP handler (400 Bad Request body).

Source directory persistence already exists:
- `api.setSourceDir(targetId, path)` — HTTP `PUT /api/targets/{id}/source-dir` or Wails `SetSourceDir(targetID, path)`.
- `api.browseSourceDir()` — Wails-only native directory picker.
- `api.getSourceDir(targetId)` — rarely needed here since the target obviously doesn't have one if we're hitting this path.

Both `ProfileViewer` and `TraceViewer` already know the target ID (`profile?.targetURL` and `targetUrl` prop respectively). Neither passes it to the panel today.

## Goals / Non-Goals

**Goals:**
- Let a user set the source dir from inside the AI panel when an analysis can't start without one.
- After saving, automatically retry the exact analysis the user originally asked for — same mode, same functions, same permission level. No re-click.
- Wails users keep the native Browse button; web users get help text.
- No fallback-behaviour regression: unrelated errors render exactly as before.

**Non-Goals:**
- Letting the user edit the source directory from the panel when it's already set. That stays on the Info tab (one canonical place to edit).
- Validation of the path (path exists, is a git repo, etc.). If the backend / Claude CLI later rejects it, that'll surface as a regular error. Keeping the form simple.
- Remembering the path across reloads via browser storage. The backend already persists it.
- Designing a whole onboarding flow. This is a single "missing one thing" affordance.

## Decisions

### 1. Detection stays string-based

The panel already branches on `error?.includes("source directory")`. That string match is enough to distinguish the "please configure" case from any other failure. Adding a structured error code would mean touching the backend + API + types; the one-string match works and is localised to the component.

### 2. Two new props on `AiAnalysisPanel`

- `targetId?: string` — identifies the target to call `setSourceDir` against. If undefined, we can't save, so we fall back to the old text instruction (safe default).
- `onRetry?: () => void` — parent-supplied callback. After saving the directory the panel calls `onRetry()`. The parent re-runs the same `startAnalysis` / `startTraceAnalysis` call that originally failed, which in turn resets `aiError` to undefined and fires a new stream.

These two are independent so a parent can opt into the inline form gradually, but in practice both `ProfileViewer` and `TraceViewer` will wire both.

### 3. Retry lives on the parent, not the panel

The panel doesn't know which of Explain / Optimize / Analyze-Trace / Follow-up the user started. The parent has that context. The simplest contract is "here's a function that repeats whatever you did last; call it after you've fixed the source-dir problem."

Parents store the last-started analysis's parameters on a ref and expose a single `retryLastAnalysis()` that, when called, re-invokes the same branch. A ref (instead of state) avoids re-renders.

### 4. Render branch

When `error` matches the source-dir pattern AND `targetId` is set, render (instead of the markdown error):

- Title: "Source directory required"
- Short explanation: "The AI needs to read your project source to explain the profile. Point it at the root of your codebase."
- The same input + Browse-button + help-text combo `ConnectionDetail` already uses for the Info tab. Reuse the pattern, not shared code, since the styling contexts differ slightly.
- "Save & Start" primary button (disabled until input is non-empty).
- A small secondary link: "…or open the Info tab to configure later." Bare text, no router dependency — just closes the panel via the existing `onClose`.

### 5. Error feedback on save

If `setSourceDir` rejects (bad path format, backend error), show the error below the input in red; don't call `onRetry`. If it resolves, call `onRetry` and clear the local save-error state. The panel's parent-supplied `error` prop is about the *previous* analysis attempt — after retry, the parent's catch logic updates it.

### 6. Keep the markdown fallback

When `targetId` is undefined (shouldn't happen for current parents but defensible) or `onRetry` is undefined, render the old markdown instruction. This keeps the component safe to use from any future caller that doesn't wire the new props.

## Risks / Trade-offs

- [Duplicated source-dir UI between panel and ConnectionDetail] → Accepted. Extracting into a shared component saves ~40 lines but adds a file and an abstraction; the two contexts (sidebar panel vs card in a page) need slightly different styling anyway. If this pattern appears a third time, we refactor.
- [User mis-enters the path and triggers a puzzling Claude error] → The failure mode already exists today (if they set a wrong path in the Info tab). Same error path; no regression.
- [Parents forget to wire `onRetry`, silently degrading to old behaviour] → The panel's default is safe (keeps the old instruction). Manual verification covers the wire-up for the two parents we have.
