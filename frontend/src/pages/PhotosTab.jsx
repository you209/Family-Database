/**
 * FamilyRoot — PhotosTab.jsx
 *
 * Left panel: filter bar + paginated photo grid
 * Right panel: photo detail (metadata editor, face overlay, people list)
 */

import { useState, useEffect, useRef, useCallback } from "react";

const API = "";  // proxied via Vite

// ── tiny shared components ────────────────────────────────────────────────────

function Spinner() {
  return (
    <div style={{
      width: 20, height: 20, border: "2px solid var(--color-border-secondary)",
      borderTopColor: "var(--color-accent)", borderRadius: "50%",
      animation: "spin 0.7s linear infinite",
    }} />
  );
}

// inject keyframes once
if (!document.getElementById("fr-keyframes")) {
  const s = document.createElement("style");
  s.id = "fr-keyframes";
  s.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(s);
}

function Tag({ label, color = "gray", onRemove }) {
  const palettes = {
    gray:   ["#F1EFE8", "#6B6960"],
    teal:   ["#E1F5EE", "#0F6E56"],
    blue:   ["#E6F1FB", "#185FA5"],
    amber:  ["#FAEEDA", "#7A4B0A"],
    coral:  ["#FAECE7", "#A03D1C"],
  };
  const [bg, fg] = palettes[color] || palettes.gray;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: bg, color: fg,
      fontSize: 11, fontWeight: 500,
      padding: "2px 7px", borderRadius: 5,
    }}>
      {label}
      {onRemove && (
        <span
          onClick={onRemove}
          style={{ cursor: "pointer", opacity: 0.6, fontWeight: 700, fontSize: 12 }}
        >×</span>
      )}
    </span>
  );
}

// ── photo grid thumbnail ──────────────────────────────────────────────────────

function PhotoThumb({ photo, selected, onClick }) {
  const hasUntaggedFaces = photo.face_count > 0 && photo.tagged_faces < photo.face_count;
  return (
    <div
      onClick={onClick}
      style={{
        position: "relative", cursor: "pointer",
        borderRadius: 6, overflow: "hidden",
        border: selected
          ? "2px solid var(--color-accent)"
          : "1px solid var(--color-border-tertiary)",
        aspectRatio: "1",
        background: "var(--color-background-tertiary)",
        transition: "border-color 0.1s",
      }}
    >
      {photo.thumb_url ? (
        <img
          src={photo.thumb_url}
          alt={photo.filename}
          loading="lazy"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <div style={{
          width: "100%", height: "100%",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--color-text-tertiary)", fontSize: 24,
        }}>🖼</div>
      )}

      {/* Year badge */}
      {photo.date_year && (
        <div style={{
          position: "absolute", bottom: 4, left: 4,
          background: "rgba(0,0,0,0.55)", color: "#fff",
          fontSize: 10, fontWeight: 500,
          padding: "1px 5px", borderRadius: 4, backdropFilter: "blur(2px)",
        }}>{photo.date_year}</div>
      )}

      {/* Untagged face dot */}
      {hasUntaggedFaces && (
        <div style={{
          position: "absolute", top: 4, right: 4,
          width: 8, height: 8, borderRadius: "50%",
          background: "#F5A623", border: "1.5px solid #fff",
        }} title="Contains untagged faces" />
      )}
    </div>
  );
}

// ── face overlay on full image ────────────────────────────────────────────────

