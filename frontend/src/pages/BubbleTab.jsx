/**
 * FamilyRoot — BubbleTab.jsx
 *
 * Xenoblade-style bubble board.
 * Bubble colour = relationship group:
 *   green  → family
 *   red    → work colleague
 *   blue   → friend
 *   grey   → unassigned
 *
 * Bubble radius ∝ √photo_count (area ∝ photo count).
 * Family-tree edges connect couples (thick) and parents→children (thin).
 * Click a bubble to open a side panel: photos + group picker.
 */

import { useState, useEffect, useRef, useCallback } from "react";

const API = "";

// ── colour palette ────────────────────────────────────────────────────────────

const GROUP_COLOR = {
  family:    { fill: "#1D9E75", stroke: "#0F6E56", label: "#fff", light: "#E1F5EE" },
  colleague: { fill: "#C0392B", stroke: "#922B21", label: "#fff", light: "#FADBD8" },
  friend:    { fill: "#2980B9", stroke: "#1F618D", label: "#fff", light: "#D6EAF8" },
  none:      { fill: "#5A5A52", stroke: "#3A3A34", label: "#ccc", light: "#ECEAE1" },
};

const GROUP_LABELS = {
  family:    "Family",
  colleague: "Work colleague",
  friend:    "Friend",
};

// ── physics constants ─────────────────────────────────────────────────────────

const MIN_R   = 18;
const MAX_R   = 72;
const PADDING = 6;
const DAMPING = 0.82;
const STEPS   = 3;

// ── helpers ───────────────────────────────────────────────────────────────────

function photoRadius(count, max) {
  if (!max) return MIN_R;
  return MIN_R + (MAX_R - MIN_R) * Math.sqrt(count / max);
}

function shortName(p) {
  const g = p.name_given   || "";
  const s = p.name_surname || "";
  if (!g && !s) return "?";
  if (!s) return g;
  return `${g ? g[0] + ". " : ""}${s}`;
}

function lighten(hex, amt) {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, (n >> 16) + amt);
  const gc = Math.min(255, ((n >> 8) & 0xff) + amt);
  const b  = Math.min(255, (n & 0xff) + amt);
  return `rgb(${r},${gc},${b})`;
}

// ── physics ───────────────────────────────────────────────────────────────────

function initNodes(people, w, h, maxPhotos) {
  return people.map((p, i) => {
    const r     = photoRadius(p.photo_count, maxPhotos);
    const angle = i * 2.4;
    const dist  = Math.sqrt(i) * (MAX_R + PADDING) * 0.9;
    return { ...p, r, x: w / 2 + Math.cos(angle) * dist, y: h / 2 + Math.sin(angle) * dist, vx: 0, vy: 0 };
  });
}

function tick(nodes, edges, w, h) {
  const idxById = {};
  nodes.forEach((n, i) => { idxById[n.id] = i; });

  for (let step = 0; step < STEPS; step++) {
    // Repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d  = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const min = a.r + b.r + PADDING;
        if (d < min) {
          const push = (min - d) / d * 0.5;
          a.vx -= dx * push; a.vy -= dy * push;
          b.vx += dx * push; b.vy += dy * push;
        }
      }
    }
    // Edge springs
    for (const { aId, bId, ideal } of edges) {
      const ai = idxById[aId], bi = idxById[bId];
      if (ai == null || bi == null) continue;
      const a = nodes[ai], b = nodes[bi];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d  = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const stretch = (d - ideal) / d * 0.04;
      a.vx += dx * stretch; a.vy += dy * stretch;
      b.vx -= dx * stretch; b.vy -= dy * stretch;
    }
    // Centre gravity
    for (const n of nodes) {
      n.vx += (w / 2 - n.x) * 0.003;
      n.vy += (h / 2 - n.y) * 0.003;
    }
    // Integrate
    for (const n of nodes) {
      n.vx *= DAMPING; n.vy *= DAMPING;
      n.x  += n.vx;   n.y  += n.vy;
      n.x = Math.max(n.r + 2, Math.min(w - n.r - 2, n.x));
      n.y = Math.max(n.r + 2, Math.min(h - n.r - 2, n.y));
    }
  }
}

// ── canvas draw ───────────────────────────────────────────────────────────────

