/**
 * FamilyRoot — GrampsEngineTab.jsx
 *
 * Connects FamilyRoot to a running Gramps Web instance as the
 * canonical genealogy engine.
 *
 * Tabs:
 *   Connect  — enter Gramps Web URL + credentials
 *   Sync     — import all data from Gramps Web → local SQLite with live SSE log
 *   Push     — search for a person and push local edits back to Gramps Web
 */

import { useState, useEffect, useRef, useCallback } from "react";

const API = "";

// ── shared UI ─────────────────────────────────────────────────────────────────

function Label({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
      color: "var(--text-tertiary)", textTransform: "uppercase",
      marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border-card)",
      borderRadius: 10,
      ...style,
    }}>
      {children}
    </div>
  );
}

function StatusDot({ ok }) {
  return (
    <span style={{
      display: "inline-block", width: 8, height: 8, borderRadius: "50%",
      background: ok ? "var(--accent)" : "#E07070", marginRight: 6,
    }} />
  );
}

function LogBox({ lines, running, logRef }) {
  return (
    <div ref={logRef} style={{
      background: "#0D0D0D", border: "1px solid var(--border)", borderRadius: 8,
      padding: "10px 14px", fontFamily: "var(--mono, monospace)",
      fontSize: 11, lineHeight: 1.8, maxHeight: 280,
      overflowY: "auto", color: "var(--text-secondary)",
    }}>
      {lines.map((l, i) => (
        <div key={i} style={{
          color: l.startsWith("✓") ? "var(--accent)"
               : l.startsWith("✗") || l.toLowerCase().includes("error") ? "#E07070"
               : "var(--text-secondary)",
        }}>{l}</div>
      ))}
      {running && <div style={{ color: "var(--accent)" }}>▌</div>}
      {lines.length === 0 && !running && (
        <div style={{ color: "var(--text-tertiary)" }}>Waiting…</div>
      )}
    </div>
  );
}

// ── connect panel ─────────────────────────────────────────────────────────────

function ConnectPanel({ status, onConnected }) {
  const [url,      setUrl]      = useState(status?.url ?? "http://localhost:5555");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState(null);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${API}/api/gramps-engine/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.replace(/\/$/, ""), username, password }),
      });
      const d = await r.json();
      if (!r.ok) setError(d.error || "Connection failed");
      else onConnected(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ padding: 20, maxWidth: 540 }}>
      <Label>Gramps Web connection</Label>

      <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 20 }}>
        Run <strong>Gramps Web API</strong> as a separate service (Docker or pip install gramps-webapi),
        then connect FamilyRoot to it here. FamilyRoot will use it as the canonical family history engine —
        all people, families, events, and places are mastered in Gramps.
      </p>

      {status?.connected && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 12px", background: "#0D2920", borderRadius: 8,
          marginBottom: 16, fontSize: 12,
        }}>
          <StatusDot ok />
          <span>Connected to <strong>{status.url}</strong></span>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: "var(--text-tertiary)", display: "block", marginBottom: 5 }}>
          Gramps Web URL
        </label>
        <input
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="http://192.168.1.x:5555"
          style={{ width: "100%", fontSize: 13 }}
        />
        <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
          Default port for Gramps Web API is 5555. Must be reachable from this device.
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: "var(--text-tertiary)", display: "block", marginBottom: 5 }}>Username</label>
          <input type="text" value={username} onChange={e => setUsername(e.target.value)} style={{ width: "100%", fontSize: 13 }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: "var(--text-tertiary)", display: "block", marginBottom: 5 }}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && connect()}
            style={{ width: "100%", fontSize: 13 }} />
        </div>
      </div>

      {error && <div style={{ fontSize: 12, color: "#E07070", marginBottom: 12 }}>✗ {error}</div>}

      <button
        className="primary"
        onClick={connect}
        disabled={busy || !url || !password}
        style={{ fontSize: 13, padding: "8px 24px" }}
      >
        {busy ? "Connecting…" : status?.connected ? "Reconnect" : "Connect"}
      </button>

      <div style={{ marginTop: 20, padding: 14, background: "var(--bg-input)", borderRadius: 8, fontSize: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8, color: "var(--text-secondary)" }}>Quick setup</div>
        <div style={{ color: "var(--text-tertiary)", lineHeight: 1.8, fontFamily: "var(--mono, monospace)", fontSize: 11 }}>
          pip install gramps-webapi<br />
          gramps-webapi --config config.cfg run<br />
          <br />
          # Or Docker:<br />
          docker run -p 5555:5000 ghcr.io/gramps-project/grampsweb
        </div>
      </div>
    </Card>
  );
}

