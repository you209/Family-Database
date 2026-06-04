/**
 * FamilyRoot — PeopleTab.jsx
 *
 * "All people" grid view matching the mockup:
 * - Header with page title, global search, "Add person" button
 * - 2-column card grid: coloured initial avatar, name, years, tag pills
 * - Click a card → person detail drawer (events, photos, attributes)
 * - Inline "Add person" form in a dashed placeholder card
 */

import { useState, useEffect, useCallback } from "react";
import EditPersonDrawer from "../components/EditPersonDrawer.jsx";

const API = "";

// ── avatar colour by name hash ────────────────────────────────────────────────

const AV_COLORS = [
  { bg: "#B8D4F0", fg: "#1A3A5C" },   // blue
  { bg: "#F0C4B8", fg: "#5C2A1A" },   // salmon
  { bg: "#B8EAD8", fg: "#0F4A30" },   // teal
  { bg: "#D4C8F0", fg: "#2E1A5C" },   // lavender
  { bg: "#F0DCC8", fg: "#5C3A0A" },   // peach
  { bg: "#F0C8D8", fg: "#5C1A30" },   // rose
];

function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AV_COLORS[Math.abs(h) % AV_COLORS.length];
}

function initials(given, surname) {
  const g = (given   || "").trim()[0] || "";
  const s = (surname || "").trim()[0] || "";
  return (g + s).toUpperCase() || "?";
}

// ── tiny helpers ──────────────────────────────────────────────────────────────

function TagPill({ label }) {
  return (
    <span style={{
      display: "inline-block",
      background: "var(--bg-tag)",
      color: "var(--text-secondary)",
      fontSize: 11, fontWeight: 500,
      padding: "3px 9px", borderRadius: 20,
    }}>
      {label}
    </span>
  );
}

function Spinner() {
  return (
    <div style={{
      width: 20, height: 20,
      border: "2px solid var(--border)",
      borderTopColor: "var(--accent)",
      borderRadius: "50%",
      animation: "spin 0.7s linear infinite",
    }} />
  );
}

// ── person card ───────────────────────────────────────────────────────────────

function PersonCard({ person, onClick }) {
  const name  = [person.name_given, person.name_surname].filter(Boolean).join(" ") || "Unknown";
  const inits = initials(person.name_given, person.name_surname);
  const color = avatarColor(name);

  const yearStart = person.birth_year || "?";
  const yearEnd   = person.is_living  ? "present"
                  : person.death_year ? String(person.death_year)
                  : null;
  const years = yearEnd ? `${yearStart} – ${yearEnd}` : yearStart !== "?" ? String(yearStart) : null;

  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-card)",
        borderRadius: 12,
        padding: "22px 20px 18px",
        cursor: "pointer",
        transition: "background 0.12s, border-color 0.12s",
        display: "flex", flexDirection: "column", gap: 10,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = "var(--bg-card-hov)";
        e.currentTarget.style.borderColor = "#444";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = "var(--bg-card)";
        e.currentTarget.style.borderColor = "var(--border-card)";
      }}
    >
      {/* Avatar */}
      <div style={{
        width: 52, height: 52, borderRadius: "50%",
        background: color.bg, color: color.fg,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 16, fontWeight: 600, letterSpacing: "0.02em",
        flexShrink: 0,
      }}>
        {person.thumb_url ? (
          <img
            src={person.thumb_url}
            alt={name}
            style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
          />
        ) : inits}
      </div>

      {/* Name + years */}
      <div>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 3 }}>{name}</div>
        {years && (
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{years}</div>
        )}
      </div>

      {/* Tags */}
      {person.tags?.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {person.tags.slice(0, 3).map(t => <TagPill key={t} label={t} />)}
        </div>
      )}
    </div>
  );
}

// ── add-person card ───────────────────────────────────────────────────────────

