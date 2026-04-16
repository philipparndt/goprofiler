import { useState } from "react";

export default function Setup() {
  return (
    <div>
      <div className="page-header">
        <h1>Quick Start</h1>
        <p>Enable pprof in your Go application to start profiling</p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>1. Import the pprof package</h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: 12 }}>
          Add the following blank import to your main package. This registers pprof HTTP handlers on the default mux.
        </p>
        <CodeBlock code={`import _ "net/http/pprof"`} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>2. Expose the pprof endpoint</h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: 12 }}>
          If your application already uses the default HTTP mux, pprof endpoints are automatically available at <code style={{ color: "var(--accent)" }}>/debug/pprof/</code>.
        </p>
        <p style={{ color: "var(--text-secondary)", marginBottom: 12 }}>
          If you use a custom mux (chi, gorilla, etc.), start a separate listener for pprof:
        </p>
        <CodeBlock code={`import (
    "net/http"
    _ "net/http/pprof"
)

func main() {
    // Start pprof on a separate port
    go func() {
        http.ListenAndServe(":6060", nil)
    }()

    // Your application code...
}`} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>3. Connect from GoProfiler</h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: 12 }}>
          Once your application is running with pprof enabled:
        </p>
        <ol style={{ color: "var(--text-secondary)", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <li>Go to the <strong>Connections</strong> page</li>
          <li>Enter your pprof URL (e.g., <code style={{ color: "var(--accent)" }}>http://localhost:6060</code>)</li>
          <li>Click <strong>Connect</strong></li>
          <li>Start profiling!</li>
        </ol>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>4. CPU Profile Sampling Rate</h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: 12 }}>
          Go's CPU profiler samples at <strong>100 Hz</strong> by default (once every 10ms). This means all CPU values are multiples of 10ms.
          For finer granularity, increase the sampling rate in your application <em>before</em> any profiling starts:
        </p>
        <CodeBlock code={`import "runtime"

func init() {
    // 500 Hz = 2ms granularity (default is 100 Hz = 10ms)
    runtime.SetCPUProfileRate(500)
}`} />
        <p style={{ color: "var(--text-muted)", marginTop: 12, fontSize: 12 }}>
          Higher rates give finer granularity but add more overhead. Values above 500 Hz are not recommended for production.
          This must be called before the first CPU profile is collected.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>5. Understanding "Samples" vs "Invocations"</h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: 12 }}>
          Go uses <strong>sampling-based profiling</strong>, not instrumentation. The profiler periodically interrupts your program and records the current call stack. This means:
        </p>
        <ul style={{ color: "var(--text-secondary)", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          <li>The <strong>"Samples"</strong> column in the call tree shows how many times the profiler caught a function on the stack -- not the exact number of times it was called.</li>
          <li><strong>CPU time</strong> values are statistical estimates based on sample frequency (e.g., at 100 Hz, each sample represents ~10ms).</li>
          <li>Functions that run for less than one sampling interval may not appear at all.</li>
          <li><strong>Heap profiling</strong> also samples: by default it records 1 in every 524,288 bytes allocated (<code style={{ color: "var(--accent)" }}>runtime.MemProfileRate</code>).</li>
          <li><strong>Goroutine, Block, and Mutex</strong> profiles are event-based and exact.</li>
        </ul>
        <p style={{ color: "var(--text-muted)", fontSize: 12 }}>
          Sampling is lightweight (typically {"<"}5% overhead) and statistically representative for hot paths. Go does not offer an instrumentation-based profiler like JProfiler does for the JVM.
        </p>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Available Profile Types</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Description</th>
              <th>Endpoint</th>
            </tr>
          </thead>
          <tbody>
            <tr><td><span className="badge badge-info">CPU</span></td><td>CPU usage over a duration</td><td className="mono">/debug/pprof/profile</td></tr>
            <tr><td><span className="badge badge-info">Heap</span></td><td>Memory allocations</td><td className="mono">/debug/pprof/heap</td></tr>
            <tr><td><span className="badge badge-info">Goroutine</span></td><td>Stack traces of all goroutines</td><td className="mono">/debug/pprof/goroutine</td></tr>
            <tr><td><span className="badge badge-info">Block</span></td><td>Blocking synchronization</td><td className="mono">/debug/pprof/block</td></tr>
            <tr><td><span className="badge badge-info">Mutex</span></td><td>Mutex contention</td><td className="mono">/debug/pprof/mutex</td></tr>
            <tr><td><span className="badge badge-info">Allocs</span></td><td>Cumulative memory allocations (all allocations since start, unlike heap which shows current live objects)</td><td className="mono">/debug/pprof/allocs</td></tr>
            <tr><td><span className="badge badge-info">Threads</span></td><td>OS thread creation stack traces</td><td className="mono">/debug/pprof/threadcreate</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-block">
      <button className="copy-btn" onClick={copy}>{copied ? "Copied!" : "Copy"}</button>
      <pre><code>{code}</code></pre>
    </div>
  );
}
