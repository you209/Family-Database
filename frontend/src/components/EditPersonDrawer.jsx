/**
 * FamilyRoot — EditPersonDrawer.jsx
 *
 * Full Gramps-field-compatible person editor.
 * Sections:
 *   Identity   — primary name (given, surname, prefix, suffix, call), gender, privacy, living
 *   Alternate names — list of additional name records
 *   Events     — add / edit / delete life events with date + place + notes
 *   Family     — parents family, own families (spouses + children)
 *   Attributes — occupation, religion, height, etc.
 *   Notes      — free-text notes
 */

import { useState, useEffect, useCallback } from "react";

const API = "";

// ── tiny UI pieces ────────────────────────────────────────────────────────────

function Field({ label, children, row }) {
  return (
    <div style={{ marginBottom: 14, display: row ? "flex" : "block", alignItems: row ? "center" : undefined, gap: row ? 12 : 0 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: row ? 0 : 5, minWidth: row ? 90 : undefined }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, style }) {
  return (
    <input
      type="text"
      value={value ?? ""}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ width: "100%", fontSize: 13, ...style }}
    />
  );
}

function Select({ value, onChange, options, style }) {
  return (
    <select value={value ?? ""} onChange={e => onChange(e.target.value)} style={{ width: "100%", fontSize: 13, ...style }}>
      {options.map(o => (
        <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
      ))}
    </select>
  );
}

function Textarea({ value, onChange, rows = 3, placeholder }) {
  return (
    <textarea
      value={value ?? ""}
      onChange={e => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      style={{ width: "100%", fontSize: 13, resize: "vertical" }}
    />
  );
}

function SectionTitle({ children, action }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "24px 0 12px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
        {children}
      </div>
      {action}
    </div>
  );
}

function AddBtn({ onClick, label }) {
  return (
    <button onClick={onClick} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, color: "var(--accent)", border: "1px solid var(--accent)", background: "none" }}>
      + {label}
    </button>
  );
}

function DeleteBtn({ onClick }) {
  return (
    <button onClick={onClick} style={{ fontSize: 11, padding: "2px 8px", color: "#E07070", border: "1px solid #E07070", background: "none", borderRadius: 6 }}>
      Remove
    </button>
  );
}

function Row({ children, gap = 10 }) {
  return <div style={{ display: "flex", gap, alignItems: "flex-start" }}>{children}</div>;
}

function SaveBar({ saving, onSave, onCancel, dirty }) {
  return (
    <div style={{
      padding: "12px 24px",
      borderTop: "1px solid var(--border)",
      display: "flex", gap: 10, alignItems: "center",
      background: "var(--bg-sidebar)",
      flexShrink: 0,
    }}>
      <button
        className="primary"
        onClick={onSave}
        disabled={saving || !dirty}
        style={{ fontSize: 13, padding: "8px 24px" }}
      >
        {saving ? "Saving…" : "Save changes"}
      </button>
      <button onClick={onCancel} style={{ fontSize: 13, padding: "8px 16px" }}>
        Cancel
      </button>
      {dirty && <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Unsaved changes</span>}
    </div>
  );
}

// ── place autocomplete ────────────────────────────────────────────────────────