function AddPersonCard({ onAdded }) {
  const [open,    setOpen]    = useState(false);
  const [given,   setGiven]   = useState("");
  const [surname, setSurname] = useState("");
  const [birth,   setBirth]   = useState("");
  const [saving,  setSaving]  = useState(false);

  const save = async () => {
    if (!given.trim() && !surname.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/persons/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name_given:   given.trim(),
          name_surname: surname.trim(),
          birth_year:   birth ? parseInt(birth) : null,
        }),
      });
      if (res.ok) {
        setGiven(""); setSurname(""); setBirth(""); setOpen(false);
        onAdded?.();
      }
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <div
        onClick={() => setOpen(true)}
        style={{
          background: "none",
          border: "1.5px dashed var(--border-card)",
          borderRadius: 12,
          padding: "22px 20px",
          cursor: "pointer",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          gap: 10, minHeight: 160,
          transition: "border-color 0.12s",
          color: "var(--text-tertiary)",
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = "#555"}
        onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border-card)"}
      >
        <span style={{ fontSize: 28 }}>⊞</span>
        <span style={{ fontSize: 13 }}>Add person</span>
      </div>
    );
  }

  return (
    <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--accent)",
      borderRadius: 12, padding: "18px 16px",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 2 }}>New person</div>
      <input
        type="text" placeholder="First name"
        value={given} onChange={e => setGiven(e.target.value)}
        style={{ width: "100%" }}
        autoFocus
      />
      <input
        type="text" placeholder="Surname"
        value={surname} onChange={e => setSurname(e.target.value)}
        style={{ width: "100%" }}
      />
      <input
        type="number" placeholder="Birth year"
        value={birth} onChange={e => setBirth(e.target.value)}
        style={{ width: "100%" }} min={1800} max={2100}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button className="primary" onClick={save} disabled={saving || (!given.trim() && !surname.trim())} style={{ flex: 1 }}>
          {saving ? "Saving…" : "Add"}
        </button>
        <button onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

// ── person detail drawer ──────────────────────────────────────────────────────

// ── life story renderer ───────────────────────────────────────────────────────

