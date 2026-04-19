import { useState } from "react";
import { api } from "../api";
import LanguageBadge from "./LanguageBadge";

interface LocalJVM {
  pid: number;
  mainClass: string;
  args?: string;
  jmxPort?: number;
  asprofAvailable?: boolean;
}

interface Props {
  onConnected: (targetId: string) => void;
}

export default function LocalJavaConnect({ onConnected }: Props) {
  const [jvms, setJvms] = useState<LocalJVM[]>([]);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [scanned, setScanned] = useState(false);

  const scan = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.discoverLocalJVMs();
      setJvms(result || []);
      setScanned(true);
    } catch (e: any) {
      setError(e.message || "Discovery failed. Is JDK installed?");
    } finally {
      setLoading(false);
    }
  };

  const connect = async (pid: number) => {
    setConnecting(pid);
    setError("");
    try {
      const target = await api.connectLocalJVM(pid);
      onConnected(target.id);
    } catch (e: any) {
      setError(e.message || "Connection failed");
    } finally {
      setConnecting(null);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button className="btn btn-primary" onClick={scan} disabled={loading}>
          {loading ? "Scanning..." : scanned ? "Refresh" : "Scan for JVMs"}
        </button>
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 8 }}>{error}</p>}

      {scanned && jvms.length === 0 && !loading && (
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No JVMs found. Make sure a Java application is running.</p>
      )}

      {jvms.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {jvms.map((jvm) => (
            <div
              key={jvm.pid}
              className="card"
              style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 12 }}
            >
              <span className="mono" style={{ fontSize: 12, color: "var(--text-muted)", width: 50, flexShrink: 0 }}>
                {jvm.pid}
              </span>
              <LanguageBadge language="java" />
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div className="mono" style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {jvm.mainClass}
                </div>
                {jvm.args && (
                  <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 400 }}>
                    {jvm.args}
                  </div>
                )}
              </div>
              <span style={{
                fontSize: 10,
                padding: "2px 6px",
                borderRadius: 4,
                background: jvm.jmxPort ? "rgba(34, 197, 94, 0.12)" : "rgba(107, 114, 128, 0.12)",
                color: jvm.jmxPort ? "var(--success)" : "var(--text-muted)",
              }}>
                {jvm.jmxPort ? `JMX :${jvm.jmxPort}` : "JMX off"}
              </span>
              <button
                className="btn btn-primary btn-sm"
                disabled={connecting === jvm.pid}
                onClick={() => connect(jvm.pid)}
              >
                {connecting === jvm.pid ? "..." : "Connect"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