function FaceOverlay({ faces, imgRef }) {
  const [dims, setDims] = useState(null);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const update = () => setDims({ w: img.offsetWidth, h: img.offsetHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(img);
    return () => ro.disconnect();
  }, [imgRef]);

  if (!dims || !faces?.length) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {faces.map((f, i) => {
        if (!f.bbox) return null;
        const [x1, y1, x2, y2] = f.bbox;
        const left   = (x1 / (imgRef.current?.naturalWidth  || 1)) * dims.w;
        const top    = (y1 / (imgRef.current?.naturalHeight || 1)) * dims.h;
        const width  = ((x2 - x1) / (imgRef.current?.naturalWidth  || 1)) * dims.w;
        const height = ((y2 - y1) / (imgRef.current?.naturalHeight || 1)) * dims.h;
        const color  = f.person_id ? "var(--color-accent)" : "#F5A623";
        return (
          <div key={i} style={{
            position: "absolute", left, top, width, height,
            border: `1.5px solid ${color}`,
            borderRadius: 3,
          }}>
            {f.name_given && (
              <div style={{
                position: "absolute", bottom: -18, left: 0,
                background: color, color: "#fff",
                fontSize: 9, fontWeight: 500,
                padding: "1px 4px", borderRadius: 3,
                whiteSpace: "nowrap",
              }}>{f.name_given}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── metadata editor ───────────────────────────────────────────────────────────

function MetaEditor({ photo, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [dateText, setDateText]   = useState(photo.date_text || "");
  const [dateYear, setDateYear]   = useState(photo.date_year || "");
  const [desc, setDesc]           = useState(photo.description || "");
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    setDateText(photo.date_text || "");
    setDateYear(photo.date_year || "");
    setDesc(photo.description || "");
    setEditing(false);
  }, [photo.id]);

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/api/photos/${photo.id}/meta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date_text: dateText || null,
          date_year: dateYear ? parseInt(dateYear) : null,
          description: desc || null,
        }),
      });
      setEditing(false);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  const row = (label, content) => (
    <div style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
      <div style={{ width: 72, fontSize: 11, color: "var(--color-text-tertiary)", paddingTop: 2, flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1 }}>{content}</div>
    </div>
  );

  if (!editing) {
    return (
      <div>
        {row("Date", <span style={{ fontSize: 13 }}>{photo.date_text || (photo.date_year ? String(photo.date_year) : <em style={{ color: "var(--color-text-tertiary)" }}>unknown</em>)}</span>)}
        {row("Description", <span style={{ fontSize: 13 }}>{photo.description || <em style={{ color: "var(--color-text-tertiary)" }}>none</em>}</span>)}
        {row("File", <span style={{ fontSize: 11, color: "var(--color-text-secondary)", fontFamily: "var(--font-mono)" }}>{photo.filename}</span>)}
        {photo.width && row("Size", <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{photo.width}×{photo.height}</span>)}
        <button onClick={() => setEditing(true)} style={{ fontSize: 12, marginTop: 4 }}>Edit metadata</button>
      </div>
    );
  }

  return (
    <div>
      {row("Date text", (
        <input
          type="text"
          value={dateText}
          onChange={e => setDateText(e.target.value)}
          placeholder='e.g. "Abt 1935" or "12 Jun 1948"'
          style={{ width: "100%", fontSize: 12 }}
        />
      ))}
      {row("Year (for sorting)", (
        <input
          type="number"
          value={dateYear}
          onChange={e => setDateYear(e.target.value)}
          placeholder="1935"
          style={{ width: 90, fontSize: 12 }}
          min={1800} max={2100}
        />
      ))}
      {row("Description", (
        <textarea
          value={desc}
          onChange={e => setDesc(e.target.value)}
          rows={3}
          placeholder="Who's in it, what's the occasion, where was it taken…"
          style={{ width: "100%", fontSize: 12, resize: "vertical" }}
        />
      ))}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        <button onClick={() => setEditing(false)}>Cancel</button>
      </div>
    </div>
  );
}

// ── photo detail panel ────────────────────────────────────────────────────────

function PhotoDetail({ photoId, onClose, onMetaSaved }) {
  const [photo, setPhoto] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showFaces, setShowFaces] = useState(true);
  const imgRef = useRef(null);

  const load = useCallback(() => {
    if (!photoId) return;
    setLoading(true);
    fetch(`${API}/api/photos/${photoId}`)
      .then(r => r.json())
      .then(d => { setPhoto(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [photoId]);

  useEffect(() => { load(); }, [load]);

  const panelStyle = {
    width: 360, flexShrink: 0,
    display: "flex", flexDirection: "column",
    borderLeft: "0.5px solid var(--color-border-tertiary)",
    background: "var(--color-background-primary)",
    overflow: "hidden",
  };

  if (!photoId) return null;

  return (
    <div style={panelStyle}>
      {/* Panel header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px", borderBottom: "0.5px solid var(--color-border-tertiary)",
        background: "var(--color-background-secondary)", flexShrink: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Photo detail</span>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 16, padding: "0 4px", cursor: "pointer", color: "var(--color-text-secondary)" }}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 40 }}><Spinner /></div>
        )}

        {!loading && photo && (
          <>
            {/* Image */}
            <div style={{
              position: "relative", borderRadius: 8, overflow: "hidden",
              background: "#000", marginBottom: 14,
              border: "0.5px solid var(--color-border-tertiary)",
            }}>
              <img
                ref={imgRef}
                src={photo.original_url || photo.thumb_url}
                alt={photo.filename}
                style={{ width: "100%", display: "block", maxHeight: 280, objectFit: "contain" }}
              />
              {showFaces && <FaceOverlay faces={photo.faces} imgRef={imgRef} />}
            </div>

            {/* Face toggle */}
            {photo.face_count > 0 && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={showFaces} onChange={e => setShowFaces(e.target.checked)} />
                  Show face boxes ({photo.face_count} detected)
                </label>
              </div>
            )}

            {/* People in photo */}
            {photo.people?.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>People</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {photo.people.map(p => (
                    <Tag key={p.id} label={p.name} color="teal" />
                  ))}
                </div>
                {photo.face_count > photo.people.length && (
                  <div style={{ fontSize: 11, color: "#BA7517", marginTop: 6 }}>
                    ⚠ {photo.face_count - photo.people.length} untagged face{photo.face_count - photo.people.length !== 1 ? "s" : ""} — name them in the Faces tab
                  </div>
                )}
              </div>
            )}

            {/* Metadata */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Metadata</div>
              <MetaEditor photo={photo} onSaved={() => { load(); onMetaSaved?.(); }} />
            </div>

            {/* EXIF */}
            {photo.exif && Object.keys(photo.exif).length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ fontSize: 11, color: "var(--color-text-tertiary)", cursor: "pointer" }}>EXIF data</summary>
                <div style={{ marginTop: 8, fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                  {Object.entries(photo.exif).slice(0, 12).map(([k, v]) => (
                    <div key={k}><span style={{ color: "var(--color-text-tertiary)" }}>{k}:</span> {String(v)}</div>
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── filter bar ────────────────────────────────────────────────────────────────

function FilterBar({ filters, onChange, stats }) {
  const years = [];
  if (stats?.earliest_year && stats?.latest_year) {
    for (let y = stats.latest_year; y >= stats.earliest_year; y--) years.push(y);
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      padding: "10px 16px",
      borderBottom: "0.5px solid var(--color-border-tertiary)",
      background: "var(--color-background-secondary)",
      flexShrink: 0,
    }}>
      {/* Year filter */}
      <select
        value={filters.year || ""}
        onChange={e => onChange({ ...filters, year: e.target.value || null, page: 1 })}
        style={{ fontSize: 12 }}
      >
        <option value="">All years</option>
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>

      {/* Untagged filter */}
      <select
        value={filters.untagged || ""}
        onChange={e => onChange({ ...filters, untagged: e.target.value || null, page: 1 })}
        style={{ fontSize: 12 }}
      >
        <option value="">All photos</option>
        <option value="date">Missing date</option>
        <option value="faces">Untagged faces</option>
      </select>

      {/* Sort */}
      <select
        value={filters.sort || "date_asc"}
        onChange={e => onChange({ ...filters, sort: e.target.value, page: 1 })}
        style={{ fontSize: 12 }}
      >
        <option value="date_asc">Date ↑</option>
        <option value="date_desc">Date ↓</option>
        <option value="name_asc">Filename</option>
        <option value="ingested">Recently added</option>
      </select>

      {/* Active filter tags */}
      {filters.year && (
        <Tag label={`Year: ${filters.year}`} color="blue" onRemove={() => onChange({ ...filters, year: null, page: 1 })} />
      )}
      {filters.untagged && (
        <Tag label={filters.untagged === "date" ? "Missing date" : "Untagged faces"} color="amber" onRemove={() => onChange({ ...filters, untagged: null, page: 1 })} />
      )}

      {stats && (
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--color-text-tertiary)" }}>
          {stats.total_photos.toLocaleString()} total
          {stats.without_date > 0 && ` · ${stats.without_date} undated`}
        </span>
      )}
    </div>
  );
}

// ── pagination ────────────────────────────────────────────────────────────────

function Pagination({ page, pages, onChange }) {
  if (pages <= 1) return null;
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      padding: "12px 16px", borderTop: "0.5px solid var(--color-border-tertiary)",
      flexShrink: 0,
    }}>
      <button onClick={() => onChange(page - 1)} disabled={page <= 1}>← Prev</button>
      <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
        Page {page} of {pages}
      </span>
      <button onClick={() => onChange(page + 1)} disabled={page >= pages}>Next →</button>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function PhotosTab() {
  const [photos, setPhotos]       = useState([]);
  const [total, setTotal]         = useState(0);
  const [pages, setPages]         = useState(1);
  const [loading, setLoading]     = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [stats, setStats]         = useState(null);
  const [filters, setFilters]     = useState({ page: 1, sort: "date_asc" });
  const gridRef = useRef(null);

  // Load stats once
  useEffect(() => {
    fetch(`${API}/api/photos/stats`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setStats(d))
      .catch(() => {});
  }, []);

  // Load photos whenever filters change
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", filters.page || 1);
    params.set("per_page", 60);
    if (filters.year) params.set("year", filters.year);
    if (filters.untagged) params.set("untagged", filters.untagged);
    if (filters.person_id) params.set("person_id", filters.person_id);
    params.set("sort", filters.sort || "date_asc");

    fetch(`${API}/api/photos/?${params}`)
      .then(r => r.json())
      .then(d => {
        setPhotos(d.photos || []);
        setTotal(d.total || 0);
        setPages(d.pages || 1);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [filters]);

  const handleFilterChange = useCallback((newFilters) => {
    setFilters(newFilters);
    gridRef.current?.scrollTo(0, 0);
  }, []);

  const handlePageChange = useCallback((p) => {
    setFilters(f => ({ ...f, page: p }));
    gridRef.current?.scrollTo(0, 0);
  }, []);

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
      {/* Left: grid */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <FilterBar filters={filters} onChange={handleFilterChange} stats={stats} />

        {/* Grid */}
        <div ref={gridRef} style={{ flex: 1, overflowY: "auto", padding: 12 }}>
          {loading && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 60 }}>
              <Spinner />
            </div>
          )}

          {!loading && photos.length === 0 && (
            <div style={{ textAlign: "center", marginTop: 80, color: "var(--color-text-tertiary)" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🖼</div>
              <div style={{ fontSize: 14 }}>No photos found</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                Import photos via the command line or adjust your filters
              </div>
            </div>
          )}

          {!loading && photos.length > 0 && (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
              gap: 8,
            }}>
              {photos.map(p => (
                <PhotoThumb
                  key={p.id}
                  photo={p}
                  selected={selectedId === p.id}
                  onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}
                />
              ))}
            </div>
          )}
        </div>

        <Pagination
          page={filters.page || 1}
          pages={pages}
          onChange={handlePageChange}
        />
      </div>

      {/* Right: detail panel */}
      {selectedId && (
        <PhotoDetail
          photoId={selectedId}
          onClose={() => setSelectedId(null)}
          onMetaSaved={() => {
            // Refresh stats after metadata edit
            fetch(`${API}/api/photos/stats`)
              .then(r => r.json())
              .then(d => setStats(d))
              .catch(() => {});
          }}
        />
      )}
    </div>
  );
}