function LifeStory({ personId }) {
  const [story, setStory] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/persons/${personId}/story`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setStory(d))
      .catch(() => {});
  }, [personId]);

  if (!story) return <div style={{ display: "flex", justifyContent: "center", marginTop: 40 }}><Spinner /></div>;

  const p = story.person;
  const name = [p.name_given, p.name_surname].filter(Boolean).join(" ") || "This person";
  const born  = story.events.find(e => e.event_type === "Birth");
  const died  = story.events.find(e => e.event_type === "Death");
  const buried = story.events.find(e => e.event_type === "Burial");
  const marriages = story.events.filter(e => e.event_type === "Marriage");
  const occupations = story.attributes.filter(a => a.attr_type === "Occupation");
  const otherEvents = story.events.filter(e =>
    !["Birth","Death","Burial","Marriage"].includes(e.event_type)
  );

  function Para({ children, style }) {
    return <p style={{ fontSize: 13, lineHeight: 1.75, color: "var(--text-secondary)", marginBottom: 14, ...style }}>{children}</p>;
  }

  function Hl({ children }) {
    return <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{children}</span>;
  }

  function ordinal(n) {
    if (!n) return "";
    const s = ["th","st","nd","rd"];
    const v = n % 100;
    return n + (s[(v-20)%10] || s[v] || s[0]);
  }

  return (
    <div>
      {/* Birth paragraph */}
      <Para>
        <Hl>{name}</Hl>
        {p.gender === "M" ? " was born" : p.gender === "F" ? " was born" : " was born"}
        {born?.date_text ? <> on <Hl>{born.date_text}</Hl></> : born?.date_year ? <> in <Hl>{born.date_year}</Hl></> : ""}
        {born?.place_name ? <> in <Hl>{born.place_name}</Hl></> : ""}.
        {story.father || story.mother ? (
          <>
            {" "}{p.gender === "F" ? "She" : p.gender === "M" ? "He" : "They"} was the
            {story.birth_order ? <> {ordinal(story.birth_order)} child</> : " child"} of
            {story.father ? <> <Hl>{story.father.name}</Hl></> : ""}
            {story.father && story.mother ? " and" : ""}
            {story.mother ? <> <Hl>{story.mother.name}</Hl></> : ""}.
          </>
        ) : ""}
        {story.siblings.length > 0 && (
          <> {p.gender === "F" ? "She" : p.gender === "M" ? "He" : "They"} had {story.siblings.length} sibling{story.siblings.length > 1 ? "s" : ""}
          {story.siblings.length <= 3
            ? <>: {story.siblings.map((s, i) => <span key={s.id}>{i > 0 ? ", " : ""}<Hl>{s.name}</Hl></span>)}</>
            : <>: <Hl>{story.siblings[0].name}</Hl>, <Hl>{story.siblings[1].name}</Hl> and {story.siblings.length - 2} others</>
          }.</>
        )}
      </Para>

      {/* Occupation */}
      {occupations.length > 0 && (
        <Para>
          {p.gender === "F" ? "She" : p.gender === "M" ? "He" : "They"} worked as
          {occupations.map((o, i) => (
            <span key={i}>{i === 0 ? " " : i === occupations.length - 1 ? " and " : ", "}<Hl>{o.value}</Hl></span>
          ))}{occupations[0].date_text ? <> from <Hl>{occupations[0].date_text}</Hl></> : ""}.
        </Para>
      )}

      {/* Marriages */}
      {marriages.length > 0 && (
        <Para>
          {p.gender === "F" ? "She" : p.gender === "M" ? "He" : "They"} married
          {story.own_families.map((f, i) => (
            f.spouse ? (
              <span key={i}>
                {i > 0 ? " and later " : " "}
                <Hl>{f.spouse.name}</Hl>
              </span>
            ) : null
          ))}
          {marriages[0].date_text ? <> on <Hl>{marriages[0].date_text}</Hl></> : marriages[0].date_year ? <> in <Hl>{marriages[0].date_year}</Hl></> : ""}
          {marriages[0].place_name ? <> in <Hl>{marriages[0].place_name}</Hl></> : ""}.
        </Para>
      )}

      {/* Children */}
      {story.own_families.some(f => f.children.length > 0) && (
        <Para>
          {(() => {
            const allKids = story.own_families.flatMap(f => f.children);
            return <>
              {p.gender === "F" ? "She" : p.gender === "M" ? "He" : "They"} had <Hl>{allKids.length}</Hl> child{allKids.length !== 1 ? "ren" : ""}
              {allKids.length <= 4
                ? <>: {allKids.map((k, i) => <span key={k.id}>{i > 0 ? ", " : ""}<Hl>{k.name}</Hl>{k.birth_year ? ` (b. ${k.birth_year})` : ""}</span>)}</>
                : <>, including <Hl>{allKids[0].name}</Hl> and <Hl>{allKids[1].name}</Hl></>
              }.
            </>;
          })()}
        </Para>
      )}

      {/* Other key events */}
      {otherEvents.length > 0 && (
        <Para>
          Other notable events in {p.gender === "F" ? "her" : p.gender === "M" ? "his" : "their"} life included
          {otherEvents.slice(0, 5).map((e, i) => (
            <span key={i}>
              {i === 0 ? " " : i === Math.min(otherEvents.length, 5) - 1 ? " and " : ", "}
              <Hl>{e.event_type.toLowerCase()}</Hl>
              {e.date_text ? <> ({e.date_text})</> : e.date_year ? <> ({e.date_year})</> : ""}
              {e.place_name ? <> in {e.place_name}</> : ""}
            </span>
          ))}.
        </Para>
      )}

      {/* Death */}
      {died && (
        <Para>
          {p.gender === "F" ? "She" : p.gender === "M" ? "He" : "They"} died
          {died.date_text ? <> on <Hl>{died.date_text}</Hl></> : died.date_year ? <> in <Hl>{died.date_year}</Hl></> : ""}
          {died.place_name ? <> in <Hl>{died.place_name}</Hl></> : ""}
          {died.description ? <>, {died.description}</> : ""}.
          {buried ? <> {p.gender === "F" ? "She" : p.gender === "M" ? "He" : "They"} was buried{buried.place_name ? <> at <Hl>{buried.place_name}</Hl></> : ""}.</> : ""}
        </Para>
      )}

      {!born && !died && story.events.length === 0 && (
        <Para style={{ color: "var(--text-tertiary)", fontStyle: "italic" }}>
          No life events recorded yet for this person.
        </Para>
      )}

      {/* Event timeline at the bottom */}
      {story.events.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: 12 }}>
            Timeline
          </div>
          <div style={{ position: "relative", paddingLeft: 20 }}>
            <div style={{ position: "absolute", left: 6, top: 6, bottom: 6, width: 1, background: "var(--border)" }} />
            {story.events.map((e, i) => (
              <div key={i} style={{ display: "flex", gap: 10, marginBottom: 12, position: "relative" }}>
                <div style={{
                  position: "absolute", left: -20, top: 4,
                  width: 7, height: 7, borderRadius: "50%",
                  background: "var(--accent)", border: "2px solid var(--bg-sidebar)",
                }} />
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--accent)", minWidth: 36 }}>
                  {e.date_year || "—"}
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{e.event_type}</div>
                  {e.place_name && <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{e.place_name}</div>}
                  {e.description && <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{e.description}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── person drawer ─────────────────────────────────────────────────────────────

function PersonDrawer({ person, onClose, onPersonUpdated }) {
  const [detail, setDetail]       = useState(null);
  const [drawerTab, setDrawerTab] = useState("story");
  const [editing, setEditing]     = useState(false);

  useEffect(() => {
    if (!person) return;
    setDrawerTab("story");
    fetch(`${API}/api/persons/${person.id}`)
      .then(r => r.json())
      .then(setDetail)
      .catch(() => {});
  }, [person?.id]);

  if (!person) return null;

  const name  = [person.name_given, person.name_surname].filter(Boolean).join(" ") || "Unknown";
  const inits = initials(person.name_given, person.name_surname);
  const color = avatarColor(name);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          zIndex: 100,
        }}
      />
      {/* Drawer */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: 380,
        background: "var(--bg-sidebar)",
        borderLeft: "1px solid var(--border)",
        zIndex: 101,
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "24px 24px 20px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%",
                background: color.bg, color: color.fg,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, fontWeight: 700, flexShrink: 0,
              }}>
                {person.thumb_url
                  ? <img src={person.thumb_url} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                  : inits}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 17 }}>{name}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                  {[person.birth_year, person.is_living ? "present" : person.death_year].filter(Boolean).join(" – ")}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setEditing(true)} style={{ fontSize: 12, padding: "5px 14px", borderRadius: 7, border: "1px solid var(--border)", background: "none", color: "var(--text-secondary)", cursor: "pointer" }}>
                Edit
              </button>
              <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, color: "var(--text-secondary)", cursor: "pointer", padding: 4 }}>✕</button>
            </div>
          </div>
        </div>

        {/* Drawer tabs */}
        <div style={{ display: "flex", gap: 2, padding: "0 24px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          {["story", "events", "photos"].map(t => (
            <button
              key={t}
              onClick={() => setDrawerTab(t)}
              style={{
                background: "none", border: "none",
                borderBottom: `2px solid ${drawerTab === t ? "var(--accent)" : "transparent"}`,
                padding: "10px 12px",
                fontSize: 12, fontWeight: drawerTab === t ? 500 : 400,
                color: drawerTab === t ? "var(--text-primary)" : "var(--text-secondary)",
                cursor: "pointer",
                marginBottom: -1,
                textTransform: "capitalize",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>

          {drawerTab === "story" && (
            <LifeStory personId={person.id} />
          )}

          {drawerTab === "events" && (
            !detail ? (
              <div style={{ display: "flex", justifyContent: "center", marginTop: 40 }}><Spinner /></div>
            ) : detail.events?.length > 0 ? (
              <Section title="Life events">
                {detail.events.map(e => (
                  <div key={e.event_id} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
                    <div style={{
                      fontSize: 10, fontWeight: 600, padding: "2px 7px",
                      borderRadius: 5, background: "var(--bg-tag)",
                      color: "var(--text-secondary)", flexShrink: 0, marginTop: 1,
                    }}>
                      {e.event_type}
                    </div>
                    <div>
                      <div style={{ fontSize: 13 }}>{e.date_text || e.date_year || "—"}</div>
                      {e.place_name && <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{e.place_name}</div>}
                    </div>
                  </div>
                ))}
              </Section>
            ) : (
              <div style={{ textAlign: "center", color: "var(--text-tertiary)", marginTop: 40, fontSize: 13 }}>No events recorded.</div>
            )
          )}

          {drawerTab === "photos" && (
            !detail ? (
              <div style={{ display: "flex", justifyContent: "center", marginTop: 40 }}><Spinner /></div>
            ) : detail.photos?.length > 0 ? (
              <Section title={`Photos (${detail.photos.length})`}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                  {detail.photos.map(p => (
                    <div key={p.id} style={{ aspectRatio: "1", borderRadius: 6, overflow: "hidden", background: "var(--bg-card)" }}>
                      {p.thumb_url
                        ? <img src={p.thumb_url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🖼</div>
                      }
                    </div>
                  ))}
                </div>
              </Section>
            ) : (
              <div style={{ textAlign: "center", color: "var(--text-tertiary)", marginTop: 40, fontSize: 13 }}>No photos linked.</div>
            )
          )}

        </div>
      </div>

      {editing && (
        <EditPersonDrawer
          person={{ ...person, ...detail }}
          onClose={() => setEditing(false)}
          onSaved={updated => {
            onPersonUpdated?.(updated);
            setEditing(false);
          }}
        />
      )}
    </>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
        color: "var(--text-tertiary)", textTransform: "uppercase",
        marginBottom: 12,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function PeopleTab() {
  const [people,   setPeople]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");
  const [selected, setSelected] = useState(null);
  const [version,  setVersion]  = useState(0);  // bump to reload

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API}/api/persons/?per_page=200`)
      .then(r => r.json())
      .then(async d => {
        const persons = d.persons || [];

        // Fetch tags for each person (from object_tags)
        const tagged = await Promise.all(persons.map(async p => {
          try {
            const tr = await fetch(`${API}/api/persons/${p.id}/tags`);
            if (tr.ok) { const tj = await tr.json(); p.tags = tj.tags || []; }
          } catch (_) {}
          return p;
        }));

        // Fetch thumb_url for each person (first photo)
        const withThumbs = await Promise.all(tagged.map(async p => {
          try {
            const pr = await fetch(`${API}/api/photos/by-person/${p.id}?limit=1`);
            if (pr.ok) {
              const pj = await pr.json();
              p.thumb_url = Array.isArray(pj) && pj[0]?.thumb_url ? pj[0].thumb_url : null;
            }
          } catch (_) {}
          return p;
        }));

        setPeople(withThumbs);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [version]);

  useEffect(() => { load(); }, [load]);

  const filtered = people.filter(p => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (p.name_given   || "").toLowerCase().includes(q) ||
      (p.name_surname || "").toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "20px 28px",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, flexShrink: 0 }}>All people</div>

        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search people, events, places…"
          style={{ flex: 1, maxWidth: 480, fontSize: 13 }}
        />

        <button
          className="primary"
          style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}
          onClick={() => {
            // Scroll to + open the add-person card (handled by the card itself)
            document.getElementById("add-person-card")?.click();
          }}
        >
          ＋ Add person
        </button>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 60 }}>
            <Spinner />
          </div>
        )}

        {!loading && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 14,
          }}>
            {filtered.map(p => (
              <PersonCard
                key={p.id}
                person={p}
                onClick={() => setSelected(p)}
              />
            ))}

            {/* Add person placeholder */}
            <div id="add-person-card">
              <AddPersonCard onAdded={() => setVersion(v => v + 1)} />
            </div>
          </div>
        )}

        {!loading && people.length === 0 && (
          <div style={{ textAlign: "center", marginTop: 80, color: "var(--text-tertiary)" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
            <div style={{ fontSize: 15, marginBottom: 6 }}>No people yet</div>
            <div style={{ fontSize: 13 }}>
              Import a Gramps / GEDCOM file, or add someone manually above.
            </div>
          </div>
        )}
      </div>

      {/* Detail drawer */}
      <PersonDrawer
        person={selected}
        onClose={() => setSelected(null)}
        onPersonUpdated={updated => {
          setPeople(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
          setSelected(prev => prev ? { ...prev, ...updated } : null);
        }}
      />
    </div>
  );
}
