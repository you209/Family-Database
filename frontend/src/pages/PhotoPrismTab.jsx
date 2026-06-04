/**
 * FamilyRoot — PhotoPrismTab.jsx
 *
 * Sections:
 *   Connect   — enter PhotoPrism URL + credentials, test connection
 *   Subjects  — list PhotoPrism face subjects, map each to a FamilyRoot person
 *   Albums    — browse PhotoPrism albums
 *   Sync      — run sync with live SSE progress log
 */

import { useState, useEffect, useRef, useCallback } from "react";

const API = "";

// ── shared UI ─────────────────────────────────────────────────────────────────

function SectionLabel({ children }) {
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
      display: "inline-block",
      width: 8, height: 8, borderRadius: "50%",
      background: ok ? "var(--accent)" : "#E07070",
      marginRight: 6,
    }} />
  );
}

function LogBox({ lines, running, logRef }) {
  return (
    <div ref={logRef} style={{
      background: "#0D0D0D",
      border: "1px solid var(--border)",
      borderRadius: 8, padding: "10px 14px",
      fontFamily: "var(--mono, monospace)", fontSize: 11, lineHeight: 1.8,
      maxHeight: 240, overflowY: "auto", color: "var(--text-secondary)",
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
        <div style={{ color: "var(--text-tertiary)" }}>No output yet.</div>
      )}
    </div>
  );
}

// ── person search (for subject → person mapping) ──────────────────────────────

