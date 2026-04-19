## 1. Backend CPU Data Collection

- [x] 1.1 Add `github.com/google/pprof/profile` dependency for parsing pprof protobuf profiles
- [x] 1.2 Create `internal/monitor/cpustats.go` with `FetchCpuProfile()` that calls `/debug/pprof/profile?seconds=1` and parses the protobuf to compute CPU percentage
- [x] 1.3 Create `internal/monitor/cpu_collector.go` with `CpuService` struct, `CpuDataPoint` (timestamp + cpuPercent), `CpuHistoryResponse`, poll loop at 5-second intervals, and rolling buffer (MaxPoints)

## 2. Backend API

- [x] 2.1 Add `getCpuHistory` handler in `internal/api/handler.go` for `GET /targets/{id}/cpu/history` with optional `since` query parameter
- [x] 2.2 Add `enableCpuMonitoring` and `disableCpuMonitoring` handlers for `POST /targets/{id}/cpu/enable` and `POST /targets/{id}/cpu/disable`
- [x] 2.3 Register the CPU routes (history, enable, disable) in the router setup
- [x] 2.4 Wire `CpuService` into `app.go` (create on startup, stop on target disconnect, close on shutdown — do NOT auto-start on connect)

## 3. Frontend API Layer

- [x] 3.1 Add `CpuDataPoint` and `CpuHistory` TypeScript interfaces in `api.ts`
- [x] 3.2 Add `getCpuHistory(targetId, since?)`, `enableCpuMonitoring(targetId)`, and `disableCpuMonitoring(targetId)` API methods in `api.ts`

## 4. Frontend CPU Chart Component

- [x] 4.1 Create `CpuChart.tsx` canvas component following `MemoryChart.tsx` patterns — render CPU percentage over time with line chart, hover tooltip, and dynamic Y-axis scaling
- [x] 4.2 Integrate `CpuChart` into `ConnectionDetail.tsx` Monitor tab with an enable/disable toggle (disabled by default), sharing the same window duration controls as MemoryChart
