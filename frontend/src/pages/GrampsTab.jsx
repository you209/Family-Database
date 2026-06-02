/**
 * FamilyRoot — GrampsTab / Import page
 *
 * Flow:
 *   1. User types (or pastes) a folder path — USB drive, network share, local folder
 *   2. "Scan" hits /api/gramps/scan and lists found .gramps/.ged files + photo count
 *   3. User picks the genealogy file they want and clicks Import
 *   4. Optionally also ingest the photos from the same folder
 *   5. Live SSE progress log during import/ingest
 *   6. DB stats summary and export buttons at the bottom
 */

import { useState, useRef, useEffect, useCallback } from "react";

const API = "";

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function SectionHeader({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
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

function CardRow({ label, children }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 14px",
      borderBottom: "1px solid var(--border)",
    }}>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", minWidth: 90 }}>{label}</div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

function StatBadge({ label, value, accent }) {
  return (
    <div style={{
      background: "var(--bg-input)", borderRadius: 8,
      padding: "10px 14px", textAlign: "center",
    }}>
      <div style={{ fontSize: 20, fontWeight: 600, color: accent || "var(--text-primary)" }}>
        {(value ?? 0).toLocaleString()}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 3 }}>{label}</div>
    </div>
  );
}

function LogBox({ lines, running, logRef }) {
  return (
    <div
      ref={logRef}
      style={{
        background: "#0D0D0D",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "10px 14px",
        fontFamily: "var(--mono, monospace)",
        fontSize: 11,
        lineHeight: 1.8,
        maxHeight: 200,
        overflowY: "auto",
        color: "var(--text-secondary)",
      }}
    >
      {lines.map((msg, i) => (
        <div key={i} style={{ color: msg.startsWith("✓") ? "var(--accent)" : msg.startsWith("✗") || msg.toLowerCase().includes("error") ? "#E07070" : "var(--text-secondary)" }}>
          {msg}
        </div>
      ))}
      {running && <div style={{ color: "var(--accent)" }}>▌</div>}
      {lines.length === 0 && !running && (
        <div style={{ color: "var(--text-tertiary)" }}>No output yet.</div>
      )}
    </div>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function GrampsTab() {
  // scan
  const [scanPath,    setScanPath]    = useState("");
  const [scanning,    setScanning]    = useState(false);
  const [scanResult,  setScanResult]  = useState(null); // { ged_files, photo_count }
  const [scanError,   setScanError]   = useState(null);

  // genealogy import
  const [selectedFile, setSelectedFile] = useState(null); // path string
  const [importing,    setImporting]    = useState(false);
  const [importLog,    setImportLog]    = useState([]);
  const [importDone,   setImportDone]   = useState(false);
  const [importStats,  setImportStats]  = useState(null);

  // photo ingest (from same folder)
  const [ingestPhotos, setIngestPhotos] = useState(true);
  const [ingesting,    setIngesting]    = useState(false);
  const [ingestLog,    setIngestLog]    = useState([]);
  const [ingestDone,   setIngestDone]   = useState(false);

  // db stats
  const [dbStats, setDbStats] = useState(null);

  // drag-drop direct file
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const importLogRef = useRef(null);
  const ingestLogRef = useRef(null);

  // auto-scroll logs
  useEffect(() => { if (importLogRef.current) importLogRef.current.scrollTop = importLogRef.current.scrollHeight; }, [importLog]);
  useEffect(() => { if (ingestLogRef.current) ingestLogRef.current.scrollTop = ingestLogRef.current.scrollHeight; }, [ingestLog]);

  // load db stats on mount and after import
  useEffect(() => {
    fetch(`${API}/api/gramps/stats`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setDbStats(d))
      .catch(() => {});
  }, [importDone, ingestDone]);

  // ── scan folder ────────────────────────────────────────────────────────────

  const handleScan = async () => {
    if (!scanPath.trim()) return;
    setScanning(true);
    setScanError(null);
    setScanResult(null);
    setSelectedFile(null);
    try {
      const r = await fetch(`${API}/api/gramps/scan?path=${encodeURIComponent(scanPath.trim())}`);
      const d = await r.json();
      if (!r.ok) { setScanError(d.error || "Scan failed"); }
      else { setScanResult(d); }
    } catch (e) {
      setScanError(e.message);
    } finally {
      setScanning(false);
    }
  };

  // ── import genealogy file ─────────────────────────────────────────────────

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
        setImportLog([`✗ Error: ${err.error}`]);
        setImporting(false);
        return;
      }
      const es = new EventSource(`${API}/api/gramps/import/status`);
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
      es.onerror = () => { setImporting(false); es.close(); };
    } catch (e) {
      setImportLog([`✗ Connection error: ${e.message}`]);
      setImporting(false);
    }
  }, [importing]);

  // ── ingest photos ─────────────────────────────────────────────────────────

  const startIngest = useCallback(async (folderPath) => {
    if (ingesting) return;
    setIngesting(true);
    setIngestLog([]);
    setIngestDone(false);

    try {
      const res = await fetch(`${API}/api/admin/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_path: folderPath, run_faces: false }),
      });
      if (!res.ok) {
        const err = await res.json();
        setIngestLog([`✗ ${err.error}`]);
        setIngesting(false);
        return;
      }
      const es = new EventSource(`${API}/api/admin/ingest/status`);
      es.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.done) {
          setIngestDone(true);
          setIngesting(false);
          es.close();
        } else if (data.message) {
          setIngestLog(prev => [...prev, data.message]);
        }
      };
      es.onerror = () => { setIngesting(false); es.close(); };
    } catch (e) {
      setIngestLog([`✗ ${e.message}`]);
      setIngesting(false);
    }
  }, [ingesting]);

  // ── run import (and optionally ingest) ────────────────────────────────────

  const handleImport = () => {
    if (!selectedFile) return;
    startImport(selectedFile).then(() => {
      if (ingestPhotos && scanPath.trim()) {
        startIngest(scanPath.trim());
      }
    });
  };

  // direct file drop / pick
  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) { setSelectedFile(f.name); setScanResult(null); }
  };
  const handleFilePick = (e) => {
    const f = e.target.files[0];
    if (f) { setSelectedFile(f.name); setScanResult(null); }
  };

  const busy = importing || ingesting;

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      flex: 1, overflowY: "auto", padding: "28px 32px",
      display: "flex", flexDirection: "column", gap: 28, maxWidth: 760,
    }}>

      {/* ── header ── */}
      <div>
        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Import</h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          Point FamilyRoot at a USB stick, folder, or network share to import a family tree file
          and copy photos into the library.
        </p>
      </div>

      {/* ── step 1: scan a folder ── */}
      <div>
        <SectionHeader>Step 1 — choose a source folder or USB drive</SectionHeader>
        <Card>
          <div style={{ padding: "14px 16px" }}>
            <div style={{ display: "flex", gap: 8, marginBottom: scanResult || scanError ? 14 : 0 }}>
              <input
                type="text"
                value={scanPath}
                onChange={e => setScanPath(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleScan()}
                placeholder="/media/usb  or  D:\FamilyExport  or  /home/pi/imports"
                style={{ flex: 1, fontSize: 13 }}
              />
              <button
                className="primary"
                onClick={handleScan}
                disabled={scanning || !scanPath.trim()}
                style={{ fontSize: 13, padding: "8px 20px", whiteSpace: "nowrap" }}
              >
                {scanning ? "Scanning…" : "Scan"}
              </button>
            </div>

            {scanError && (
              <div style={{ fontSize: 12, color: "#E07070", marginTop: 8 }}>✗ {scanError}</div>
            )}

            {/* scan results */}
            {scanResult && (
              <div style={{ marginTop: 4 }}>
                {/* photos found */}
                {scanResult.photo_count > 0 && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 12px",
                    background: "var(--bg-input)", borderRadius: 8, marginBottom: 10,
                  }}>
                    <span style={{ fontSize: 18 }}>🖼</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>
                        {scanResult.photo_count.toLocaleString()} photos found
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                        Will be copied into the FamilyRoot media library
                      </div>
                    </div>
                    <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: "var(--text-secondary)" }}>
                      <input
                        type="checkbox"
                        checked={ingestPhotos}
                        onChange={e => setIngestPhotos(e.target.checked)}
                        style={{ accentColor: "var(--accent)", width: 14, height: 14 }}
                      />
                      Import photos too
                    </label>
                  </div>
                )}

                {/* genealogy files */}
                {scanResult.ged_files.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)", padding: "8px 0" }}>
                    No .gramps or .ged files found in that folder.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 2 }}>
                      Select a family tree file to import:
                    </div>
                    {scanResult.ged_files.map(f => (
                      <label
                        key={f.path}
                        style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                          border: `1px solid ${selectedFile === f.path ? "var(--accent)" : "var(--border)"}`,
                          background: selectedFile === f.path ? "#0D2920" : "var(--bg-input)",
                          transition: "all 0.1s",
                        }}
                      >
                        <input
                          type="radio"
                          name="gedfile"
                          value={f.path}
                          checked={selectedFile === f.path}
                          onChange={() => setSelectedFile(f.path)}
                          style={{ accentColor: "var(--accent)" }}
                        />
                        <span style={{ fontSize: 15 }}>
                          {f.ext === ".gramps" ? "🌳" : "📄"}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {f.name}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                            {f.path}
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
                          {fmtSize(f.size)}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ── step 2: direct file (fallback) ── */}
      <div>
        <SectionHeader>Or drag and drop a file directly</SectionHeader>
        <div
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `1.5px dashed ${dragOver ? "var(--accent)" : "var(--border)"}`,
            borderRadius: 10, padding: "20px 16px", textAlign: "center",
            cursor: "pointer",
            background: dragOver ? "#0D2920" : "transparent",
            transition: "all 0.15s",
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".gramps,.ged,.gedcom"
            style={{ display: "none" }}
            onChange={handleFilePick}
          />
          <div style={{ fontSize: 28, marginBottom: 6 }}>📂</div>
          <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 3 }}>
            Drop a .gramps or .ged file here
          </p>
          <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            Gramps XML · GEDCOM 5.5 / 5.5.1 / 7.0
          </p>
          {selectedFile && !scanResult && (
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--accent)" }}>
              Selected: {selectedFile.split(/[\\/]/).pop()}
            </div>
          )}
        </div>
      </div>

      {/* ── import button ── */}
      {selectedFile && (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            className="primary"
            onClick={handleImport}
            disabled={busy}
            style={{ fontSize: 14, padding: "10px 28px" }}
          >
            {importing ? "Importing…" : ingesting ? "Ingesting photos…" : "Import"}
          </button>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            {selectedFile.split(/[\\/]/).pop()}
            {ingestPhotos && scanResult?.photo_count > 0 && ` + ${scanResult.photo_count.toLocaleString()} photos`}
          </div>
        </div>
      )}

      {/* ── progress logs ── */}
      {(importing || importLog.length > 0) && (
        <div>
          <SectionHeader>
            Family tree import {importing ? "● running" : importDone ? "✓ complete" : ""}
          </SectionHeader>
          <LogBox lines={importLog} running={importing} logRef={importLogRef} />
          {importDone && importStats && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 8, marginTop: 12 }}>
              {Object.entries(importStats).filter(([, v]) => v > 0).map(([k, v]) => (
                <StatBadge key={k} label={k} value={v} accent={k === "errors" ? "#E07070" : "var(--accent)"} />
              ))}
            </div>
          )}
        </div>
      )}

      {(ingesting || ingestLog.length > 0) && (
        <div>
          <SectionHeader>
            Photo ingest {ingesting ? "● running" : ingestDone ? "✓ complete" : ""}
          </SectionHeader>
          <LogBox lines={ingestLog} running={ingesting} logRef={ingestLogRef} />
        </div>
      )}

      {/* ── db stats ── */}
      {dbStats && (
        <div>
          <SectionHeader>Current database</SectionHeader>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 8 }}>
            <StatBadge label="People"   value={dbStats.persons}   accent="var(--accent)" />
            <StatBadge label="Families" value={dbStats.families}  />
            <StatBadge label="Events"   value={dbStats.events}    />
            <StatBadge label="Places"   value={dbStats.places}    />
            <StatBadge label="Sources"  value={dbStats.sources}   />
            <StatBadge label="Photos"   value={dbStats.media}     />
          </div>
          {(dbStats.undated_events > 0 || dbStats.unplaced_events > 0) && (
            <div style={{ marginTop: 10, fontSize: 12, color: "#BA7517", display: "flex", gap: 20 }}>
              {dbStats.undated_events  > 0 && <span>⚠ {dbStats.undated_events} events without a date</span>}
              {dbStats.unplaced_events > 0 && <span>⚠ {dbStats.unplaced_events} events without a place</span>}
            </div>
          )}
        </div>
      )}

      {/* ── export ── */}
      <div>
        <SectionHeader>Export / backup</SectionHeader>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <a href={`${API}/api/gramps/export/gramps`} style={{ textDecoration: "none" }}>
            <Card style={{ padding: "12px 14px", cursor: "pointer", transition: "background 0.1s" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--bg-card-hov)"}
              onMouseLeave={e => e.currentTarget.style.background = "var(--bg-card)"}
            >
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 3 }}>🌳 Export Gramps XML</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Full fidelity — open in Gramps desktop</div>
            </Card>
          </a>
          <a href={`${API}/api/gramps/export/gedcom`} style={{ textDecoration: "none" }}>
            <Card style={{ padding: "12px 14px", cursor: "pointer", transition: "background 0.1s" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--bg-card-hov)"}
              onMouseLeave={e => e.currentTarget.style.background = "var(--bg-card)"}
            >
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 3 }}>📄 Export GEDCOM 5.5.1</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Share with Ancestry, FamilySearch, MacFamilyTree</div>
            </Card>
          </a>
        </div>
      </div>

      <div style={{ height: 20 }} />
    </div>
  );
}
