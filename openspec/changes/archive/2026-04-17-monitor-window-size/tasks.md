## 1. Backend

- [x] 1.1 Increase `MaxPoints` in `internal/monitor/collector.go` from 300 to 7200

## 2. Frontend: Window Selector

- [x] 2.1 Add `windowMinutes` state to ConnectionDetail monitor tab (default 5), with button row: 1, 5, 15, 30, 60, 120
- [x] 2.2 Pass `windowMs` prop to both `MemoryChart` and `GoroutineChart`

## 3. Frontend: Charts

- [x] 3.1 Update `MemoryChart` to accept `windowMs` prop and filter displayed data to `now - windowMs`
- [x] 3.2 Update `GoroutineChart` to accept `windowMs` prop and filter displayed data to `now - windowMs`
