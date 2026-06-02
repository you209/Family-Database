/**
 * FamilyRoot — MapTab.jsx
 *
 * Family world map with a year timeline scrubber.
 *
 * - OpenStreetMap tiles via Leaflet (free, no API key, works on LAN)
 * - Each event with a geocoded place shows as a circle marker
 *   coloured by event type, sized by number of people present
 * - Movement trails connect Birth → Residence → Death per person
 *   (polylines on the map, filtered to visible year range)
 * - Year slider at the bottom — drag or use ◀ ▶ arrows
 * - Play button animates through the years automatically
 * - Click a marker → popup with event details, people, and a sample photo
 * - Person filter: pick a person from the sidebar to highlight only them
 */

import { useState, useEffect, useRef, useCallback } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

const API = "";

// ── event type colours (matches TimelineTab palette) ──────────────────────────

const EVENT_COLOR = {
  Birth:              "#2980B9",
  Death:              "#5A5A52",
  Marriage:           "#1D9E75",
  Divorce:            "#C0392B",
  Burial:             "#7F8C8D",
  Baptism:            "#8E44AD",
  Christening:        "#8E44AD",
  Residence:          "#E67E22",
  Emigration:         "#D35400",
  Immigration:        "#E67E22",
  Occupation:         "#2C3E50",
  Education:          "#1A5276",
  "Military Service": "#922B21",
};
const DEFAULT_EVENT_COLOR = "#888";

function eventColor(type) {
  return EVENT_COLOR[type] || DEFAULT_EVENT_COLOR;
}

// ── trail colours for individuals (cycle) ─────────────────────────────────────

const TRAIL_PALETTE = [
  "#E74C3C","#3498DB","#2ECC71","#F39C12","#9B59B6",
  "#1ABC9C","#E67E22","#2980B9","#27AE60","#8E44AD",
];

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtName(p) {
  return [p.name_given, p.name_surname].filter(Boolean).join(" ") || "Unknown";
}

// ── year slider component ─────────────────────────────────────────────────────

