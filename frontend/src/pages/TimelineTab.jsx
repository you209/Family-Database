/**
 * FamilyRoot — TimelineTab.jsx
 *
 * Vertical decade → year timeline.
 * Each year bucket shows: events from that year + photos from that year.
 * Events are fetched from /api/timeline/; photos from /api/photos/?year=N.
 */

import { useState, useEffect, useRef } from "react";

const API = "";

// ── helpers ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div style={{
      width: 20, height: 20, border: "2px solid var(--border)",
      borderTopColor: "var(--accent)", borderRadius: "50%",
      animation: "spin 0.7s linear infinite",
    }} />
  );
}

const EVENT_COLORS = {
  Birth:              ["rgba(59,130,246,0.18)",  "#60A5FA"],
  Death:              ["rgba(100,100,100,0.18)", "#999"],
  Marriage:           ["rgba(29,158,117,0.18)",  "#1D9E75"],
  Divorce:            ["rgba(220,80,50,0.18)",   "#F08060"],
  Burial:             ["rgba(100,100,100,0.18)", "#888"],
  Baptism:            ["rgba(139,92,246,0.18)",  "#A78BFA"],
  Christening:        ["rgba(139,92,246,0.18)",  "#A78BFA"],
  Residence:          ["rgba(245,166,35,0.18)",  "#F5A623"],
  Emigration:         ["rgba(245,166,35,0.18)",  "#F5A623"],
  Immigration:        ["rgba(245,166,35,0.18)",  "#F5A623"],
  Occupation:         ["rgba(59,130,246,0.18)",  "#60A5FA"],
  Education:          ["rgba(59,130,246,0.18)",  "#60A5FA"],
  "Military Service": ["rgba(220,80,50,0.18)",   "#F08060"],
};

function eventColor(type) {
  return EVENT_COLORS[type] || ["rgba(100,100,100,0.15)", "#888"];
}

// ── event pill ────────────────────────────────────────────────────────────────

function EventPill({ event }) {
  const [bg, fg] = eventColor(event.event_type);
  const name = [event.name_given, event.name_surname].filter(Boolean).join(" ");
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      background: bg, color: fg,
      fontSize: 11, fontWeight: 500,
      padding: "3px 8px", borderRadius: 6,
      maxWidth: "100%",
    }}>
      <span style={{ opacity: 0.75 }}>{event.event_type}</span>
      {name && <span>· {name}</span>}
      {event.place_name && (
        <span style={{ opacity: 0.6 }}>@ {event.place_name}</span>
      )}
    </div>
  );
}

// ── photo strip ───────────────────────────────────────────────────────────────