function PlacePicker({ value, onChange }) {
  const [q, setQ] = useState(value?.name ?? "");
  const [results, setResults] = useState([]);

  useEffect(() => { setQ(value?.name ?? ""); }, [value]);

  useEffect(() => {
    if (!q || q === value?.name) { setResults([]); return; }
    const t = setTimeout(() => {
      fetch(`${API}/api/places/?q=${encodeURIComponent(q)}&limit=8`)
        .then(r => r.json()).then(d => setResults(d.places || [])).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [q, value]);

  const [showNew, setShowNew] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <input
        type="text"
        value={q}
        onChange={e => { setQ(e.target.value); if (!e.target.value) onChange(null); }}
        placeholder="Search or type to add a place…"
        style={{ width: "100%", fontSize: 13 }}
      />
      {results.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 99,
          background: "var(--bg-card)", border: "1px solid var(--border-card)",
          borderRadius: 8, marginTop: 3, overflow: "hidden",
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}>
          {results.map(p => (
            <div key={p.id}
              onMouseDown={() => { onChange(p); setQ(p.name); setResults([]); }}
              style={{ padding: "8px 12px", cursor: "pointer", fontSize: 12,
                borderBottom: "1px solid var(--border)" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--bg-card-hov)"}
              onMouseLeave={e => e.currentTarget.style.background = ""}
            >
              {p.name} {p.place_type && <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>· {p.place_type}</span>}
            </div>
          ))}
          <div
            onMouseDown={() => { setShowNew(true); setResults([]); }}
            style={{ padding: "8px 12px", cursor: "pointer", fontSize: 12, color: "var(--accent)" }}
          >
            + Create "{q}"
          </div>
        </div>
      )}
      {showNew && (
        <NewPlaceForm name={q} onCreated={p => { onChange(p); setQ(p.name); setShowNew(false); }} onCancel={() => setShowNew(false)} />
      )}
    </div>
  );
}

function NewPlaceForm({ name, onCreated, onCancel }) {
  const [form, setForm] = useState({ name, place_type: "", latitude: "", longitude: "" });
  const set = k => v => setForm(f => ({ ...f, [k]: v }));
  const save = () => {
    fetch(`${API}/api/places/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, latitude: form.latitude || null, longitude: form.longitude || null }),
    }).then(r => r.json()).then(onCreated).catch(() => {});
  };
  return (
    <div style={{
      position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
      background: "var(--bg-card)", border: "1px solid var(--border-card)",
      borderRadius: 8, marginTop: 3, padding: 12,
      boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", marginBottom: 10 }}>NEW PLACE</div>
      <Row>
        <TextInput value={form.name} onChange={set("name")} placeholder="Place name" style={{ flex: 2 }} />
        <Select value={form.place_type} onChange={set("place_type")} style={{ flex: 1 }} options={[
          { value: "", label: "Type…" }, "City", "County", "Country", "Parish", "Address", "State", "Region",
        ]} />
      </Row>
      <Row gap={8} style={{ marginTop: 8 }}>
        <TextInput value={form.latitude}  onChange={set("latitude")}  placeholder="Latitude"  style={{ flex: 1 }} />
        <TextInput value={form.longitude} onChange={set("longitude")} placeholder="Longitude" style={{ flex: 1 }} />
      </Row>
      <Row gap={8} style={{ marginTop: 10 }}>
        <button className="primary" onClick={save} style={{ fontSize: 12, padding: "5px 14px" }}>Create</button>
        <button onClick={onCancel} style={{ fontSize: 12, padding: "5px 10px" }}>Cancel</button>
      </Row>
    </div>
  );
}

// ── person search (for family linking) ───────────────────────────────────────

function PersonSearch({ placeholder, onSelect, exclude = [] }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);

  useEffect(() => {
    if (!q) { setResults([]); return; }
    const t = setTimeout(() => {
      fetch(`${API}/api/persons/?q=${encodeURIComponent(q)}&per_page=8`)
        .then(r => r.json()).then(d => setResults((d.persons || []).filter(p => !exclude.includes(p.id))))
        .catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div style={{ position: "relative" }}>
      <input
        type="search"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder={placeholder}
        style={{ width: "100%", fontSize: 13 }}
      />
      {results.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 99,
          background: "var(--bg-card)", border: "1px solid var(--border-card)",
          borderRadius: 8, marginTop: 3, overflow: "hidden",
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}>
          {results.map(p => (
            <div key={p.id}
              onMouseDown={() => { onSelect(p); setQ(""); setResults([]); }}
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

// ── event editor ──────────────────────────────────────────────────────────────

const EVENT_TYPES = [
  "Birth","Baptism","Christening","Death","Burial","Cremation",
  "Marriage","Divorce","Engagement","Annulment",
  "Residence","Emigration","Immigration",
  "Occupation","Education","Military Service",
  "Property","Award","Medical","Custom",
];

function EventEditor({ event, onSave, onDelete, personId }) {
  const isNew = !event.event_id;
  const [form, setForm] = useState({
    event_type:  event.event_type  || "Birth",
    date_text:   event.date_text   || "",
    date_year:   event.date_year   || "",
    date_month:  event.date_month  || "",
    date_day:    event.date_day    || "",
    description: event.description || "",
    notes:       event.notes       || "",
    place:       event.place_name ? { id: event.place_id, name: event.place_name } : null,
  });
  const [saving, setSaving] = useState(false);
  const set = k => v => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    const body = {
      event_type:  form.event_type,
      date_text:   form.date_text  || null,
      date_year:   form.date_year  ? parseInt(form.date_year)  : null,
      date_month:  form.date_month ? parseInt(form.date_month) : null,
      date_day:    form.date_day   ? parseInt(form.date_day)   : null,
      description: form.description || null,
      notes:       form.notes       || null,
      place_id:    form.place?.id   || null,
    };
    try {
      let eventId = event.event_id;
      if (isNew) {
        const r = await fetch(`${API}/api/events/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const d = await r.json();
        eventId = d.id;
        await fetch(`${API}/api/events/${eventId}/persons`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ person_id: personId, role: "Primary" }) });
      } else {
        await fetch(`${API}/api/events/${eventId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      }
      onSave({ ...form, event_id: eventId, place_id: form.place?.id, place_name: form.place?.name });
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!window.confirm("Delete this event?")) return;
    await fetch(`${API}/api/events/${event.event_id}`, { method: "DELETE" });
    onDelete(event.event_id);
  };

  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--border-card)",
      borderRadius: 10, padding: 14, marginBottom: 10,
    }}>
      <Row>
        <div style={{ flex: 1 }}>
          <Select value={form.event_type} onChange={set("event_type")} options={EVENT_TYPES} />
        </div>
        <TextInput value={form.date_text} onChange={set("date_text")} placeholder="Date (e.g. Abt 1920)" style={{ flex: 1 }} />
      </Row>
      <div style={{ marginTop: 8 }}>
        <PlacePicker value={form.place} onChange={set("place")} />
      </div>
      <div style={{ marginTop: 8 }}>
        <TextInput value={form.description} onChange={set("description")} placeholder="Description (optional)" />
      </div>
      <Row gap={8} style={{ marginTop: 10 }}>
        <button className="primary" onClick={save} disabled={saving} style={{ fontSize: 12, padding: "5px 14px" }}>
          {saving ? "Saving…" : isNew ? "Add event" : "Update"}
        </button>
        {!isNew && <DeleteBtn onClick={del} />}
      </Row>
    </div>
  );
}

// ── family section ────────────────────────────────────────────────────────────

function FamilySection({ personId, personName }) {
  const [families, setFamilies] = useState(null);
  const [addingChild, setAddingChild] = useState(null); // family_id

  useEffect(() => {
    fetch(`${API}/api/persons/${personId}/families`)
      .then(r => r.json()).then(d => setFamilies(d))
      .catch(() => {});
  }, [personId]);

  const addChild = async (familyId, childPerson) => {
    await fetch(`${API}/api/families/${familyId}/children`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ child_id: childPerson.id }),
    });
    setFamilies(prev => prev.map(f =>
      f.id === familyId
        ? { ...f, children: [...(f.children || []), { id: childPerson.id, name_given: childPerson.name_given, name_surname: childPerson.name_surname, birth_year: childPerson.birth_year }] }
        : f
    ));
    setAddingChild(null);
  };

  const removeChild = async (familyId, childId) => {
    if (!window.confirm("Remove this child from the family?")) return;
    await fetch(`${API}/api/families/${familyId}/children/${childId}`, { method: "DELETE" });
    setFamilies(prev => prev.map(f =>
      f.id === familyId ? { ...f, children: f.children.filter(c => c.id !== childId) } : f
    ));
  };

  const createFamily = async (spousePerson) => {
    const body = {};
    // detect if person is likely M/F — default to person as father, spouse as mother
    body.father_id = personId;
    if (spousePerson) body.mother_id = spousePerson.id;
    const r = await fetch(`${API}/api/families/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, rel_type: "Married" }),
    });
    const fam = await r.json();
    setFamilies(prev => [...(prev || []), { ...fam, children: [], as_parent: true }]);
  };

  if (!families) return <div style={{ color: "var(--text-tertiary)", fontSize: 12 }}>Loading…</div>;

  const asParent = families.filter(f => f.as_parent);
  const asChild  = families.filter(f => f.as_child);

  return (
    <>
      {/* As child */}
      {asChild.length > 0 && (
        <>
          <SectionTitle>Parents</SectionTitle>
          {asChild.map(f => (
            <div key={f.id} style={{ background: "var(--bg-card)", border: "1px solid var(--border-card)", borderRadius: 10, padding: 12, marginBottom: 8 }}>
              {f.father && <div style={{ fontSize: 13, marginBottom: 4 }}><span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>Father </span><strong>{f.father.name_given} {f.father.name_surname}</strong>{f.father.birth_year ? ` (b. ${f.father.birth_year})` : ""}</div>}
              {f.mother && <div style={{ fontSize: 13 }}><span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>Mother </span><strong>{f.mother.name_given} {f.mother.name_surname}</strong>{f.mother.birth_year ? ` (b. ${f.mother.birth_year})` : ""}</div>}
            </div>
          ))}
        </>
      )}

      {/* As parent / spouse */}
      <SectionTitle action={<AddBtn label="Add spouse / family" onClick={() => {}} />}>
        Spouse & children
      </SectionTitle>

      {asParent.map(f => {
        const spouse = f.father?.id === personId ? f.mother : f.father;
        return (
          <div key={f.id} style={{ background: "var(--bg-card)", border: "1px solid var(--border-card)", borderRadius: 10, padding: 14, marginBottom: 12 }}>
            {spouse && (
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>
                ⚭ {spouse.name_given} {spouse.name_surname}
                {spouse.birth_year ? <span style={{ color: "var(--text-tertiary)", fontSize: 11, marginLeft: 6 }}>b. {spouse.birth_year}</span> : ""}
              </div>
            )}

            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: 6 }}>Children</div>
              {(f.children || []).map(c => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                  <span>{c.name_given} {c.name_surname}{c.birth_year ? <span style={{ color: "var(--text-tertiary)", fontSize: 11, marginLeft: 6 }}>b. {c.birth_year}</span> : ""}</span>
                  <DeleteBtn onClick={() => removeChild(f.id, c.id)} />
                </div>
              ))}
              {addingChild === f.id ? (
                <div style={{ marginTop: 8 }}>
                  <PersonSearch
                    placeholder="Search for child…"
                    onSelect={p => addChild(f.id, p)}
                    exclude={[personId, ...(f.children || []).map(c => c.id)]}
                  />
                  <button onClick={() => setAddingChild(null)} style={{ fontSize: 11, marginTop: 6, padding: "3px 10px" }}>Cancel</button>
                </div>
              ) : (
                <button onClick={() => setAddingChild(f.id)} style={{ fontSize: 11, marginTop: 8, padding: "3px 10px", color: "var(--accent)", border: "1px solid var(--accent)", background: "none", borderRadius: 6 }}>
                  + Add child
                </button>
              )}
            </div>
          </div>
        );
      })}

      <div style={{ marginTop: 4 }}>
        <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 8 }}>Add a spouse (creates new family)</div>
        <PersonSearch
          placeholder="Search for spouse…"
          onSelect={createFamily}
          exclude={[personId]}
        />
      </div>
    </>
  );
}

