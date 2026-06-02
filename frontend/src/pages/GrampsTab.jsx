/**
 * FamilyRoot — GrampsTab.jsx
 *
 * The Gramps integration tab. Covers:
 *   - Import a .gramps or .ged file (drag & drop or file picker)
 *   - Live SSE progress stream during import
 *   - Database stats summary post-import
 *   - Export back to Gramps XML / GEDCOM
 *   - Sync status (what's in FamilyRoot vs what was in the Gramps file)
 */

import { useState, useRef, useEffect, useCallback } from "react";

const API = "http://localhost:5050";

// ── tiny helpers ──────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }) {
  const colors = {
    blue:   { bg: "#E6F1FB", text: "#0C447C" },
    teal:   { bg: "#E1F5EE", text: "#085041" },
    amber:  { bg: "#FAEEDA", text: "#633806" },
    coral:  { bg: "#FAECE7", text: "#712B13" },
    purple: { bg: "#EEEDFE", text: "#3C3489" },
    gray:   { bg: "#F1EFE8", text: "#444441" },
  };
  const c = colors[color] || colors.gray;
  return (
    <div style={{
      background: c.bg, borderRadius: 8, padding: "12px 14px",
      minWidth: 0,
    }}>
      <div style={{ fontSize: 11, color: c.text, opacity: 0.7, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 500, color: c.text, lineHeight: 1 }}>{value ?? "—"}</div>
      {sub && <div style={{ fontSize: 11, color: c.text, opacity: 0.6, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function ProgressBar({ pct, color = "#1D9E75" }) {
  return (
    <div style={{ height: 5, background: "var(--color-background-tertiary)", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.3s" }} />
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function GrampsTab() {
  const [stats, setStats] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importLog, setImportLog] = useState([]);
  const [importDone, setImportDone] = useState(false);
  const [importStats, setImportStats] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [filePath, setFilePath] = useState("");
  const [fileMode, setFileMode] = useState("path"); // "path" | "drop"
  const fileRef = useRef(null);
  const logRef = useRef(null);
  const esRef = useRef(null);

  // Load DB stats on mount
  useEffect(() => {
    fetch(`${API}/api/gramps/stats`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setStats(d))
      .catch(() => {});
  }, [importDone]);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [importLog]);

  const startImport = useCallback(async (path) => {
    if (importing) return;
    setImporting(true);
    setImportLog([]);
    setImportDone(false);
    setImportStats(null);

    try {
      const res = await fetch(`${API}/api/gramps/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_path: path }),
      });
      if (!res.ok) {
        const err = await res.json();
        setImportLog([`Error: ${err.error}`]);
        setImporting(false);
        return;
      }

      // Subscribe to SSE progress
      const es = new EventSource(`${API}/api/gramps/import/status`);
      esRef.current = es;

      es.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.done) {
          setImportDone(true);
          setImportStats(data.stats);
          setImporting(false);
          es.close();
        } else if (data.message) {
          setImportLog(prev => [...prev, data.message]);
        }
      };
      es.onerror = () => {
        setImporting(false);
        es.close();
      };
    } catch (e) {
      setImportLog([`Connection error: ${e.message}`]);
      setImporting(false);
    }
  }, [importing]);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      // In Electron / desktop mode, we'd get the actual path.
      // In browser mode, show the filename and instruct user to use path input.
      setFilePath(file.name);
      setFileMode("drop");
    }
  };

  const formatNum = (n) => (n ?? 0).toLocaleString();

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "20px 24px", maxWidth: 800 }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>
          Gramps integration
        </h2>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
          Import from a Gramps XML (.gramps) or GEDCOM (.ged) file.
          All people, families, events, places, sources, and media links are imported in full fidelity.
          You can re-import any time — existing records are updated, not duplicated.
        </p>
      </div>

      {/* Database stats */}
      {stats && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
            Current database
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 }}>
            <StatCard label="People"    value={formatNum(stats.persons)}    color="blue"   sub={stats.living ? `${stats.living} living` : null} />
            <StatCard label="Families"  value={formatNum(stats.families)}   color="teal"   />
            <StatCard label="Events"    value={formatNum(stats.events)}     color="purple" sub={stats.undated_events ? `${stats.undated_events} undated` : null} />
            <StatCard label="Places"    value={formatNum(stats.places)}     color="teal"   />
            <StatCard label="Sources"   value={formatNum(stats.sources)}    color="amber"  />
            <StatCard label="Media"     value={formatNum(stats.media)}      color="coral"  sub={stats.with_photos ? `${stats.with_photos} linked` : null} />
          </div>
          {(stats.undated_events > 0 || stats.unplaced_events > 0) && (
            <div style={{ marginTop: 10, fontSize: 12, color: "#BA7517", display: "flex", gap: 16 }}>
              {stats.undated_events > 0 && (
                <span>⚠ {stats.undated_events} events without a date</span>
              )}
              {stats.unplaced_events > 0 && (
                <span>⚠ {stats.unplaced_events} events without a place</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Import panel */}
      <div style={{
        border: `0.5px solid var(--color-border-tertiary)`,
        borderRadius: 12, overflow: "hidden", marginBottom: 20,
      }}>
        <div style={{ padding: "14px 16px", borderBottom: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)" }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>Import file</span>
        </div>

        <div style={{ padding: 16 }}>
          {/* Drag and drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `1.5px dashed ${dragOver ? "#1D9E75" : "var(--color-border-secondary)"}`,
              borderRadius: 8, padding: "24px 16px", textAlign: "center",
              cursor: "pointer", marginBottom: 14,
              background: dragOver ? "#E1F5EE" : "var(--color-background-primary)",
              transition: "all 0.15s",
            }}
          >
            <input ref={fileRef} type="file" accept=".gramps,.ged,.gedcom" style={{ display: "none" }} onChange={e => e.target.files[0] && setFilePath(e.target.files[0].name)} />
            <div style={{ fontSize: 28, color: "var(--color-text-tertiary)", marginBottom: 8 }}>
              {/* tree icon via text fallback */}
              ↑
            </div>
            <p style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 4 }}>
              Drop a .gramps or .ged file here
            </p>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
              Or click to browse — supports Gramps XML, GEDCOM 5.5 / 5.5.1 / 7.0
            </p>
          </div>

          {/* Path input (for Electron / command-line users) */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input
              type="text"
              value={filePath}
              onChange={e => setFilePath(e.target.value)}
              placeholder="/home/yourname/family.gramps  or  C:\Users\...\family.ged"
              style={{ flex: 1, fontSize: 12 }}
            />
            <button
              onClick={() => filePath && startImport(filePath)}
              disabled={importing || !filePath}
              style={{ fontSize: 13, padding: "6px 16px", cursor: importing ? "not-allowed" : "pointer", opacity: !filePath ? 0.4 : 1 }}
            >
              {importing ? "Importing…" : "Import"}
            </button>
          </div>

          {/* Supported formats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {[
              { fmt: ".gramps", label: "Gramps XML", note: "Native — full fidelity", color: "teal" },
              { fmt: ".ged",    label: "GEDCOM",     note: "Ancestry, FamilySearch, etc.", color: "blue" },
              { fmt: ".gedcom", label: "GEDCOM 7",   note: "Newer standard", color: "purple" },
            ].map(({ fmt, label, note, color }) => {
              const c = { teal: ["#E1F5EE","#0F6E56"], blue: ["#E6F1FB","#185FA5"], purple: ["#EEEDFE","#534AB7"] }[color];
              return (
                <div key={fmt} style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ display: "inline-block", background: c[0], color: c[1], fontSize: 11, fontWeight: 500, padding: "2px 7px", borderRadius: 5, marginBottom: 5 }}>{fmt}</div>
                  <p style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 2 }}>{label}</p>
                  <p style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{note}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Progress log */}
      {(importing || importLog.length > 0) && (
        <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
          <div style={{ padding: "10px 14px", borderBottom: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Import progress</span>
            {importing && <span style={{ fontSize: 11, color: "#1D9E75" }}>● running</span>}
            {importDone && <span style={{ fontSize: 11, color: "#1D9E75" }}>✓ complete</span>}
          </div>
          {importing && <ProgressBar pct={importLog.length > 0 ? Math.min(importLog.length * 11, 95) : 5} />}
          <div
            ref={logRef}
            style={{ padding: "10px 14px", fontFamily: "var(--font-mono)", fontSize: 11, maxHeight: 180, overflowY: "auto", color: "var(--color-text-secondary)", lineHeight: 1.7 }}
          >
            {importLog.map((msg, i) => (
              <div key={i}>{msg}</div>
            ))}
            {importing && <div style={{ color: "#1D9E75" }}>▌</div>}
          </div>
        </div>
      )}

      {/* Import results */}
      {importDone && importStats && (
        <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
          <div style={{ padding: "10px 14px", borderBottom: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)" }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Import results</span>
          </div>
          <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 8 }}>
            {Object.entries(importStats).filter(([, v]) => v > 0).map(([k, v]) => (
              <StatCard key={k} label={k} value={v.toLocaleString()} color={k === "errors" ? "coral" : "teal"} />
            ))}
          </div>
          {importStats.errors > 0 && (
            <div style={{ padding: "0 14px 14px", fontSize: 12, color: "#993C1D" }}>
              {importStats.errors} errors occurred. Check the log above for details.
            </div>
          )}
        </div>
      )}

      {/* Export section */}
      <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)" }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>Export / backup</span>
        </div>
        <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <a href={`${API}/api/gramps/export/gramps`} style={{ textDecoration: "none" }}>
            <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, padding: "12px 14px", cursor: "pointer" }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 3 }}>Export Gramps XML</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Full fidelity — open in Gramps desktop app</div>
            </div>
          </a>
          <a href={`${API}/api/gramps/export/gedcom`} style={{ textDecoration: "none" }}>
            <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, padding: "12px 14px", cursor: "pointer" }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 3 }}>Export GEDCOM 5.5.1</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Share with Ancestry, FamilySearch, MacFamilyTree</div>
            </div>
          </a>
        </div>
      </div>

    </div>
  );
}