function draw(ctx, nodes, edges, idxById, selectedId, hoveredId, filterText) {
  const { width: w, height: h } = ctx.canvas;
  ctx.clearRect(0, 0, w, h);

  // Edges
  for (const { aId, bId, couple } of edges) {
    const ai = idxById[aId], bi = idxById[bId];
    if (ai == null || bi == null) continue;
    const a = nodes[ai], b = nodes[bi];
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = couple ? "rgba(200,160,60,0.4)" : "rgba(160,180,160,0.25)";
    ctx.lineWidth   = couple ? 2 : 1;
    ctx.stroke();
  }

  // Bubbles
  for (const n of nodes) {
    const isSel = n.id === selectedId;
    const isHov = n.id === hoveredId;
    const isDim = filterText && !`${n.name_given || ""} ${n.name_surname || ""}`.toLowerCase().includes(filterText);
    const c  = GROUP_COLOR[n.group || "none"];
    const r  = n.r;

    ctx.save();
    ctx.globalAlpha = isDim ? 0.2 : 1;

    // Glow ring
    if (isSel || isHov) {
      ctx.shadowColor = isSel ? "#FFDD44" : "#ffffff";
      ctx.shadowBlur  = isSel ? 22 : 14;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r + (isSel ? 4 : 2), 0, Math.PI * 2);
      ctx.fillStyle = isSel ? "#FFDD44" : "#ffffff44";
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Main circle
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(n.x - r * 0.3, n.y - r * 0.3, r * 0.05, n.x, n.y, r);
    grad.addColorStop(0, lighten(c.fill, 55));
    grad.addColorStop(1, c.fill);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = isSel ? "#FFDD44" : c.stroke;
    ctx.lineWidth   = isSel ? 2.5 : 1.5;
    ctx.stroke();

    // Thumbnail clipped inside circle
    if (n._img?.complete && n._img.naturalWidth) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(n.x, n.y, r - 2, 0, Math.PI * 2);
      ctx.clip();
      const s = (r - 2) * 2;
      ctx.drawImage(n._img, n.x - r + 2, n.y - r + 2, s, s);
      // tint overlay in group colour
      ctx.fillStyle = c.fill + "88";
      ctx.fillRect(n.x - r + 2, n.y - r + 2, s, s);
      ctx.restore();
    }

    // Name
    ctx.fillStyle    = c.label;
    ctx.font         = `${Math.max(9, Math.min(13, r * 0.38))}px -apple-system,sans-serif`;
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(shortName(n), n.x, n.y, r * 1.7);

    // Photo-count badge
    if (n.photo_count > 0 && r >= 28) {
      const badge = String(n.photo_count);
      const bx = n.x + r * 0.65, by = n.y + r * 0.65;
      const br = Math.max(9, badge.length * 5);
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fillStyle = "#FFDD44";
      ctx.fill();
      ctx.font      = `bold ${Math.max(8, br * 0.9)}px -apple-system,sans-serif`;
      ctx.fillStyle = "#1A1916";
      ctx.fillText(badge, bx, by);
    }

    ctx.restore();
  }
}

// ── person side panel ─────────────────────────────────────────────────────────