// ── sync panel ────────────────────────────────────────────────────────────────

function SyncPanel({ connected }) {
  const [running, setRunning] = useState(false);
  const [log,     setLog]     = useState([]);
  const [done,    setDone]    = useState(false);
  const [stats,   setStats]   = useState(null);
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const startSync = useCallback(async () => {
    setRunning(true);
    setLog([]);
    setDone(false);
    setStats(null);

    const r = await fetch(`${API}/api/gramps-engine/import`, { method: "POST" });
    if (!r.ok) {
      const d = await r.json();
      setLog([`✗ ${d.error}`]);
      setRunning(false);
      return;
    }

    const es = new EventSource(`${API}/api/gramps-engine/import/status`);
    es.onmessage = e => {
      const d = JSON.parse(e.data);
      if (d.done) {
        setDone(true);
        setStats(d.stats);
        setRunning(false);
        es.close();
      } else if (d.message) {
        setLog(prev => [...prev, d.message]);
      }
    };
    es.onerror = () => { setRunning(false); es.close(); };
  }, []);

  if (!connected) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
        Connect to Gramps Web first on the Connect tab.
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <Card style={{ padding: 20, marginBottom: 20 }}>
        <Label>Import from Gramps Web → FamilyRoot</Label>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 16 }}>
          Pulls all people, families, events, places and media from your Gramps Web instance into
          FamilyRoot's local database. Existing records are updated — no duplicates created.
          Run this whenever Gramps has new data.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
          {["People", "Families", "Events", "Places"].map(label => (
            <div key={label} style={{ background: "var(--bg-input)", borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{label}</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: stats ? "var(--accent)" : "var(--text-secondary)", marginTop: 4 }}>
                {stats ? (stats[label.toLowerCase()] ?? "—").toLocaleString() : "—"}
              </div>
            </div>
          ))}
        </div>

        <button
          className="primary"
          onClick={startSync}
          disabled={running}
          style={{ fontSize: 14, padding: "10px 28px" }}
        >
          {running ? "Importing…" : done ? "Import again" : "Import from Gramps"}
        </button>
      </Card>

      {(running || log.length > 0) && (
        <div>
          <Label>
            Progress {running ? "● running" : done ? "✓ complete" : ""}
          </Label>
          <LogBox lines={log} running={running} logRef={logRef} />

          {done && stats && (
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              {Object.entries(stats).map(([k, v]) => (
                <div key={k} style={{
                  flex: 1, background: "var(--bg-input)", borderRadius: 8,
                  padding: "10px 14px", textAlign: "center",
                }}>
                  <div style={{ fontSize: 18, fontWeight: 600, color: k === "errors" && v > 0 ? "#E07070" : "var(--accent)" }}>
                    {v?.toLocaleString() ?? 0}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 3 }}>{k}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── push panel ────────────────────────────────────────────────────────────────

function PushPanel({ connected }) {
  const [q,        setQ]        = useState("");
  const [results,  setResults]  = useState([]);
  const [pushing,  setPushing]  = useState({});
  const [pushed,   setPushed]   = useState({});
  const [errors,   setErrors]   = useState({});

  useEffect(() => {
    if (!q) { setResults([]); return; }
    const t = setTimeout(() => {
      fetch(`${API}/api/persons/?q=${encodeURIComponent(q)}&per_page=10`)
        .then(r => r.json())
        .then(d => setResults(d.persons || []))
        .catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const push = async (personId) => {
    setPushing(p => ({ ...p, [personId]: true }));
    setErrors(e => { const n = {...e}; delete n[personId]; return n; });
    try {
      const r = await fetch(`${API}/api/gramps-engine/push/${personId}`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) setErrors(e => ({ ...e, [personId]: d.error }));
      else setPushed(p => ({ ...p, [personId]: true }));
    } catch (e) {
      setErrors(err => ({ ...err, [personId]: e.message }));
    } finally {
      setPushing(p => ({ ...p, [personId]: false }));
    }
  };

  if (!connected) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
        Connect to Gramps Web first on the Connect tab.
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <Label>Push local edits → Gramps Web</Label>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 16 }}>
        After editing a person's name, gender, or details in FamilyRoot, push those changes back to
        Gramps so it stays in sync. Only people imported from Gramps (with a Gramps handle) can be pushed.
      </p>

      <input
        type="search"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Search for a person to push…"
        style={{ width: "100%", fontSize: 13, marginBottom: 12 }}
      />

      {results.map(p => (
        <Card key={p.id} style={{ padding: "10px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name_given} {p.name_surname}</div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
              {p.birth_year ? `b. ${p.birth_year}` : ""}
              {p.gramps_id ? <span style={{ marginLeft: 8, color: "var(--accent)" }}>Gramps: {p.gramps_id}</span> : <span style={{ marginLeft: 8, color: "#E07070" }}>No Gramps handle</span>}
            </div>
            {errors[p.id] && <div style={{ fontSize: 11, color: "#E07070", marginTop: 4 }}>✗ {errors[p.id]}</div>}
          </div>
          <button
            onClick={() => push(p.id)}
            disabled={pushing[p.id] || !p.gramps_id}
            style={{
              fontSize: 12, padding: "5px 16px", borderRadius: 7,
              background: pushed[p.id] ? "var(--accent)" : "var(--bg-tag)",
              color: pushed[p.id] ? "#fff" : "var(--text-primary)",
              border: "1px solid var(--border)",
              opacity: !p.gramps_id ? 0.4 : 1,
            }}
          >
            {pushing[p.id] ? "Pushing…" : pushed[p.id] ? "✓ Pushed" : "Push to Gramps"}
          </button>
        </Card>
      ))}

      {q && results.length === 0 && (
        <div style={{ fontSize: 13, color: "var(--text-tertiary)", textAlign: "center", marginTop: 20 }}>
          No results.
        </div>
      )}
    </div>
  );
}

// ── main tab ──────────────────────────────────────────────────────────────────

const TABS = ["connect", "sync", "push"];

export default function GrampsEngineTab() {
  const [tab,    setTab]    = useState("connect");
  const [status, setStatus] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/gramps-engine/status`)
      .then(r => r.json())
      .then(d => { setStatus(d); if (d.connected) setTab("sync"); })
      .catch(() => {});
  }, []);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* toolbar */}
      <div style={{
        display: "flex", alignItems: "center",
        padding: "0 24px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-sidebar)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 0" }}>
          <span style={{ fontSize: 18 }}>🌿</span>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Gramps Engine</span>
          {status && (
            <span style={{ fontSize: 12, marginLeft: 4 }}>
              <StatusDot ok={status.connected} />
              {status.connected ? `Connected · ${status.url}` : "Not connected"}
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: 2, marginLeft: 20 }}>
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: "none", border: "none",
                borderBottom: `2px solid ${tab === t ? "var(--accent)" : "transparent"}`,
                padding: "14px 16px 12px", fontSize: 12,
                fontWeight: tab === t ? 500 : 400,
                color: tab === t ? "var(--text-primary)" : "var(--text-secondary)",
                cursor: "pointer", textTransform: "capitalize",
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
        {tab === "connect" && (
          <ConnectPanel status={status} onConnected={d => { setStatus({ connected: true, ...d }); setTab("sync"); }} />
        )}
        {tab === "sync" && <SyncPanel connected={!!status?.connected} />}
        {tab === "push" && <PushPanel connected={!!status?.connected} />}
      </div>
    </div>
  );
}