// ── main drawer ───────────────────────────────────────────────────────────────

const TABS = ["identity", "events", "family", "notes"];

export default function EditPersonDrawer({ person, onClose, onSaved }) {
  const [tab, setTab] = useState("identity");

  // identity fields
  const [form, setForm] = useState({
    name_given:   person.name_given   || "",
    name_surname: person.name_surname || "",
    name_prefix:  person.name_prefix  || "",
    name_suffix:  person.name_suffix  || "",
    name_call:    person.name_call    || "",
    gender:       person.gender       || "U",
    birth_year:   person.birth_year   || "",
    death_year:   person.death_year   || "",
    birth_place:  person.birth_place  || "",
    is_living:    person.is_living    || 0,
    privacy:      person.privacy      || 0,
    notes:        person.notes        || "",
  });
  const [dirty, setDirty]   = useState(false);
  const [saving, setSaving] = useState(false);

  // alternate names
  const [altNames, setAltNames] = useState(null);
  const [newAltName, setNewAltName] = useState(null);

  // events
  const [events, setEvents]       = useState(null);
  const [addingEvent, setAddingEvent] = useState(false);

  // attributes
  const [attrs, setAttrs]     = useState(null);
  const [newAttr, setNewAttr] = useState(null);

  const setF = k => v => { setForm(f => ({ ...f, [k]: v })); setDirty(true); };

  // load detail data
  useEffect(() => {
    fetch(`${API}/api/persons/${person.id}`)
      .then(r => r.json())
      .then(d => {
        setEvents(d.events || []);
        setAttrs(d.attributes || []);
      })
      .catch(() => {});

    fetch(`${API}/api/persons/${person.id}/names`)
      .then(r => r.json())
      .then(d => setAltNames(d.names || []))
      .catch(() => {});
  }, [person.id]);

  // save identity + notes
  const saveIdentity = useCallback(async () => {
    setSaving(true);
    try {
      const body = { ...form, birth_year: form.birth_year ? parseInt(form.birth_year) : null, death_year: form.death_year ? parseInt(form.death_year) : null };
      const r = await fetch(`${API}/api/persons/${person.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const updated = await r.json();
      setDirty(false);
      onSaved?.(updated);
    } finally {
      setSaving(false);
    }
  }, [form, person.id, onSaved]);

  // add alternate name
  const addAltName = async (nameForm) => {
    const r = await fetch(`${API}/api/persons/${person.id}/names`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nameForm),
    });
    const d = await r.json();
    setAltNames(prev => [...(prev || []), d]);
    setNewAltName(null);
  };

  const deleteAltName = async (nameId) => {
    await fetch(`${API}/api/names/${nameId}`, { method: "DELETE" });
    setAltNames(prev => prev.filter(n => n.id !== nameId));
  };

  // attributes
  const addAttr = async (attrForm) => {
    const r = await fetch(`${API}/api/persons/${person.id}/attributes`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(attrForm),
    });
    const d = await r.json();
    setAttrs(prev => [...(prev || []), d]);
    setNewAttr(null);
  };

  const deleteAttr = async (attrId) => {
    await fetch(`${API}/api/attributes/${attrId}`, { method: "DELETE" });
    setAttrs(prev => prev.filter(a => a.id !== attrId));
  };

  const displayName = [form.name_given, form.name_surname].filter(Boolean).join(" ") || "New person";

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 110 }} />
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: 460,
        background: "var(--bg-sidebar)",
        borderLeft: "1px solid var(--border)",
        zIndex: 111,
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* header */}
        <div style={{ padding: "20px 24px 0", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Edit — {displayName}</div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>All Gramps-compatible fields</div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, color: "var(--text-secondary)", cursor: "pointer" }}>✕</button>
          </div>

          {/* tab bar */}
          <div style={{ display: "flex", gap: 2 }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: "none", border: "none",
                borderBottom: `2px solid ${tab === t ? "var(--accent)" : "transparent"}`,
                padding: "8px 14px", fontSize: 12,
                fontWeight: tab === t ? 500 : 400,
                color: tab === t ? "var(--text-primary)" : "var(--text-secondary)",
                cursor: "pointer", marginBottom: -1, textTransform: "capitalize",
              }}>
                {t}
                {t === "events" && events ? ` (${events.length})` : ""}
              </button>
            ))}
          </div>
        </div>

        {/* body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>

          {/* ── Identity ── */}
          {tab === "identity" && (
            <>
              <SectionTitle>Primary name</SectionTitle>
              <Row>
                <div style={{ flex: 1 }}>
                  <Field label="Prefix / title">
                    <TextInput value={form.name_prefix} onChange={setF("name_prefix")} placeholder="Mr, Mrs, Dr…" />
                  </Field>
                </div>
                <div style={{ flex: 1 }}>
                  <Field label="Suffix">
                    <TextInput value={form.name_suffix} onChange={setF("name_suffix")} placeholder="Jr, Sr, III…" />
                  </Field>
                </div>
              </Row>
              <Field label="Given / first name">
                <TextInput value={form.name_given} onChange={setF("name_given")} placeholder="Given name" />
              </Field>
              <Field label="Surname / family name">
                <TextInput value={form.name_surname} onChange={setF("name_surname")} placeholder="Surname" />
              </Field>
              <Field label="Call name / nickname">
                <TextInput value={form.name_call} onChange={setF("name_call")} placeholder="Nickname or call name" />
              </Field>

              <SectionTitle>Details</SectionTitle>
              <Row>
                <div style={{ flex: 1 }}>
                  <Field label="Gender">
                    <Select value={form.gender} onChange={setF("gender")} options={[
                      { value: "M", label: "Male" },
                      { value: "F", label: "Female" },
                      { value: "U", label: "Unknown" },
                      { value: "N", label: "Non-binary" },
                    ]} />
                  </Field>
                </div>
                <div style={{ flex: 1 }}>
                  <Field label="Privacy">
                    <Select value={form.privacy} onChange={v => setF("privacy")(parseInt(v))} options={[
                      { value: 0, label: "Public" },
                      { value: 1, label: "Private" },
                    ]} />
                  </Field>
                </div>
              </Row>
              <Row>
                <div style={{ flex: 1 }}>
                  <Field label="Birth year">
                    <TextInput value={form.birth_year} onChange={setF("birth_year")} placeholder="e.g. 1920" />
                  </Field>
                </div>
                <div style={{ flex: 1 }}>
                  <Field label="Death year">
                    <TextInput value={form.death_year} onChange={setF("death_year")} placeholder="e.g. 1985" />
                  </Field>
                </div>
              </Row>
              <Field label="Birth place">
                <TextInput value={form.birth_place} onChange={setF("birth_place")} placeholder="e.g. Liverpool, England" />
              </Field>
              <Field label="Living" row>
                <input type="checkbox" checked={!!form.is_living} onChange={e => setF("is_living")(e.target.checked ? 1 : 0)} style={{ accentColor: "var(--accent)", width: 15, height: 15 }} />
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Mark person as currently living</span>
              </Field>

              {/* Alternate names */}
              <SectionTitle action={<AddBtn label="Add name" onClick={() => setNewAltName({ name_type: "Also Known As", given: "", surname: "" })} />}>
                Alternate names
              </SectionTitle>
              {altNames === null && <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Loading…</div>}
              {altNames?.map(n => (
                <div key={n.id} style={{ background: "var(--bg-card)", border: "1px solid var(--border-card)", borderRadius: 8, padding: "10px 12px", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 2 }}>{n.name_type}</div>
                    <div style={{ fontSize: 13 }}>{[n.given, n.surname].filter(Boolean).join(" ")}</div>
                    {n.date_text && <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{n.date_text}</div>}
                  </div>
                  <DeleteBtn onClick={() => deleteAltName(n.id)} />
                </div>
              ))}
              {newAltName && (
                <AltNameForm
                  value={newAltName}
                  onSave={addAltName}
                  onCancel={() => setNewAltName(null)}
                />
              )}

              {/* Attributes */}
              <SectionTitle action={<AddBtn label="Add attribute" onClick={() => setNewAttr({ attr_type: "Occupation", value: "" })} />}>
                Attributes
              </SectionTitle>
              {attrs?.map(a => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                  <div>
                    <span style={{ color: "var(--text-secondary)", marginRight: 8, fontSize: 11 }}>{a.attr_type}</span>
                    <span>{a.value}</span>
                    {a.date_text && <span style={{ color: "var(--text-tertiary)", fontSize: 11, marginLeft: 8 }}>{a.date_text}</span>}
                  </div>
                  <DeleteBtn onClick={() => deleteAttr(a.id)} />
                </div>
              ))}
              {newAttr && (
                <AttrForm value={newAttr} onSave={addAttr} onCancel={() => setNewAttr(null)} />
              )}
            </>
          )}

          {/* ── Events ── */}
          {tab === "events" && (
            <>
              {addingEvent && (
                <EventEditor
                  event={{}}
                  personId={person.id}
                  onSave={e => { setEvents(prev => [...prev, e]); setAddingEvent(false); }}
                  onDelete={() => setAddingEvent(false)}
                />
              )}
              {events === null && <div style={{ color: "var(--text-tertiary)", fontSize: 12 }}>Loading…</div>}
              {events?.map(e => (
                <EventEditor
                  key={e.event_id}
                  event={e}
                  personId={person.id}
                  onSave={updated => setEvents(prev => prev.map(ev => ev.event_id === updated.event_id ? { ...ev, ...updated } : ev))}
                  onDelete={id => setEvents(prev => prev.filter(ev => ev.event_id !== id))}
                />
              ))}
              {!addingEvent && (
                <button onClick={() => setAddingEvent(true)} style={{
                  width: "100%", padding: "12px", marginTop: 8,
                  border: "1.5px dashed var(--border)", borderRadius: 8,
                  background: "none", color: "var(--text-secondary)",
                  cursor: "pointer", fontSize: 13,
                }}>
                  + Add life event
                </button>
              )}
            </>
          )}

          {/* ── Family ── */}
          {tab === "family" && (
            <FamilySection personId={person.id} personName={displayName} />
          )}

          {/* ── Notes ── */}
          {tab === "notes" && (
            <Field label="Notes">
              <Textarea value={form.notes} onChange={setF("notes")} rows={14} placeholder="Free-form notes about this person…" />
            </Field>
          )}
        </div>

        <SaveBar saving={saving} dirty={dirty || tab === "notes"} onSave={saveIdentity} onCancel={onClose} />
      </div>
    </>
  );
}

// ── sub-forms ─────────────────────────────────────────────────────────────────

const ALT_NAME_TYPES = ["Birth Name", "Married Name", "Also Known As", "Nickname", "Religious Name", "Immigrant Name", "Pseudonym"];

function AltNameForm({ value, onSave, onCancel }) {
  const [f, setF] = useState(value);
  const set = k => v => setF(p => ({ ...p, [k]: v }));
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-card)", borderRadius: 8, padding: 12, marginBottom: 8 }}>
      <Row>
        <Select value={f.name_type} onChange={set("name_type")} options={ALT_NAME_TYPES} style={{ flex: 1 }} />
        <TextInput value={f.given} onChange={set("given")} placeholder="Given" style={{ flex: 1 }} />
        <TextInput value={f.surname} onChange={set("surname")} placeholder="Surname" style={{ flex: 1 }} />
      </Row>
      <Row gap={8} style={{ marginTop: 8 }}>
        <TextInput value={f.date_text || ""} onChange={set("date_text")} placeholder="Date used (optional)" style={{ flex: 1 }} />
        <TextInput value={f.notes || ""} onChange={set("notes")} placeholder="Notes (optional)" style={{ flex: 2 }} />
      </Row>
      <Row gap={8} style={{ marginTop: 10 }}>
        <button className="primary" onClick={() => onSave(f)} style={{ fontSize: 12, padding: "5px 14px" }}>Save</button>
        <button onClick={onCancel} style={{ fontSize: 12, padding: "5px 10px" }}>Cancel</button>
      </Row>
    </div>
  );
}

const ATTR_TYPES = ["Occupation","Education","Religion","Nationality","Height","Weight","Hair Colour","Eye Colour","Medical","Military","Property","Other"];

function AttrForm({ value, onSave, onCancel }) {
  const [f, setF] = useState(value);
  const set = k => v => setF(p => ({ ...p, [k]: v }));
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-card)", borderRadius: 8, padding: 12, marginBottom: 8, marginTop: 8 }}>
      <Row>
        <Select value={f.attr_type} onChange={set("attr_type")} options={ATTR_TYPES} style={{ flex: 1 }} />
        <TextInput value={f.value || ""} onChange={set("value")} placeholder="Value" style={{ flex: 2 }} />
      </Row>
      <Row gap={8} style={{ marginTop: 8 }}>
        <TextInput value={f.date_text || ""} onChange={set("date_text")} placeholder="Date (optional)" style={{ flex: 1 }} />
        <TextInput value={f.notes || ""} onChange={set("notes")} placeholder="Notes" style={{ flex: 2 }} />
      </Row>
      <Row gap={8} style={{ marginTop: 10 }}>
        <button className="primary" onClick={() => onSave(f)} style={{ fontSize: 12, padding: "5px 14px" }}>Save</button>
        <button onClick={onCancel} style={{ fontSize: 12, padding: "5px 10px" }}>Cancel</button>
      </Row>
    </div>
  );
}