function PhotoStrip({ year }) {
  const [photos, setPhotos] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/photos/?year=${year}&per_page=12&sort=date_asc`)
      .then(r => r.json())
      .then(d => setPhotos(d.photos || []))
      .catch(() => setPhotos([]));
  }, [year]);

  if (!photos) return null;
  if (photos.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
      {photos.map(p => (
        <div
          key={p.id}
          title={p.filename}
          style={{
            width: 56, height: 56, borderRadius: 6,
            overflow: "hidden", flexShrink: 0,
            border: "0.5px solid var(--border)",
            background: "var(--bg-sel)",
          }}
        >
          {p.thumb_url ? (
            <img
              src={p.thumb_url}
              alt={p.filename}
              loading="lazy"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🖼</div>
          )}
        </div>
      ))}
      {photos.length === 12 && (
        <div style={{
          width: 56, height: 56, borderRadius: 6, border: "0.5px dashed var(--border)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, color: "var(--text-tertiary)",
        }}>more</div>
      )}
    </div>
  );
}

// ── year row ──────────────────────────────────────────────────────────────────

function YearRow({ year, events, photoCount }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ display: "flex", gap: 0 }}>
      {/* Timeline spine */}
      <div style={{ width: 60, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{
          width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
          background: events.length > 0 ? "var(--accent)" : "var(--border)",
          border: `2px solid ${events.length > 0 ? "rgba(29,158,117,0.18)" : "var(--bg-app)"}`,
          marginTop: 4,
        }} />
        <div style={{ flex: 1, width: 1.5, background: "var(--border)" }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, paddingBottom: 16, paddingLeft: 8 }}>
        <div
          style={{
            display: "flex", alignItems: "center", gap: 10,
            cursor: (events.length > 0 || photoCount > 0) ? "pointer" : "default",
            marginBottom: 6,
          }}
          onClick={() => (events.length > 0 || photoCount > 0) && setOpen(o => !o)}
        >
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", userSelect: "none" }}>
            {year}
          </span>
          {events.length > 0 && (
            <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
              {events.length} event{events.length !== 1 ? "s" : ""}
            </span>
          )}
          {photoCount > 0 && (
            <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
              {photoCount} photo{photoCount !== 1 ? "s" : ""}
            </span>
          )}
          {(events.length > 0 || photoCount > 0) && (
            <span style={{ fontSize: 11, color: "var(--text-tertiary)", userSelect: "none" }}>
              {open ? "▲" : "▼"}
            </span>
          )}
        </div>

        {open && (
          <div>
            {events.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {events.map(e => <EventPill key={e.event_id} event={e} />)}
              </div>
            )}
            {photoCount > 0 && <PhotoStrip year={year} />}
          </div>
        )}
      </div>
    </div>
  );
}

// ── decade section ────────────────────────────────────────────────────────────

function DecadeSection({ decade, yearsData, photosByYear }) {
  const [open, setOpen] = useState(true);
  const totalEvents = yearsData.reduce((s, y) => s + (y.events?.length || 0), 0);
  const totalPhotos = yearsData.reduce((s, y) => s + (photosByYear[y.year] || 0), 0);

  return (
    <div style={{ marginBottom: 8 }}>
      {/* Decade header */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "8px 0", cursor: "pointer", userSelect: "none",
          borderBottom: "0.5px solid var(--border)",
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>
          {decade}s
        </span>
        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
          {totalEvents > 0 && `${totalEvents} events`}
          {totalEvents > 0 && totalPhotos > 0 && " · "}
          {totalPhotos > 0 && `${totalPhotos} photos`}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-tertiary)" }}>
          {open ? "▲" : "▼"}
        </span>
      </div>

      {open && yearsData.map(({ year, events }) => (
        <YearRow
          key={year}
          year={year}
          events={events}
          photoCount={photosByYear[year] || 0}
        />
      ))}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function TimelineTab() {
  const [data, setData]             = useState(null);  // { decades: [...], photo_years: {...} }
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/timeline/`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/api/photos/stats`).then(r => r.ok ? r.json() : null),
    ])
      .then(([timeline, stats]) => {
        setData({ timeline, stats });
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  // Build decade structure from timeline data
  const decades = (() => {
    if (!data?.timeline?.years) return [];
    const byDecade = {};
    for (const yd of data.timeline.years) {
      const d = Math.floor(yd.year / 10) * 10;
      if (!byDecade[d]) byDecade[d] = [];
      byDecade[d].push(yd);
    }
    return Object.entries(byDecade)
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([decade, years]) => ({
        decade: Number(decade),
        years: years.sort((a, b) => b.year - a.year),
      }));
  })();

  const photosByYear = data?.timeline?.photo_counts || {};

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        padding: "12px 20px", borderBottom: "0.5px solid var(--border)",
        background: "var(--bg-card)",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 14, fontWeight: 500 }}>Family timeline</span>
        {data?.stats && (
          <span style={{ fontSize: 12, color: "var(--text-tertiary)", marginLeft: 10 }}>
            {data.stats.earliest_year && data.stats.latest_year
              ? `${data.stats.earliest_year} – ${data.stats.latest_year}`
              : ""}
          </span>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 32px", maxWidth: 760 }}>
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 60 }}>
            <Spinner />
          </div>
        )}

        {error && (
          <div style={{ marginTop: 40, padding: 16, background: "rgba(220,80,50,0.15)", borderRadius: 8, fontSize: 13, color: "#F08060" }}>
            Could not load timeline: {error}.
            <br /><br />
            Make sure the backend is running and the <code>/api/timeline/</code> endpoint exists.
          </div>
        )}

        {!loading && !error && decades.length === 0 && (
          <div style={{ textAlign: "center", marginTop: 80, color: "var(--text-tertiary)" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📅</div>
            <div style={{ fontSize: 14, marginBottom: 6 }}>No timeline data yet</div>
            <div style={{ fontSize: 12 }}>
              Import a Gramps or GEDCOM file to populate events, or ingest photos to see years.
            </div>
          </div>
        )}

        {!loading && !error && decades.map(({ decade, years }) => (
          <DecadeSection
            key={decade}
            decade={decade}
            yearsData={years}
            photosByYear={photosByYear}
          />
        ))}
      </div>
    </div>
  );
}
