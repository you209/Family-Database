import { useState, useEffect, useCallback } from "react";

// ── helpers ───────────────────────────────────────────────────────────────────

const TYPE_LABELS = {
  document: "Document",
  website: "Website",
  book: "Book",
  certificate: "Certificate",
  census: "Census",
  newspaper: "Newspaper",
};

const QUALITY_LABELS = {
  0: "Unreliable",
  1: "Questionable",
  2: "Primary",
  3: "Direct",
};

const OBJECT_TYPES = ["person", "event", "family", "place"];

const badge = (text, color = "var(--accent)") => ({
  display: "inline-block",
  fontSize: 10,
  fontWeight: 600,
  padding: "2px 7px",
  borderRadius: 5,
  background: `${color}22`,
  color,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
});

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--bg-sel)",
  border: "1px solid var(--border)",
  borderRadius: 7,
  padding: "7px 10px",
  fontSize: 13,
  color: "var(--text-primary)",
  outline: "none",
};

const btnStyle = {
  background: "var(--bg-sel)",
  border: "1px solid var(--border)",
  borderRadius: 7,
  padding: "6px 14px",
  fontSize: 13,
  color: "var(--text-primary)",
  cursor: "pointer",
};

const accentBtn = {
  ...btnStyle,
  background: "var(--accent, #1D9E75)",
  border: "none",
  color: "#fff",
};

const dangerBtn = {
  ...btnStyle,
  background: "rgba(224,92,92,0.12)",
  border: "1px solid rgba(224,92,92,0.3)",
  color: "#e05c5c",
};

// ── Left panel ────────────────────────────────────────────────────────────────

