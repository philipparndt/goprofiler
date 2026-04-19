interface JFREventCategory {
  name: string;
  count: number;
  typeId: number;
}

interface JFREventSummary {
  categories: JFREventCategory[];
  totalEvents: number;
}

export default function JfrEventBrowser({ summary }: { summary: JFREventSummary | null }) {
  if (!summary) {
    return <div style={{ color: "var(--text-muted)", padding: 24 }}>Loading event summary...</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card" style={{ padding: "12px 16px" }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
          Total Events
        </div>
        <div className="mono" style={{ fontSize: 20, fontWeight: 700 }}>
          {summary.totalEvents.toLocaleString()}
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <span className="card-title">Events by Type</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Event Type</th>
              <th style={{ textAlign: "right", width: 100 }}>Count</th>
              <th style={{ textAlign: "right", width: 80 }}>%</th>
            </tr>
          </thead>
          <tbody>
            {summary.categories.map((cat) => (
              <tr key={cat.typeId}>
                <td style={{ fontWeight: 500 }}>{cat.name}</td>
                <td className="mono" style={{ textAlign: "right" }}>{cat.count.toLocaleString()}</td>
                <td className="mono" style={{ textAlign: "right", color: "var(--text-muted)" }}>
                  {((cat.count / summary.totalEvents) * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
