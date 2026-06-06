/**
 * FamilyRoot — AdminTab.jsx
 *
 * Left panel:  live folder tree of media/originals
 * Right panel: two cards —
 *   1. Ingest — point to any folder on the server, run face AI
 *   2. Reorganize — move + rename all files into year/event/place structure
 *                   with YYYY-MM-DD-NNN naming
 */

import { useState, useEffect, useRef, useCallback } from "react";

const API = "";

// ── tiny shared bits ──────────────────────────────────────────────────────────

function Spinner({ size = 18 }) {
  return (
    <div style={{
      width: size, height: size,
      border: `2px solid var(--border)`,
      borderTopColor: "var(--accent)",
      borderRadius: "50%",
      animation: "spin 0.7s linear infinite",
      flexShrink: 0,
    }} />
  );
}

function ProgressBar({ pct, color = "var(--accent)" }) {
  return (
    <div style={{ height: 4, background: "var(--bg-sel)", borderRadius: 2, overflow: "hidden", margin: "6px 0" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width 0.3s" }} />
    </div>
  );
}

function SectionCard({ title, children }) {
  return (
    <div style={{ border: "0.5px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
      <div style={{ padding: "11px 14px", borderBottom: "0.5px solid var(--border)", background: "var(--bg-card)" }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{title}</span>
      </div>
      <div style={{ padding: 14 }}>{children}</div>
    </div>
  );
}

function LogBox({ lines, running, logRef }) {
  if (!lines.length && !running) return null;
  return (
    <div
      ref={logRef}
      style={{
        marginTop: 10, padding: "8px 10px",
        background: "var(--bg-card)",
        border: "0.5px solid var(--border)",
        borderRadius: 6, fontFamily: "var(--font-mono)",
        fontSize: 11, color: "var(--text-secondary)",
        lineHeight: 1.75, maxHeight: 200, overflowY: "auto",
      }}
    >
      {lines.map((l, i) => (
        <div key={i} style={{ color: l.includes("ERROR") || l.includes("Fatal") ? "#993C1D" : undefined }}>
          {l}
        </div>
      ))}
      {running && <div style={{ color: "var(--accent)" }}>▌</div>}
    </div>
  );
}

// ── folder tree ───────────────────────────────────────────────────────────────

function TreeNode({ node, depth = 0 }) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children?.length > 0;
  const indent = depth * 14;

  return (
    <div>
      <div
        onClick={() => hasChildren && setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "3px 8px 3px " + (8 + indent) + "px",
          cursor: hasChildren ? "pointer" : "default",
          borderRadius: 4,
          fontSize: 12,
        }}
        onMouseEnter={e => { if (hasChildren) e.currentTarget.style.background = "var(--bg-card)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = ""; }}
      >
        <span style={{ width: 14, flexShrink: 0, color: "var(--text-tertiary)", fontSize: 10, userSelect: "none" }}>
          {hasChildren ? (open ? "▾" : "▸") : ""}
        </span>
        <span style={{ fontSize: 14, flexShrink: 0 }}>{hasChildren ? "📁" : ""}</span>
        <span style={{
          flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          color: depth === 0 ? "var(--text-primary)" : "var(--text-secondary)",
          fontWeight: depth <= 1 ? 500 : 400,
        }}>
          {node.name}
        </span>
        {node.files > 0 && (
          <span style={{ fontSize: 10, color: "var(--text-tertiary)", flexShrink: 0 }}>
            {node.files}
          </span>
        )}
      </div>
      {open && hasChildren && node.children.map((child, i) => (
        <TreeNode key={i} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

function FolderTree() {
  const [tree, setTree]       = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API}/api/admin/tree`)
      .then(r => r.json())
      .then(d => { setTree(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{
      width: 260, flexShrink: 0,
      borderRight: "0.5px solid var(--border)",
      display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      <div style={{
        padding: "10px 12px", borderBottom: "0.5px solid var(--border)",
        background: "var(--bg-card)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, fontWeight: 500 }}>media / originals</span>
        <button onClick={load} style={{ fontSize: 11, padding: "2px 8px" }}>↻</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
            <Spinner />
          </div>
        )}
        {!loading && !tree?.children?.length && (
          <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 12, color: "var(--text-tertiary)" }}>
            No files yet.<br />Ingest photos below.
          </div>
        )}
        {!loading && tree && tree.children?.map((child, i) => (
          <TreeNode key={i} node={child} depth={0} />
        ))}
      </div>
    </div>
  );
}

// ── ingest panel ──────────────────────────────────────────────────────────────

function IngestPanel() {
  const [folder, setFolder]   = useState("");
  const [runFaces, setRunFaces] = useState(true);
  const [running, setRunning] = useState(false);
  const [pct, setPct]         = useState(0);
  const [label, setLabel]     = useState("");
  const [done, setDone]       = useState(false);
  const [result, setResult]   = useState(null);
  const esRef = useRef(null);

  const start = async () => {
    if (!folder.trim()) return;
    setRunning(true);
    setDone(false);
    setResult(null);
    setPct(0);
    setLabel("Starting…");

    const res = await fetch(`${API}/api/admin/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder_path: folder.trim(), run_faces: runFaces }),
    });
    if (!res.ok) {
      const err = await res.json();
      setLabel(`Error: ${err.error}`);
      setRunning(false);
      return;
    }

    const es = new EventSource(`${API}/api/admin/ingest/status`);
    esRef.current = es;
    es.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.done) {
        setDone(true);
        setResult(d.stats);
        setRunning(false);
        setPct(100);
        setLabel("Complete");
        es.close();
      } else {
        setPct(d.pct || 0);
        setLabel(d.filename || "");
      }
    };
    es.onerror = () => { setRunning(false); es.close(); };
  };

  return (
    <SectionCard title="Ingest photos from folder">
      <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12, lineHeight: 1.6 }}>
        Point to any folder on this machine. FamilyRoot copies photos into{" "}
        <code style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>media/originals/</code>,
        extracts EXIF, generates thumbnails, and optionally detects faces.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input
          type="text"
          value={folder}
          onChange={e => setFolder(e.target.value)}
          placeholder="/home/pi/photos  or  /media/usb/scans"
          style={{ flex: 1, fontSize: 12 }}
          disabled={running}
        />
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginBottom: 12, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={runFaces}
          onChange={e => setRunFaces(e.target.checked)}
          disabled={running}
        />
        Run face detection &amp; clustering after ingest
        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>(slow on Pi — can uncheck)</span>
      </label>

      <button
        className="primary"
        onClick={start}
        disabled={running || !folder.trim()}
        style={{ fontSize: 13 }}
      >
        {running ? "Ingesting…" : "Start ingest"}
      </button>

      {(running || label) && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {running && <Spinner size={14} />}
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{label}</span>
          </div>
          <ProgressBar pct={pct} />
        </div>
      )}

      {done && result && (
        <div style={{
          marginTop: 10, padding: "10px 12px",
          background: "rgba(29,158,117,0.18)",
          borderRadius: 6, fontSize: 12,
          display: "flex", flexWrap: "wrap", gap: 14,
        }}>
          {Object.entries(result).filter(([, v]) => v > 0).map(([k, v]) => (
            <span key={k}>
              <strong>{v.toLocaleString()}</strong>{" "}
              <span style={{ color: "var(--text-secondary)" }}>{k.replace(/_/g, " ")}</span>
            </span>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ── reorganize panel ──────────────────────────────────────────────────────────

function ReorganizePanel({ onDone }) {
  const [running, setRunning] = useState(false);
  const [log, setLog]         = useState([]);
  const [done, setDone]       = useState(false);
  const [result, setResult]   = useState(null);
  const [dryRun, setDryRun]   = useState(false);
  const logRef = useRef(null);
  const esRef  = useRef(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const start = async () => {
    setRunning(true);
    setLog([]);
    setDone(false);
    setResult(null);

    const res = await fetch(`${API}/api/admin/reorganize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dry_run: dryRun }),
    });
    if (!res.ok) {
      const err = await res.json();
      setLog([`Error: ${err.error}`]);
      setRunning(false);
      return;
    }

    const es = new EventSource(`${API}/api/admin/reorganize/status`);
    esRef.current = es;
    es.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.done) {
        setDone(true);
        setResult(d.stats);
        setRunning(false);
        es.close();
        onDone?.();
      } else if (d.message !== undefined) {
        setLog(prev => [...prev, d.message]);
      }
    };
    es.onerror = () => { setRunning(false); es.close(); };
  };

  return (
    <SectionCard title="Reorganize &amp; rename files">
      <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8, lineHeight: 1.6 }}>
        Sorts every photo into{" "}
        <code style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>year / event-or-place / </code>
        folders and renames files to{" "}
        <code style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>YYYY-MM-DD-NNN.ext</code>.
      </p>

      {/* Structure legend */}
      <div style={{
        background: "var(--bg-card)",
        border: "0.5px solid var(--border)",
        borderRadius: 6, padding: "8px 12px", marginBottom: 12,
        fontFamily: "var(--font-mono)", fontSize: 11,
        color: "var(--text-secondary)", lineHeight: 1.9,
      }}>
        <div>originals/</div>
        <div>&nbsp;&nbsp;1948/</div>
        <div>&nbsp;&nbsp;&nbsp;&nbsp;Marriage - John and Mary/</div>
        <div style={{ color: "var(--accent)" }}>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;1948-06-12-001.jpg</div>
        <div>&nbsp;&nbsp;&nbsp;&nbsp;Edinburgh/</div>
        <div style={{ color: "var(--accent)" }}>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;1948-00-00-001.jpg</div>
        <div>&nbsp;&nbsp;&nbsp;&nbsp;unsorted/</div>
        <div style={{ color: "var(--accent)" }}>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;1948-00-00-001.jpg</div>
        <div>&nbsp;&nbsp;undated/unsorted/</div>
        <div style={{ color: "var(--accent)" }}>&nbsp;&nbsp;&nbsp;&nbsp;0000-00-00-001.jpg</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={dryRun}
            onChange={e => setDryRun(e.target.checked)}
            disabled={running}
          />
          Dry run — show what would change, don't move anything
        </label>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          className={dryRun ? "" : "primary"}
          onClick={start}
          disabled={running}
          style={{ fontSize: 13 }}
        >
          {running ? "Running…" : dryRun ? "Preview changes" : "Reorganize files"}
        </button>
        {running && <Spinner size={16} />}
      </div>

      <LogBox lines={log} running={running} logRef={logRef} />

      {done && result && (
        <div style={{
          marginTop: 10, padding: "10px 12px",
          background: dryRun ? "var(--bg-card)" : "rgba(29,158,117,0.18)",
          borderRadius: 6, fontSize: 12,
          display: "flex", flexWrap: "wrap", gap: 14,
        }}>
          {Object.entries(result).map(([k, v]) => (
            <span key={k}>
              <strong>{v.toLocaleString()}</strong>{" "}
              <span style={{ color: k === "errors" ? "#993C1D" : "var(--text-secondary)" }}>
                {k.replace(/_/g, " ")}
              </span>
            </span>
          ))}
          {dryRun && (
            <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>
              (dry run — nothing moved)
            </span>
          )}
        </div>
      )}
    </SectionCard>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function AdminTab() {
  const [treeKey, setTreeKey] = useState(0);

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
      {/* Left: folder tree — re-mounts when treeKey changes */}
      <FolderTree key={treeKey} />

      {/* Right: panels */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", maxWidth: 700 }}>
        <h2 style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>Admin</h2>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 20, lineHeight: 1.6 }}>
          Ingest new photos from any folder on this machine, then reorganize
          the library into a tidy year → event → place folder structure with
          consistent file names.
        </p>

        <IngestPanel />
        <ReorganizePanel onDone={() => setTreeKey(k => k + 1)} />
      </div>
    </div>
  );
}