function YearSlider({ year, minYear, maxYear, onChange, playing, onTogglePlay }) {
  return (
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 1000,
      background: "rgba(17,24,20,0.88)", backdropFilter: "blur(6px)",
      borderTop: "0.5px solid rgba(255,255,255,0.1)",
      padding: "10px 20px 14px",
      display: "flex", alignItems: "center", gap: 14,
    }}>
      {/* Play/pause */}
      <button
        onClick={onTogglePlay}
        style={{
          background: playing ? "#C0392B" : "#1D9E75",
          border: "none", borderRadius: "50%",
          width: 36, height: 36, fontSize: 16, cursor: "pointer",
          color: "#fff", flexShrink: 0, lineHeight: 1,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
        title={playing ? "Pause" : "Play through years"}
      >
        {playing ? "⏸" : "▶"}
      </button>

      {/* Prev year */}
      <button
        onClick={() => onChange(Math.max(minYear, year - 1))}
        style={{ background: "none", border: "none", color: "#aaa", fontSize: 18, cursor: "pointer", padding: "0 2px" }}
      >◀</button>

      {/* Year label */}
      <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", minWidth: 56, textAlign: "center", flexShrink: 0 }}>
        {year}
      </div>

      {/* Next year */}
      <button
        onClick={() => onChange(Math.min(maxYear, year + 1))}
        style={{ background: "none", border: "none", color: "#aaa", fontSize: 18, cursor: "pointer", padding: "0 2px" }}
      >▶</button>

      {/* Range slider */}
      <div style={{ flex: 1, position: "relative" }}>
        <input
          type="range"
          min={minYear}
          max={maxYear}
          value={year}
          onChange={e => onChange(Number(e.target.value))}
          style={{ width: "100%", accentColor: "#1D9E75", cursor: "pointer" }}
        />
        {/* Min/max labels */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
          <span style={{ fontSize: 10, color: "#666" }}>{minYear}</span>
          <span style={{ fontSize: 10, color: "#666" }}>{maxYear}</span>
        </div>
      </div>

      {/* Window label */}
      <div style={{ fontSize: 11, color: "#666", flexShrink: 0, textAlign: "right", minWidth: 80 }}>
        ±5 year window
      </div>
    </div>
  );
}

// ── person sidebar ────────────────────────────────────────────────────────────

function PersonSidebar({ people, selectedId, onSelect }) {
  const [search, setSearch] = useState("");
  const filtered = people.filter(p =>
    !search || fmtName(p).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{
      width: 220, flexShrink: 0,
      background: "rgba(17,24,20,0.92)", backdropFilter: "blur(6px)",
      borderRight: "0.5px solid rgba(255,255,255,0.1)",
      display: "flex", flexDirection: "column", overflow: "hidden",
      zIndex: 999,
    }}>
      <div style={{ padding: "10px 10px 6px", borderBottom: "0.5px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontSize: 11, color: "#aaa", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Filter by person
        </div>
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Name…"
          style={{ width: "100%", fontSize: 12, background: "rgba(255,255,255,0.08)", border: "0.5px solid rgba(255,255,255,0.15)", borderRadius: 6, padding: "5px 8px", color: "#fff" }}
        />
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* Show all */}
        <div
          onClick={() => onSelect(null)}
          style={{
            padding: "7px 12px", fontSize: 12, cursor: "pointer",
            color: selectedId === null ? "#1D9E75" : "#ccc",
            fontWeight: selectedId === null ? 600 : 400,
            borderBottom: "0.5px solid rgba(255,255,255,0.05)",
          }}
        >
          Show everyone
        </div>
        {filtered.map((p, i) => (
          <div
            key={p.person_id}
            onClick={() => onSelect(p.person_id === selectedId ? null : p.person_id)}
            style={{
              padding: "6px 12px", fontSize: 12, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 8,
              color: p.person_id === selectedId ? "#fff" : "#bbb",
              background: p.person_id === selectedId ? "rgba(29,158,117,0.25)" : "transparent",
              borderBottom: "0.5px solid rgba(255,255,255,0.04)",
            }}
          >
            <span style={{
              width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
              background: TRAIL_PALETTE[i % TRAIL_PALETTE.length],
            }} />
            {fmtName(p)}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────────

const WINDOW = 5;   // show events within ±WINDOW years of selected year
const PLAY_INTERVAL = 800;  // ms per year when playing

export default function MapTab() {
  const mapRef      = useRef(null);   // Leaflet map instance
  const mapDivRef   = useRef(null);   // DOM node
  const layersRef   = useRef({ markers: [], trails: [] });
  const playRef     = useRef(null);

  const [allData,   setAllData]   = useState(null);   // { events, trails, year_range }
  const [year,      setYear]      = useState(1900);
  const [minYear,   setMinYear]   = useState(1800);
  const [maxYear,   setMaxYear]   = useState(2024);
  const [playing,   setPlaying]   = useState(false);
  const [personId,  setPersonId]  = useState(null);
  const [loading,   setLoading]   = useState(true);

  // ── derive unique people from trails for the sidebar ─────────────────────

  const people = allData
    ? allData.trails.map((t, i) => ({ person_id: t.person_id, name_given: t.name_given, name_surname: t.name_surname }))
    : [];

  // ── load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch(`${API}/api/map/events`)
      .then(r => r.json())
      .then(data => {
        setAllData(data);
        const [mn, mx] = data.year_range;
        setMinYear(mn);
        setMaxYear(mx);
        setYear(mn);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // ── init Leaflet map ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    const map = L.map(mapDivRef.current, {
      center: [30, 10],
      zoom: 3,
      zoomControl: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 18,
    }).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // ── update markers + trails when year or data changes ─────────────────────

  const updateMap = useCallback(() => {
    const map = mapRef.current;
    if (!map || !allData) return;

    // Clear old layers
    layersRef.current.markers.forEach(l => map.removeLayer(l));
    layersRef.current.trails.forEach(l => map.removeLayer(l));
    layersRef.current = { markers: [], trails: [] };

    const { events, trails } = allData;
    const yMin = year - WINDOW;
    const yMax = year + WINDOW;

    // ── trails ────────────────────────────────────────────────────────────
    trails.forEach((trail, ti) => {
      if (personId && trail.person_id !== personId) return;
      const color = TRAIL_PALETTE[ti % TRAIL_PALETTE.length];
      // Collect points up to current year
      const pts = trail.points
        .filter(p => p.year <= year + WINDOW)
        .map(p => [p.lat, p.lon]);
      if (pts.length < 2) return;
      const line = L.polyline(pts, {
        color, weight: personId ? 3 : 1.5,
        opacity: personId ? 0.85 : 0.4,
        dashArray: "6 4",
      }).addTo(map);
      // Arrow at the last point (movement direction)
      const len = pts.length;
      const decorator = L.circleMarker(pts[len - 1], {
        radius: 4, color, fillColor: color, fillOpacity: 1, weight: 0,
      }).addTo(map);
      layersRef.current.trails.push(line, decorator);
    });

    // ── event markers ─────────────────────────────────────────────────────
    // Group events by place for this time window
    const byPlace = {};
    events.forEach(ev => {
      if (ev.date_year < yMin || ev.date_year > yMax) return;
      if (personId && !ev.people.some(p => p.id === personId)) return;
      const key = `${ev.lat},${ev.lon}`;
      if (!byPlace[key]) byPlace[key] = { lat: ev.lat, lon: ev.lon, place: ev.place_name, evts: [] };
      byPlace[key].evts.push(ev);
    });

    Object.values(byPlace).forEach(cluster => {
      const count   = cluster.evts.length;
      const radius  = Math.max(8, Math.min(28, 8 + Math.sqrt(count) * 5));
      // Dominant event type colour
      const topType = cluster.evts[0].event_type;
      const color   = eventColor(topType);

      // Pulse ring for the current year's events
      const hasThisYear = cluster.evts.some(e => e.date_year === year);

      const marker = L.circleMarker([cluster.lat, cluster.lon], {
        radius,
        color:       hasThisYear ? "#FFDD44" : color,
        weight:      hasThisYear ? 3 : 1.5,
        fillColor:   color,
        fillOpacity: hasThisYear ? 0.9 : 0.65,
      }).addTo(map);

      // Popup content
      const popupHtml = `
        <div style="font-family:-apple-system,sans-serif;min-width:200px;max-width:260px">
          <div style="font-weight:600;font-size:13px;margin-bottom:6px">${cluster.place}</div>
          ${cluster.evts.slice(0, 8).map(ev => `
            <div style="margin-bottom:5px;padding:4px 0;border-bottom:1px solid #eee">
              <span style="
                display:inline-block;background:${eventColor(ev.event_type)};
                color:#fff;font-size:10px;padding:1px 5px;border-radius:3px;
                margin-bottom:2px
              ">${ev.event_type}</span>
              <span style="font-size:11px;color:#666;margin-left:4px">${ev.date_text || ev.date_year}</span>
              ${ev.people.length ? `<div style="font-size:12px;margin-top:2px">${ev.people.map(p => fmtName(p)).join(", ")}</div>` : ""}
              ${ev.description ? `<div style="font-size:11px;color:#888">${ev.description}</div>` : ""}
              ${ev.thumb_url ? `<img src="${ev.thumb_url}" style="width:100%;border-radius:4px;margin-top:4px;object-fit:cover;height:60px">` : ""}
            </div>
          `).join("")}
          ${cluster.evts.length > 8 ? `<div style="font-size:11px;color:#999">+${cluster.evts.length - 8} more</div>` : ""}
        </div>
      `;
      marker.bindPopup(popupHtml, { maxWidth: 280 });
      layersRef.current.markers.push(marker);
    });
  }, [allData, year, personId]);

  useEffect(() => { updateMap(); }, [updateMap]);

  // ── play animation ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (playing) {
      playRef.current = setInterval(() => {
        setYear(y => {
          if (y >= maxYear) { setPlaying(false); return y; }
          return y + 1;
        });
      }, PLAY_INTERVAL);
    } else {
      clearInterval(playRef.current);
    }
    return () => clearInterval(playRef.current);
  }, [playing, maxYear]);

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden", position: "relative" }}>
      {/* Person sidebar */}
      {allData && people.length > 0 && (
        <PersonSidebar
          people={people}
          selectedId={personId}
          onSelect={setPersonId}
        />
      )}

      {/* Map container */}
      <div style={{ flex: 1, position: "relative" }}>
        {loading && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 2000,
            background: "#111814",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: 14, color: "#aaa", fontSize: 13,
          }}>
            <div style={{
              width: 30, height: 30,
              border: "2.5px solid #333",
              borderTopColor: "#1D9E75",
              borderRadius: "50%",
              animation: "spin 0.7s linear infinite",
            }} />
            Loading map data…
          </div>
        )}

        {/* Leaflet mount point — padding-bottom leaves room for the slider */}
        <div ref={mapDivRef} style={{ position: "absolute", inset: "0 0 76px 0" }} />

        {/* Empty state overlay */}
        {!loading && allData && allData.events.length === 0 && (
          <div style={{
            position: "absolute", top: "30%", left: "50%", transform: "translate(-50%,-50%)",
            zIndex: 1000, textAlign: "center", color: "#999",
            background: "rgba(17,24,20,0.85)", borderRadius: 10, padding: "24px 32px",
          }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🗺</div>
            <div style={{ fontSize: 14, marginBottom: 6 }}>No geocoded places yet</div>
            <div style={{ fontSize: 12 }}>
              Import a Gramps or GEDCOM file — places with latitude/longitude<br/>
              will appear as markers on the map.
            </div>
          </div>
        )}

        {/* Legend */}
        {!loading && allData && allData.events.length > 0 && (
          <div style={{
            position: "absolute", top: 10, right: 10, zIndex: 1000,
            background: "rgba(17,24,20,0.88)", backdropFilter: "blur(4px)",
            borderRadius: 8, padding: "8px 12px",
            border: "0.5px solid rgba(255,255,255,0.1)",
          }}>
            <div style={{ fontSize: 10, color: "#777", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Event types
            </div>
            {[
              ["Birth",     EVENT_COLOR.Birth],
              ["Death",     EVENT_COLOR.Death],
              ["Marriage",  EVENT_COLOR.Marriage],
              ["Residence", EVENT_COLOR.Residence],
              ["Emigration",EVENT_COLOR.Emigration],
            ].map(([label, color]) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0, display: "inline-block" }} />
                <span style={{ fontSize: 11, color: "#ccc" }}>{label}</span>
              </div>
            ))}
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: "0.5px solid rgba(255,255,255,0.1)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#FFDD44", flexShrink: 0, display: "inline-block" }} />
                <span style={{ fontSize: 11, color: "#ccc" }}>This year</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 22, borderTop: "2px dashed #aaa", display: "inline-block" }} />
                <span style={{ fontSize: 11, color: "#ccc" }}>Movement trail</span>
              </div>
            </div>
          </div>
        )}

        {/* Year slider */}
        {!loading && (
          <YearSlider
            year={year}
            minYear={minYear}
            maxYear={maxYear}
            onChange={y => { setYear(y); setPlaying(false); }}
            playing={playing}
            onTogglePlay={() => setPlaying(p => !p)}
          />
        )}
      </div>
    </div>
  );
}
