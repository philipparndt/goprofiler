## 1. Backend

- [x] 1.1 Update `getProfile` handler to accept `?valueMode=alloc` param; when set, override `bestValueIndex` to return `alloc_space` index before calling Convert/BuildCallTree
- [x] 1.2 Add `ConvertWithIndex` and `BuildCallTreeWithIndex` functions (or add an optional index param) so the handler can specify which value index to use

## 2. Frontend

- [x] 2.1 Add `valueMode` state ("inuse" | "alloc") to ProfileViewer, default "inuse"
- [x] 2.2 Pass `valueMode` to `api.getProfile` as query param when set to "alloc"
- [x] 2.3 Add "Inuse / Alloc" toggle buttons in the toolbar, visible only for heap profiles