function PersonPanel({ person, onClose, onGroupChange }) {
  const [photos, setPhotos]   = useState([]);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    if (!person) return;
    setPhotos([]);
    fetch(`${API}/api/photos/by-person/${person.id}`)
      .then(r => r.json())
      .then(d => setPhotos(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [person?.id]);

  const setGroup = async (group) => {
    setSaving(true);
    try {
      await fetch(`${API}/api/persons/${person.id}/group`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group: group || null }),
      });
      onGroupChange?.(person.id, group);
    } finally {
      setSaving(false);
    }
  };

  if (!person) return null;

  const fullName = [person.name_given, person.name_surname].filter(Boolean).join(" ") || "Unknown";
  const years    = [person.birth_year, person.death_year].filter(Boolean).join(" – ");
  const c        = GROUP_COLOR[person.group || "none"];

  return (
    <div style={{
      width: 300, flexShrink: 0,
      borderLeft: "0.5px solid var(--color-border-tertiary)",
      display: "flex", flexDirection: "column",
      background: "var(--color-background-primary)",
      overflow: "hidden",
    }}>
      {/* Header stripe in group colour */}
      <div style={{
        padding: "10px 14px",
        borderBottom: "0.5px solid var(--color-border-tertiary)",
        background: c.light,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontWeight: 500, fontSize: 14 }}>{fullName}</div>
          {years && <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{years}</div>}
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--color-text-secondary)" }}>✕</button>
      </div>

      {/* Group picker */}
      <div style={{ padding: "10px 14px", borderBottom: "0.5px solid var(--color-border-tertiary)", flexShrink: 0 }}>
        <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Relationship
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["family", "colleague", "friend"].map(g => {
            const gc    = GROUP_COLOR[g];
            const active = person.group === g;
            return (
              <button
                key={g}
                onClick={() => setGroup(active ? null : g)}
                disabled={saving}
                style={{
                  fontSize: 12, padding: "4px 10px",
                  background: active ? gc.fill : "var(--color-background-secondary)",
                  color:      active ? "#fff"  : "var(--color-text-secondary)",
                  border:     `1.5px solid ${active ? gc.fill : "var(--color-border-secondary)"}`,
                  borderRadius: 20,
                  cursor: "pointer",
                  transition: "all 0.12s",
                }}
              >
                {GROUP_LABELS[g]}
              </button>
            );
          })}
          {person.group && (
            <button
              onClick={() => setGroup(null)}
              disabled={saving}
              style={{ fontSize: 11, padding: "4px 8px", color: "var(--color-text-tertiary)", background: "none", border: "none", cursor: "pointer" }}
            >
              clear
            </button>
          )}
        </div>
      </div>

      {/* Photo count */}
      <div style={{ padding: "6px 14px", borderBottom: "0.5px solid var(--color-border-tertiary)", flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
          {person.photo_count} photo{person.photo_count !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Photo grid */}
      <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
        {photos.length === 0 && (
          <div style={{ textAlign: "center", marginTop: 40, fontSize: 12, color: "var(--color-text-tertiary)" }}>
            No photos yet
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
          {photos.map(p => (
            <div key={p.id} title={p.filename} style={{
              aspectRatio: "1", borderRadius: 5, overflow: "hidden",
              background: "var(--color-background-tertiary)",
              border: "0.5px solid var(--color-border-tertiary)",
            }}>
              {p.thumb_url
                ? <img src={p.thumb_url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>🖼</div>
              }
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────────

export default function BubbleTab() {
  const canvasRef  = useRef(null);
  const stateRef   = useRef({ nodes: [], edges: [], idxById: {}, animId: null });
  const dragRef    = useRef(null);
  const filterRef  = useRef("");

  const [selected, setSelected] = useState(null);
  const [hovered,  setHovered]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");

  // refs so draw() always has the current values without re-mounting the loop
  const selectedRef = useRef(null);
  const hoveredRef  = useRef(null);
  selectedRef.current = selected;
  hoveredRef.current  = hovered;

  // ── load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch(`${API}/api/persons/bubbles`)
      .then(r => r.json())
      .then(({ people, families }) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const w = canvas.width  || canvas.offsetWidth;
        const h = canvas.height || canvas.offsetHeight;

        const maxPhotos = Math.max(...people.map(p => p.photo_count), 1);
        const nodes = initNodes(people, w, h, maxPhotos);

        nodes.forEach(n => {
          if (n.thumb_url) {
            const img = new Image();
            img.src = n.thumb_url;
            n._img = img;
          }
        });

        const idSet = new Set(nodes.map(n => n.id));
        const edges = [];
        for (const f of (families || [])) {
          if (f.father_id && f.mother_id && idSet.has(f.father_id) && idSet.has(f.mother_id))
            edges.push({ aId: f.father_id, bId: f.mother_id, couple: true,  ideal: MAX_R * 2.8 });
          for (const cid of (f.child_ids || [])) {
            if (!idSet.has(cid)) continue;
            const parentId = f.father_id || f.mother_id;
            if (parentId && idSet.has(parentId))
              edges.push({ aId: parentId, bId: cid, couple: false, ideal: MAX_R * 2.4 });
          }
        }

        const idxById = {};
        nodes.forEach((n, i) => { idxById[n.id] = i; });
        stateRef.current = { nodes, edges, idxById, animId: null };
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // ── animation loop ─────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;
    let alive = true;

    const loop = () => {
      if (!alive) return;
      const s = stateRef.current;
      tick(s.nodes, s.edges, canvas.width, canvas.height);
      draw(ctx, s.nodes, s.edges, s.idxById, selectedRef.current, hoveredRef.current, filterRef.current);
      animId = requestAnimationFrame(loop);
    };

    const wait = setInterval(() => {
      if (stateRef.current.nodes.length > 0) { clearInterval(wait); loop(); }
    }, 100);

    return () => { alive = false; clearInterval(wait); cancelAnimationFrame(animId); };
  }, []);

  // ── resize canvas ──────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const set = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    const ro = new ResizeObserver(set);
    ro.observe(canvas);
    set();
    return () => ro.disconnect();
  }, []);

  // ── search filter → ref so draw() reads it without re-binding ─────────────

  useEffect(() => { filterRef.current = search.trim().toLowerCase(); }, [search]);

  // ── mouse / touch helpers ──────────────────────────────────────────────────

  const getXY = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const src  = e.touches ? e.touches[0] : e;
    return [src.clientX - rect.left, src.clientY - rect.top];
  };

  const nodeAt = useCallback((x, y) => {
    for (const n of [...stateRef.current.nodes].reverse()) {
      const dx = x - n.x, dy = y - n.y;
      if (dx * dx + dy * dy <= n.r * n.r) return n;
    }
    return null;
  }, []);

  const onMouseMove = useCallback((e) => {
    const [x, y] = getXY(e);
    if (dragRef.current) {
      dragRef.current.x  = x;
      dragRef.current.y  = y;
      dragRef.current.vx = 0;
      dragRef.current.vy = 0;
      return;
    }
    const n = nodeAt(x, y);
    setHovered(n?.id ?? null);
    canvasRef.current.style.cursor = n ? "pointer" : "default";
  }, [nodeAt]);

  const onMouseDown = useCallback((e) => {
    const [x, y] = getXY(e);
    dragRef.current = nodeAt(x, y) || null;
  }, [nodeAt]);

  const onMouseUp = useCallback((e) => {
    const [x, y] = getXY(e);
    const n = nodeAt(x, y);
    if (n && dragRef.current === n) setSelected(s => s === n.id ? null : n.id);
    dragRef.current = null;
  }, [nodeAt]);

  // When the user changes a person's group in the panel, update the node in-place
  const handleGroupChange = useCallback((personId, group) => {
    const node = stateRef.current.nodes.find(n => n.id === personId);
    if (node) node.group = group || null;
    // Also update the selected node object so the panel re-renders
    setSelected(s => { return s; }); // force re-render
  }, []);

  const selectedNode = stateRef.current.nodes.find(n => n.id === selected) ?? null;

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden", flexDirection: "column" }}>
      {/* Toolbar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 14, padding: "8px 16px",
        borderBottom: "0.5px solid var(--color-border-tertiary)",
        background: "var(--color-background-secondary)", flexShrink: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Family bubble board</span>
        <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
          Size = photo count · click to assign group · drag to rearrange
        </span>

        {/* Legend */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {[["family","Family"],["colleague","Work colleague"],["friend","Friend"]].map(([g, label]) => (
            <span key={g} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--color-text-secondary)" }}>
              <span style={{ width: 11, height: 11, borderRadius: "50%", background: GROUP_COLOR[g].fill, display: "inline-block", flexShrink: 0 }} />
              {label}
            </span>
          ))}
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--color-text-secondary)" }}>
            <span style={{ width: 11, height: 11, borderRadius: "50%", background: GROUP_COLOR.none.fill, display: "inline-block", flexShrink: 0 }} />
            Unassigned
          </span>
        </div>

        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter by name…"
          style={{ marginLeft: "auto", width: 180, fontSize: 12 }}
        />
      </div>

      {/* Canvas + panel */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
        {loading && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 10,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "#111814", flexDirection: "column", gap: 12,
            fontSize: 13, color: "#aaa",
          }}>
            <div style={{
              width: 28, height: 28,
              border: "2.5px solid #333",
              borderTopColor: "#1D9E75",
              borderRadius: "50%",
              animation: "spin 0.7s linear infinite",
            }} />
            Loading family…
          </div>
        )}

        <canvas
          ref={canvasRef}
          style={{ flex: 1, display: "block", background: "#111814", touchAction: "none" }}
          onMouseMove={onMouseMove}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onMouseLeave={() => { setHovered(null); dragRef.current = null; }}
          onTouchStart={e => { e.preventDefault(); onMouseDown(e); }}
          onTouchMove={e => { e.preventDefault(); onMouseMove(e); }}
          onTouchEnd={e => { e.preventDefault(); onMouseUp(e); }}
        />

        {selected && selectedNode && (
          <PersonPanel
            person={selectedNode}
            onClose={() => setSelected(null)}
            onGroupChange={handleGroupChange}
          />
        )}
      </div>
    </div>
  );
}