function SourceList({ sources, selectedId, onSelect, onNew }) {
  return (
    <div style={{
      width: 280,
      flexShrink: 0,
      borderRight: "1px solid var(--border)",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      <div style={{ padding: "14px 12px 10px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontWeight: 600, fontSize: 15, color: "var(--text-primary)", marginBottom: 10 }}>
          Sources
        </div>
        <button style={{ ...accentBtn, width: "100%", marginBottom: 0 }} onClick={onNew}>
          + New source
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {sources.length === 0 && (
          <div style={{ padding: 20, fontSize: 13, color: "var(--text-tertiary)", textAlign: "center" }}>
            No sources yet
          </div>
        )}
        {sources.map(src => (
          <div
            key={src.id}
            onClick={() => onSelect(src.id)}
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid var(--border)",
              cursor: "pointer",
              background: selectedId === src.id ? "var(--bg-sel)" : "transparent",
              transition: "background 0.1s",
            }}
            onMouseEnter={e => { if (selectedId !== src.id) e.currentTarget.style.background = "var(--bg-card)"; }}
            onMouseLeave={e => { if (selectedId !== src.id) e.currentTarget.style.background = "transparent"; }}
          >
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {src.title}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={badge(TYPE_LABELS[src.source_type] || src.source_type)}>
                {TYPE_LABELS[src.source_type] || src.source_type}
              </span>
              {src.citation_count > 0 && (
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                  {src.citation_count} citation{src.citation_count !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Right panel: editor ───────────────────────────────────────────────────────

function SourceEditor({ source, onSaved, onDeleted, onCancel }) {
  const isNew = !source?.id;
  const [form, setForm] = useState({
    title: source?.title || "",
    author: source?.author || "",
    publisher: source?.publisher || "",
    pub_date: source?.pub_date || "",
    url: source?.url || "",
    source_type: source?.source_type || "document",
    notes: source?.notes || "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  // Citation state
  const [citations, setCitations] = useState(source?.citations || []);
  const [citeForm, setCiteForm] = useState({ object_type: "person", object_id: "", page: "", quality: 2 });
  const [addingCite, setAddingCite] = useState(false);
  const [citeErr, setCiteErr] = useState(null);

  useEffect(() => {
    setForm({
      title: source?.title || "",
      author: source?.author || "",
      publisher: source?.publisher || "",
      pub_date: source?.pub_date || "",
      url: source?.url || "",
      source_type: source?.source_type || "document",
      notes: source?.notes || "",
    });
    setCitations(source?.citations || []);
    setErr(null);
    setCiteErr(null);
    setAddingCite(false);
  }, [source?.id]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.title.trim()) { setErr("Title is required"); return; }
    setSaving(true);
    setErr(null);
    try {
      const url = isNew ? "/api/sources/" : `/api/sources/${source.id}`;
      const method = isNew ? "POST" : "PUT";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || "Save failed"); return; }
      onSaved(d);
    } catch {
      setErr("Network error");
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!window.confirm(`Delete source "${source.title}"? All citations will be removed.`)) return;
    await fetch(`/api/sources/${source.id}`, { method: "DELETE" });
    onDeleted(source.id);
  };

  const removeCitation = async (cid) => {
    await fetch(`/api/citations/${cid}`, { method: "DELETE" });
    setCitations(cs => cs.filter(c => c.id !== cid));
  };

  const addCitation = async () => {
    if (!citeForm.object_id) { setCiteErr("Object ID is required"); return; }
    setCiteErr(null);
    try {
      const r = await fetch(`/api/sources/${source.id}/cite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...citeForm, object_id: parseInt(citeForm.object_id) }),
      });
      const d = await r.json();
      if (!r.ok) { setCiteErr(d.error || "Failed"); return; }
      setCitations(cs => {
        const idx = cs.findIndex(c => c.id === d.id);
        if (idx >= 0) { const n = [...cs]; n[idx] = d; return n; }
        return [...cs, d];
      });
      setCiteForm({ object_type: "person", object_id: "", page: "", quality: 2 });
      setAddingCite(false);
    } catch {
      setCiteErr("Network error");
    }
  };

  const field = (label, key, type = "text", extra = {}) => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>
        {label}
      </label>
      <input type={type} value={form[key]} onChange={set(key)} style={inputStyle} {...extra} />
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--text-primary)" }}>
          {isNew ? "New Source" : "Edit Source"}
        </h2>
        {!isNew && (
          <button style={dangerBtn} onClick={del}>Delete source</button>
        )}
      </div>

      {field("Title *", "title")}
      {field("Author", "author")}
      {field("Publisher", "publisher")}
      {field("Publication date", "pub_date")}
      {field("URL", "url", "url")}

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>
          Type
        </label>
        <select value={form.source_type} onChange={set("source_type")} style={{ ...inputStyle, width: "auto" }}>
          {Object.entries(TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>
          Notes
        </label>
        <textarea
          value={form.notes}
          onChange={set("notes")}
          rows={3}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </div>

      {err && <div style={{ fontSize: 13, color: "#e05c5c", marginBottom: 10 }}>{err}</div>}

      <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
        <button style={accentBtn} onClick={save} disabled={saving}>
          {saving ? "Saving…" : (isNew ? "Create source" : "Save changes")}
        </button>
        {isNew && onCancel && (
          <button style={btnStyle} onClick={onCancel}>Cancel</button>
        )}
      </div>

      {/* Citations section — only for saved sources */}
      {!isNew && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
            Citations ({citations.length})
          </div>

          {citations.length === 0 && (
            <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 14 }}>No citations yet.</div>
          )}

          {citations.map(c => (
            <div key={c.id} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 10px",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 7,
              marginBottom: 6,
              fontSize: 13,
            }}>
              <div>
                <span style={{ color: "var(--text-secondary)", textTransform: "capitalize" }}>{c.object_type}</span>
                <span style={{ color: "var(--text-tertiary)", margin: "0 4px" }}>#</span>
                <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{c.object_id}</span>
                {c.page && <span style={{ color: "var(--text-tertiary)", marginLeft: 8 }}>p. {c.page}</span>}
                <span style={{ ...badge(QUALITY_LABELS[c.quality] || "Primary", "#8B7CF8"), marginLeft: 8 }}>
                  {QUALITY_LABELS[c.quality] || "Primary"}
                </span>
              </div>
              <button
                onClick={() => removeCitation(c.id)}
                style={{ ...dangerBtn, padding: "3px 8px", fontSize: 12 }}
              >
                Remove
              </button>
            </div>
          ))}

          {!addingCite && (
            <button style={{ ...btnStyle, marginTop: 4 }} onClick={() => setAddingCite(true)}>
              + Add citation
            </button>
          )}

          {addingCite && (
            <div style={{
              marginTop: 10,
              padding: 14,
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 8,
            }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>Type</label>
                  <select
                    value={citeForm.object_type}
                    onChange={e => setCiteForm(f => ({ ...f, object_type: e.target.value }))}
                    style={{ ...inputStyle, width: "auto" }}
                  >
                    {OBJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>ID</label>
                  <input
                    type="number"
                    value={citeForm.object_id}
                    onChange={e => setCiteForm(f => ({ ...f, object_id: e.target.value }))}
                    style={{ ...inputStyle, width: 80 }}
                    placeholder="e.g. 5"
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>Page</label>
                  <input
                    type="text"
                    value={citeForm.page}
                    onChange={e => setCiteForm(f => ({ ...f, page: e.target.value }))}
                    style={{ ...inputStyle, width: 80 }}
                    placeholder="e.g. 42"
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>Quality</label>
                  <select
                    value={citeForm.quality}
                    onChange={e => setCiteForm(f => ({ ...f, quality: parseInt(e.target.value) }))}
                    style={{ ...inputStyle, width: "auto" }}
                  >
                    {Object.entries(QUALITY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
                  <button style={accentBtn} onClick={addCitation}>Add</button>
                  <button style={btnStyle} onClick={() => { setAddingCite(false); setCiteErr(null); }}>Cancel</button>
                </div>
              </div>
              {citeErr && <div style={{ fontSize: 12, color: "#e05c5c", marginTop: 6 }}>{citeErr}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── SourcesTab ────────────────────────────────────────────────────────────────

export default function SourcesTab() {
  const [sources, setSources]       = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail]         = useState(null);
  const [creating, setCreating]     = useState(false);
  const [search, setSearch]         = useState("");
  const [loading, setLoading]       = useState(false);

  const loadSources = useCallback(async (q = "") => {
    setLoading(true);
    try {
      const r = await fetch(`/api/sources/${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      if (r.ok) setSources(await r.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSources(); }, [loadSources]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => loadSources(search), 300);
    return () => clearTimeout(t);
  }, [search, loadSources]);

  const selectSource = async (id) => {
    setCreating(false);
    setSelectedId(id);
    const r = await fetch(`/api/sources/${id}`);
    if (r.ok) setDetail(await r.json());
  };

  const handleNew = () => {
    setSelectedId(null);
    setDetail(null);
    setCreating(true);
  };

  const handleSaved = async (src) => {
    await loadSources(search);
    setCreating(false);
    await selectSource(src.id);
  };

  const handleDeleted = (id) => {
    setSources(s => s.filter(x => x.id !== id));
    setSelectedId(null);
    setDetail(null);
  };

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden", height: "100%" }}>
      {/* Left */}
      <div style={{ width: 280, flexShrink: 0, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "14px 12px 10px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: "var(--text-primary)", marginBottom: 10 }}>
            Sources
          </div>
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search sources…"
            style={{ ...inputStyle, marginBottom: 8 }}
          />
          <button style={{ ...accentBtn, width: "100%" }} onClick={handleNew}>
            + New source
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading && (
            <div style={{ padding: 20, fontSize: 13, color: "var(--text-tertiary)", textAlign: "center" }}>Loading…</div>
          )}
          {!loading && sources.length === 0 && (
            <div style={{ padding: 20, fontSize: 13, color: "var(--text-tertiary)", textAlign: "center" }}>No sources yet</div>
          )}
          {sources.map(src => (
            <div
              key={src.id}
              onClick={() => selectSource(src.id)}
              style={{
                padding: "10px 14px",
                borderBottom: "1px solid var(--border)",
                cursor: "pointer",
                background: selectedId === src.id ? "var(--bg-sel)" : "transparent",
                transition: "background 0.1s",
              }}
              onMouseEnter={e => { if (selectedId !== src.id) e.currentTarget.style.background = "var(--bg-card)"; }}
              onMouseLeave={e => { if (selectedId !== src.id) e.currentTarget.style.background = "transparent"; }}
            >
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {src.title}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={badge(TYPE_LABELS[src.source_type] || src.source_type)}>
                  {TYPE_LABELS[src.source_type] || src.source_type}
                </span>
                {src.citation_count > 0 && (
                  <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                    {src.citation_count} citation{src.citation_count !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right */}
      {creating && (
        <SourceEditor
          source={null}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          onCancel={() => setCreating(false)}
        />
      )}
      {!creating && detail && (
        <SourceEditor
          source={detail}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
      {!creating && !detail && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)", fontSize: 14 }}>
          Select a source or create a new one
        </div>
      )}
    </div>
  );
}

// ── NotesDrawer ───────────────────────────────────────────────────────────────

const NOTE_TYPES = ["general", "research", "todo", "transcription"];

const noteTypeBadgeColor = {
  general: "var(--accent)",
  research: "#5B8BF5",
  todo: "#F5A623",
  transcription: "#8B7CF8",
};

export function NotesDrawer({ objectType, objectId }) {
  const [notes, setNotes]           = useState([]);
  const [expanded, setExpanded]     = useState({});
  const [editing, setEditing]       = useState(null); // note id being edited
  const [editForm, setEditForm]     = useState({});
  const [addOpen, setAddOpen]       = useState(false);
  const [addForm, setAddForm]       = useState({ title: "", body: "", note_type: "general" });
  const [saving, setSaving]         = useState(false);

  const load = useCallback(async () => {
    if (!objectType || objectId == null) return;
    const r = await fetch(`/api/notes?object_type=${objectType}&object_id=${objectId}`);
    if (r.ok) setNotes(await r.json());
  }, [objectType, objectId]);

  useEffect(() => { load(); }, [load]);

  const createNote = async () => {
    if (!addForm.body.trim()) return;
    setSaving(true);
    try {
      const r = await fetch("/api/notes/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ object_type: objectType, object_id: objectId, ...addForm }),
      });
      if (r.ok) {
        setAddForm({ title: "", body: "", note_type: "general" });
        setAddOpen(false);
        load();
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteNote = async (id) => {
    await fetch(`/api/notes/${id}`, { method: "DELETE" });
    setNotes(n => n.filter(x => x.id !== id));
  };

  const startEdit = (note) => {
    setEditing(note.id);
    setEditForm({ title: note.title || "", body: note.body, note_type: note.note_type });
  };

  const saveEdit = async (id) => {
    setSaving(true);
    try {
      const r = await fetch(`/api/notes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (r.ok) {
        setEditing(null);
        load();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: "16px 0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Notes ({notes.length})
        </div>
        <button style={{ ...btnStyle, padding: "4px 10px", fontSize: 12 }} onClick={() => setAddOpen(o => !o)}>
          {addOpen ? "Cancel" : "+ Add note"}
        </button>
      </div>

      {addOpen && (
        <div style={{ marginBottom: 14, padding: 12, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8 }}>
          <input
            type="text"
            placeholder="Title (optional)"
            value={addForm.title}
            onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))}
            style={{ ...inputStyle, marginBottom: 8 }}
          />
          <textarea
            placeholder="Note body…"
            value={addForm.body}
            onChange={e => setAddForm(f => ({ ...f, body: e.target.value }))}
            rows={3}
            style={{ ...inputStyle, resize: "vertical", marginBottom: 8 }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              value={addForm.note_type}
              onChange={e => setAddForm(f => ({ ...f, note_type: e.target.value }))}
              style={{ ...inputStyle, width: "auto" }}
            >
              {NOTE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button style={accentBtn} onClick={createNote} disabled={saving || !addForm.body.trim()}>
              {saving ? "Saving…" : "Add"}
            </button>
          </div>
        </div>
      )}

      {notes.length === 0 && !addOpen && (
        <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>No notes yet.</div>
      )}

      {notes.map(note => (
        <div key={note.id} style={{ marginBottom: 8, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          {editing === note.id ? (
            <div style={{ padding: 12 }}>
              <input
                type="text"
                value={editForm.title}
                onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Title (optional)"
                style={{ ...inputStyle, marginBottom: 8 }}
              />
              <textarea
                value={editForm.body}
                onChange={e => setEditForm(f => ({ ...f, body: e.target.value }))}
                rows={3}
                style={{ ...inputStyle, resize: "vertical", marginBottom: 8 }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <select
                  value={editForm.note_type}
                  onChange={e => setEditForm(f => ({ ...f, note_type: e.target.value }))}
                  style={{ ...inputStyle, width: "auto" }}
                >
                  {NOTE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <button style={accentBtn} onClick={() => saveEdit(note.id)} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </button>
                <button style={btnStyle} onClick={() => setEditing(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div
              style={{ padding: "9px 12px", cursor: "pointer" }}
              onClick={() => setExpanded(e => ({ ...e, [note.id]: !e[note.id] }))}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: note.title ? 500 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {note.title || note.body.slice(0, 60) + (note.body.length > 60 ? "…" : "")}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                    <span style={badge(note.note_type, noteTypeBadgeColor[note.note_type] || "var(--accent)")}>
                      {note.note_type}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                      {note.updated_at?.slice(0, 10) || note.created_at?.slice(0, 10)}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  <button style={{ ...btnStyle, padding: "3px 8px", fontSize: 12 }} onClick={() => startEdit(note)}>Edit</button>
                  <button style={{ ...dangerBtn, padding: "3px 8px", fontSize: 12 }} onClick={() => deleteNote(note.id)}>Delete</button>
                </div>
              </div>

              {expanded[note.id] && note.title && (
                <div style={{ marginTop: 8, fontSize: 13, color: "var(--text-secondary)", whiteSpace: "pre-wrap", borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                  {note.body}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