function PersonPicker({ value, onChange, placeholder = "Link to person…" }) {
  const [q, setQ]           = useState(value?.label ?? "");
  const [results, setResults] = useState([]);
  const [open, setOpen]     = useState(false);
  const ref = useRef(null);

  useEffect(() => { setQ(value?.label ?? ""); }, [value]);

  useEffect(() => {
    if (!q || q === value?.label) { setResults([]); return; }
    const t = setTimeout(() => {
      fetch(`${API}/api/persons/?q=${encodeURIComponent(q)}&per_page=8`)
        .then(r => r.json())
        .then(d => setResults(d.persons || []))
        .catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [q, value]);

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <input
        type="search"
        value={value ? value.label : q}
        onChange={e => { setQ(e.target.value); setOpen(true); if (value) onChange(null); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        style={{ width: "100%", fontSize: 12 }}
      />
      {open && results.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
          background: "var(--bg-card)", border: "1px solid var(--border-card)",
          borderRadius: 8, marginTop: 4, overflow: "hidden",
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}>
          {results.map(p => (
            <div
              key={p.id}
              onMouseDown={() => {
                onChange({ id: p.id, label: `${p.name_given || ""} ${p.name_surname || ""}`.trim() });
                setOpen(false);
              }}
              style={{ padding: "8px 12px", cursor: "pointer", fontSize: 12,
                borderBottom: "1px solid var(--border)" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--bg-card-hov)"}
              onMouseLeave={e => e.currentTarget.style.background = ""}
            >
              <span style={{ fontWeight: 500 }}>{p.name_given} {p.name_surname}</span>
              {p.birth_year && <span style={{ color: "var(--text-tertiary)", fontSize: 11, marginLeft: 8 }}>b. {p.birth_year}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── connect panel ─────────────────────────────────────────────────────────────

function ConnectPanel({ status, onConnected }) {
  const [url,      setUrl]      = useState(status?.url ?? "http://localhost:2342");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState(null);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${API}/api/photoprism/connect`, {
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
    <Card style={{ padding: 20, maxWidth: 520 }}>
      <SectionLabel>PhotoPrism connection</SectionLabel>

      {status?.connected && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 12px", background: "#0D2920", borderRadius: 8,
          marginBottom: 16, fontSize: 12,
        }}>
          <StatusDot ok />
          <span>Connected to <strong>{status.url}</strong></span>
          <span style={{ marginLeft: "auto", color: "var(--text-tertiary)" }}>
            {status.subject_count?.toLocaleString()} subjects · {status.photo_count?.toLocaleString()} photos
          </span>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: "var(--text-tertiary)", display: "block", marginBottom: 5 }}>PhotoPrism URL</label>
        <input
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="http://192.168.1.x:2342"
          style={{ width: "100%", fontSize: 13 }}
        />
        <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
          The address of your PhotoPrism instance on the local network
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: "var(--text-tertiary)", display: "block", marginBottom: 5 }}>Username</label>
          <input type="text" value={username} onChange={e => setUsername(e.target.value)} style={{ width: "100%", fontSize: 13 }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: "var(--text-tertiary)", display: "block", marginBottom: 5 }}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && connect()} style={{ width: "100%", fontSize: 13 }} />
        </div>
      </div>

      {error && <div style={{ fontSize: 12, color: "#E07070", marginBottom: 12 }}>✗ {error}</div>}

      <button className="primary" onClick={connect} disabled={busy || !url || !password} style={{ fontSize: 13, padding: "8px 24px" }}>
        {busy ? "Connecting…" : status?.connected ? "Reconnect" : "Connect"}
      </button>
    </Card>
  );
}

// ── subjects panel ────────────────────────────────────────────────────────────

function SubjectsPanel({ onMappingsChange }) {
  const [subjects, setSubjects]     = useState(null);
  const [mappings, setMappings]     = useState({}); // uid → {id, label}
  const [saving,   setSaving]       = useState({});  // uid → bool
  const [saved,    setSaved]        = useState({});  // uid → bool

  useEffect(() => {
    fetch(`${API}/api/photoprism/subjects`)
      .then(r => r.json())
      .then(d => {
        setSubjects(d.subjects || []);
        // Pre-populate mappings from existing person_id links
        const m = {};
        for (const s of d.subjects || []) {
          if (s.person_id) {
            m[s.uid] = { id: s.person_id, label: s.person_name || `Person #${s.person_id}` };
          }
        }
        setMappings(m);
      })
      .catch(() => {});
  }, []);

  const saveMappingFor = useCallback(async (uid, person) => {
    setSaving(p => ({ ...p, [uid]: true }));
    try {
      await fetch(`${API}/api/photoprism/map`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject_uid: uid, person_id: person?.id ?? null }),
      });
      setSaved(p => ({ ...p, [uid]: true }));
      setTimeout(() => setSaved(p => ({ ...p, [uid]: false })), 1500);
      onMappingsChange?.();
    } finally {
      setSaving(p => ({ ...p, [uid]: false }));
    }
  }, [onMappingsChange]);

  const setMapping = (uid, person) => {
    setMappings(m => ({ ...m, [uid]: person }));
  };

  if (!subjects) {
    return <div style={{ padding: 20, color: "var(--text-tertiary)", fontSize: 13 }}>Loading subjects…</div>;
  }

  if (subjects.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>👤</div>
        No face subjects found in PhotoPrism yet.<br />
        Run face recognition in PhotoPrism first.
      </div>
    );
  }

  const mapped = subjects.filter(s => mappings[s.uid]);
  const unmapped = subjects.filter(s => !mappings[s.uid]);

  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16 }}>
        {subjects.length} subjects in PhotoPrism · {mapped.length} mapped to FamilyRoot people
      </div>

      {/* mapped subjects */}
      {mapped.length > 0 && (
        <>
          <SectionLabel>Mapped ({mapped.length})</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 24 }}>
            {mapped.map(s => (
              <SubjectRow
                key={s.uid}
                subject={s}
                person={mappings[s.uid]}
                saving={saving[s.uid]}
                saved={saved[s.uid]}
                onPersonChange={p => setMapping(s.uid, p)}
                onSave={() => saveMappingFor(s.uid, mappings[s.uid])}
              />
            ))}
          </div>
        </>
      )}

      {/* unmapped subjects */}
      {unmapped.length > 0 && (
        <>
          <SectionLabel>Not yet mapped ({unmapped.length})</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {unmapped.map(s => (
              <SubjectRow
                key={s.uid}
                subject={s}
                person={mappings[s.uid] ?? null}
                saving={saving[s.uid]}
                saved={saved[s.uid]}
                onPersonChange={p => setMapping(s.uid, p)}
                onSave={() => saveMappingFor(s.uid, mappings[s.uid])}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SubjectRow({ subject, person, saving, saved, onPersonChange, onSave }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card style={{ padding: "10px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* thumb */}
        <div style={{
          width: 48, height: 48, borderRadius: "50%", overflow: "hidden",
          background: "var(--bg-input)", flexShrink: 0,
        }}>
          {subject.thumb_url
            ? <img src={subject.thumb_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>👤</div>
          }
        </div>

        {/* info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{subject.name || "Unknown"}</div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            {subject.photo_count} photos
            {person && <span style={{ color: "var(--accent)", marginLeft: 8 }}>→ {person.label}</span>}
          </div>
        </div>

        {/* person picker */}
        <div style={{ width: 200 }}>
          <PersonPicker
            value={person}
            onChange={p => { onPersonChange(p); }}
            placeholder="Link to person…"
          />
        </div>

        {/* save button */}
        <button
          onClick={onSave}
          disabled={saving || !person}
          style={{
            fontSize: 12, padding: "5px 14px", borderRadius: 7, flexShrink: 0,
            background: saved ? "var(--accent)" : "var(--bg-tag)",
            color: saved ? "#fff" : "var(--text-primary)",
            border: "1px solid var(--border)",
          }}
        >
          {saving ? "…" : saved ? "✓ Saved" : "Link"}
        </button>
      </div>
    </Card>
  );
}

// ── albums panel ──────────────────────────────────────────────────────────────

function AlbumsPanel() {
  const [albums, setAlbums] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/photoprism/albums`)
      .then(r => r.json())
      .then(d => setAlbums(d.albums || []))
      .catch(() => {});
  }, []);

  if (!albums) return <div style={{ padding: 20, color: "var(--text-tertiary)", fontSize: 13 }}>Loading albums…</div>;

  if (albums.length === 0) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>No albums found in PhotoPrism.</div>;
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
      {albums.map(a => (
        <Card key={a.uid} style={{ overflow: "hidden" }}>
          <div style={{ aspectRatio: "4/3", background: "var(--bg-input)", overflow: "hidden" }}>
            {a.thumb_url
              ? <img src={a.thumb_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>🖼</div>
            }
          </div>
          <div style={{ padding: "10px 12px" }}>
            <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {a.title}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
              {a.photo_count?.toLocaleString()} photos
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── sync panel ────────────────────────────────────────────────────────────────

function SyncPanel() {
  const [subjects,  setSubjects]  = useState(null);
  const [selected,  setSelected]  = useState(new Set()); // subject UIDs
  const [running,   setRunning]   = useState(false);
  const [log,       setLog]       = useState([]);
  const [done,      setDone]      = useState(false);
  const [stats,     setStats]     = useState(null);
  const logRef = useRef(null);
  const esRef  = useRef(null);

  useEffect(() => {
    fetch(`${API}/api/photoprism/subjects`)
      .then(r => r.json())
      .then(d => {
        const mapped = (d.subjects || []).filter(s => s.person_id);
        setSubjects(mapped);
        setSelected(new Set(mapped.map(s => s.uid)));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const startSync = async () => {
    setRunning(true);
    setLog([]);
    setDone(false);
    setStats(null);

    const r = await fetch(`${API}/api/photoprism/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject_uids: [...selected] }),
    });
    if (!r.ok) {
      const d = await r.json();
      setLog([`✗ ${d.error}`]);
      setRunning(false);
      return;
    }

    const es = new EventSource(`${API}/api/photoprism/sync/status`);
    esRef.current = es;
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
  };

  if (!subjects) return <div style={{ padding: 20, color: "var(--text-tertiary)", fontSize: 13 }}>Loading…</div>;

  if (subjects.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>🔗</div>
        No subjects mapped yet.<br />
        Go to the <strong>Subjects</strong> tab and link PhotoPrism faces to FamilyRoot people first.
      </div>
    );
  }

  const toggleAll = () => {
    if (selected.size === subjects.length) setSelected(new Set());
    else setSelected(new Set(subjects.map(s => s.uid)));
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <SectionLabel>Choose subjects to sync</SectionLabel>
        <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={toggleAll} style={{ fontSize: 12, padding: "4px 12px" }}>
            {selected.size === subjects.length ? "Deselect all" : "Select all"}
          </button>
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            {selected.size} of {subjects.length} selected
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {subjects.map(s => (
            <label
              key={s.uid}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 12px", borderRadius: 8, cursor: "pointer",
                border: `1px solid ${selected.has(s.uid) ? "var(--accent)" : "var(--border)"}`,
                background: selected.has(s.uid) ? "#0D2920" : "var(--bg-card)",
                fontSize: 12,
              }}
            >
              <input
                type="checkbox"
                checked={selected.has(s.uid)}
                onChange={e => setSelected(prev => {
                  const n = new Set(prev);
                  e.target.checked ? n.add(s.uid) : n.delete(s.uid);
                  return n;
                })}
                style={{ accentColor: "var(--accent)" }}
              />
              {s.thumb_url && (
                <img src={s.thumb_url} alt="" style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover" }} />
              )}
              {s.name}
              <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>({s.photo_count})</span>
            </label>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <SectionLabel>What sync does</SectionLabel>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.8 }}>
          For each selected subject, FamilyRoot pulls their photos from PhotoPrism and links them to the
          matched family member. Photos are referenced by their PhotoPrism UID — no files are copied.
          Re-syncing is safe and will not create duplicates.
        </div>
      </div>

      <button
        className="primary"
        onClick={startSync}
        disabled={running || selected.size === 0}
        style={{ fontSize: 14, padding: "10px 28px", marginBottom: 16 }}
      >
        {running ? "Syncing…" : "Sync now"}
      </button>

      {(running || log.length > 0) && (
        <div>
          <SectionLabel>
            Sync progress {running ? "● running" : done ? "✓ complete" : ""}
          </SectionLabel>
          <LogBox lines={log} running={running} logRef={logRef} />
        </div>
      )}

      {done && stats && (
        <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
          {[
            ["Subjects", stats.subjects_synced],
            ["Photos linked", stats.photos_synced],
            ["Errors", stats.errors],
          ].map(([label, val]) => (
            <div key={label} style={{
              flex: 1, background: "var(--bg-input)", borderRadius: 8,
              padding: "10px 14px", textAlign: "center",
            }}>
              <div style={{ fontSize: 20, fontWeight: 600, color: val > 0 && label === "Errors" ? "#E07070" : "var(--accent)" }}>
                {(val ?? 0).toLocaleString()}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 3 }}>{label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── main tab ──────────────────────────────────────────────────────────────────

const TABS = ["connect", "subjects", "albums", "sync"];

export default function PhotoPrismTab() {
  const [tab,    setTab]    = useState("connect");
  const [status, setStatus] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/photoprism/status`)
      .then(r => r.json())
      .then(d => {
        setStatus(d);
        if (d.connected) setTab("subjects");
      })
      .catch(() => {});
  }, []);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* toolbar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "0 24px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-sidebar)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 0" }}>
          <span style={{ fontSize: 18 }}>📷</span>
          <span style={{ fontWeight: 600, fontSize: 15 }}>PhotoPrism</span>
          {status && (
            <span style={{ fontSize: 12, marginLeft: 4 }}>
              <StatusDot ok={status.connected} />
              {status.connected ? "Connected" : "Not connected"}
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: 2, marginLeft: 16 }}>
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: "none", border: "none",
                borderBottom: `2px solid ${tab === t ? "var(--accent)" : "transparent"}`,
                padding: "14px 16px 12px",
                fontSize: 12,
                fontWeight: tab === t ? 500 : 400,
                color: tab === t ? "var(--text-primary)" : "var(--text-secondary)",
                cursor: "pointer",
                textTransform: "capitalize",
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
          <ConnectPanel status={status} onConnected={d => { setStatus(d); setTab("subjects"); }} />
        )}

        {tab === "subjects" && !status?.connected && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
            Connect to PhotoPrism first on the Connect tab.
          </div>
        )}
        {tab === "subjects" && status?.connected && (
          <SubjectsPanel onMappingsChange={() => {}} />
        )}

        {tab === "albums" && !status?.connected && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
            Connect to PhotoPrism first on the Connect tab.
          </div>
        )}
        {tab === "albums" && status?.connected && <AlbumsPanel />}

        {tab === "sync" && !status?.connected && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
            Connect to PhotoPrism first on the Connect tab.
          </div>
        )}
        {tab === "sync" && status?.connected && <SyncPanel />}
      </div>
    </div>
  );
}
