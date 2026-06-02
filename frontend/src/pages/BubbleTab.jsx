/**
 * FamilyRoot — BubbleTab.jsx
 *
 * Xenoblade-style bubble board.
 * Each person = a circle; radius ∝ √photo_count so area ∝ photo_count.
 * Family edges connect couples (thick) and parents→children (thin).
 * A lightweight force simulation keeps bubbles separated and edges taut.
 * Click a bubble to open a side panel with their photos.
 */

import { useState, useEffect, useRef, useCallback } from "react";

const API = "";

// ── constants ─────────────────────────────────────────────────────────────────

const MIN_R   = 18;
const MAX_R   = 72;
const PADDING = 6;     // gap between bubble edges
const DAMPING = 0.82;
const STEPS   = 3;     // physics sub-steps per frame

const GENDER_COLOR = {
  M: { fill: "#1C6EBF", stroke: "#0D4A8A", label: "#fff" },
  F: { fill: "#B03A8A", stroke: "#7A2060", label: "#fff" },
  U: { fill: "#4E7A5A", stroke: "#2E5438", label: "#fff" },
  N: { fill: "#6B5EA8", stroke: "#453A7A", label: "#fff" },
};
const DEFAULT_COLOR = GENDER_COLOR.U;

// ── physics helpers ───────────────────────────────────────────────────────────

function initNodes(people, w, h, maxPhotos) {
  return people.map((p, i) => {
    const r = photoRadius(p.photo_count, maxPhotos);
    // Spiral placement so nodes don't all start at centre
    const angle = i * 2.4;
    const dist  = Math.sqrt(i) * (MAX_R + PADDING) * 0.9;
    return {
      ...p,
      r,
      x: w / 2 + Math.cos(angle) * dist,
      y: h / 2 + Math.sin(angle) * dist,
      vx: 0, vy: 0,
    };
  });
}

function photoRadius(count, max) {
  if (!max) return MIN_R;
  return MIN_R + (MAX_R - MIN_R) * Math.sqrt(count / max);
}

function tick(nodes, edges, w, h) {
  const idxById = {};
  nodes.forEach((n, i) => { idxById[n.id] = i; });

  for (let step = 0; step < STEPS; step++) {
    // Repulsion between all pairs
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const minDist = a.r + b.r + PADDING;
        if (dist < minDist) {
          const push = (minDist - dist) / dist * 0.5;
          a.vx -= dx * push; a.vy -= dy * push;
          b.vx += dx * push; b.vy += dy * push;
        }
      }
    }

    // Edge attraction (spring toward ideal length)
    for (const { aId, bId, ideal } of edges) {
      const ai = idxById[aId], bi = idxById[bId];
      if (ai == null || bi == null) continue;
      const a = nodes[ai], b = nodes[bi];
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const stretch = (dist - ideal) / dist * 0.04;
      a.vx += dx * stretch; a.vy += dy * stretch;
      b.vx -= dx * stretch; b.vy -= dy * stretch;
    }

    // Gravity toward centre
    for (const n of nodes) {
      n.vx += (w / 2 - n.x) * 0.003;
      n.vy += (h / 2 - n.y) * 0.003;
    }

    // Integrate + damp + clamp to canvas
    for (const n of nodes) {
      n.vx *= DAMPING; n.vy *= DAMPING;
      n.x  += n.vx;   n.y  += n.vy;
      n.x = Math.max(n.r + 2, Math.min(w - n.r - 2, n.x));
      n.y = Math.max(n.r + 2, Math.min(h - n.r - 2, n.y));
    }
  }
}

// ── canvas drawing ─────────────────────────────────────────────────────────────

function draw(ctx, nodes, edges, idxById, selected, hovered) {
  const { width: w, height: h } = ctx.canvas;
  ctx.clearRect(0, 0, w, h);

  // Edges first
  for (const { aId, bId, couple } of edges) {
    const ai = idxById[aId], bi = idxById[bId];
    if (ai == null || bi == null) continue;
    const a = nodes[ai], b = nodes[bi];
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = couple ? "rgba(200,160,80,0.45)" : "rgba(140,160,140,0.3)";
    ctx.lineWidth   = couple ? 2 : 1;
    ctx.stroke();
  }

  // Bubbles
  for (const n of nodes) {
    const isSel = n.id === selected;
    const isHov = n.id === hovered;
    const c = GENDER_COLOR[n.gender] || DEFAULT_COLOR;
    const r = n.r;

    // Shadow / glow for selected
    if (isSel || isHov) {
      ctx.save();
      ctx.shadowColor  = isSel ? "#FFDD44" : "#fff";
      ctx.shadowBlur   = isSel ? 20 : 12;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r + (isSel ? 3 : 1), 0, Math.PI * 2);
      ctx.fillStyle = isSel ? "#FFDD44" : "#ffffff88";
      ctx.fill();
      ctx.restore();
    }

    // Circle
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(n.x - r * 0.3, n.y - r * 0.3, r * 0.1, n.x, n.y, r);
    grad.addColorStop(0, lighten(c.fill, 40));
    grad.addColorStop(1, c.fill);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = isSel ? "#FFDD44" : c.stroke;
    ctx.lineWidth   = isSel ? 2.5 : 1.5;
    ctx.stroke();

    // Thumbnail clipped to circle (if loaded)
    if (n._img?.complete && n._img.naturalWidth) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(n.x, n.y, r - 2, 0, Math.PI * 2);
      ctx.clip();
      const s = (r - 2) * 2;
      ctx.drawImage(n._img, n.x - r + 2, n.y - r + 2, s, s);
      // Darken overlay so text is readable
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.fill();
      ctx.restore();
    }

    // Label
    const label = shortName(n);
    ctx.fillStyle = c.label;
    ctx.font      = `${Math.max(9, Math.min(13, r * 0.38))}px -apple-system,sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, n.x, n.y, r * 1.7);

    // Photo count badge (only if has photos)
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
  }
}

function lighten(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, (n >> 16) + amt);
  const g = Math.min(255, ((n >> 8) & 0xff) + amt);
  const b = Math.min(255, (n & 0xff) + amt);
  return `rgb(${r},${g},${b})`;
}

function shortName(p) {
  const given   = p.name_given   || "";
  const surname = p.name_surname || "";
  if (!given && !surname) return "?";
  if (!surname) return given;
  return `${given ? given[0] + ". " : ""}${surname}`;
}

// ── person detail panel ────────────────────────────────────────────────────────

function PersonPanel({ person, onClose }) {
  const [photos, setPhotos] = useState([]);

  useEffect(() => {
    if (!person) return;
    fetch(`${API}/api/photos/by-person/${person.id}`)
      .then(r => r.json())
      .then(d => setPhotos(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [person?.id]);

  if (!person) return null;

  const fullName = [person.name_given, person.name_surname].filter(Boolean).join(" ") || "Unknown";
  const years = [person.birth_year, person.death_year].filter(Boolean).join(" – ");

  return (
    <div style={{
      width: 300, flexShrink: 0,
      borderLeft: "0.5px solid var(--color-border-tertiary)",
      display: "flex", flexDirection: "column",
      background: "var(--color-background-primary)",
      overflow: "hidden",
    }}>
      <div style={{
        padding: "10px 14px", borderBottom: "0.5px solid var(--color-border-tertiary)",
        background: "var(--color-background-secondary)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontWeight: 500, fontSize: 14 }}>{fullName}</div>
          {years && <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{years}</div>}
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--color-text-secondary)" }}>✕</button>
      </div>

      <div style={{ padding: "10px 12px", flexShrink: 0, borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
          {person.photo_count} photo{person.photo_count !== 1 ? "s" : ""}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
        {photos.length === 0 && (
          <div style={{ textAlign: "center", marginTop: 40, fontSize: 12, color: "var(--color-text-tertiary)" }}>
            No photos yet
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
          {photos.map(p => (
            <div
              key={p.id}
              title={p.filename}
              style={{
                aspectRatio: "1", borderRadius: 5, overflow: "hidden",
                background: "var(--color-background-tertiary)",
                border: "0.5px solid var(--color-border-tertiary)",
              }}
            >
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
  const canvasRef = useRef(null);
  const stateRef  = useRef({ nodes: [], edges: [], idxById: {}, running: false, animId: null });
  const [selected, setSelected] = useState(null);   // person id
  const [hovered,  setHovered]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");
  const dragRef = useRef(null);

  // ── load data ────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch(`${API}/api/persons/bubbles`)
      .then(r => r.json())
      .then(({ people, families }) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const w = canvas.width, h = canvas.height;

        const maxPhotos = Math.max(...people.map(p => p.photo_count), 1);
        const nodes = initNodes(people, w, h, maxPhotos);

        // Pre-load thumbnails
        nodes.forEach(n => {
          if (n.thumb_url) {
            const img = new Image();
            img.src = n.thumb_url;
            n._img = img;
          }
        });

        // Build edge list
        const edges = [];
        const idSet = new Set(nodes.map(n => n.id));
        for (const f of (families || [])) {
          if (f.father_id && f.mother_id && idSet.has(f.father_id) && idSet.has(f.mother_id)) {
            edges.push({ aId: f.father_id, bId: f.mother_id, couple: true, ideal: MAX_R * 2.8 });
          }
          for (const cid of (f.child_ids || [])) {
            if (!idSet.has(cid)) continue;
            if (f.father_id && idSet.has(f.father_id))
              edges.push({ aId: f.father_id, bId: cid, couple: false, ideal: MAX_R * 2.4 });
            else if (f.mother_id && idSet.has(f.mother_id))
              edges.push({ aId: f.mother_id, bId: cid, couple: false, ideal: MAX_R * 2.4 });
          }
        }

        const idxById = {};
        nodes.forEach((n, i) => { idxById[n.id] = i; });

        stateRef.current = { nodes, edges, idxById, running: true, animId: null };
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // ── animation loop ────────────────────────────────────────────────────────────

  const selectedRef = useRef(null);
  const hoveredRef  = useRef(null);
  selectedRef.current = selected;
  hoveredRef.current  = hovered;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    let animId;
    const loop = () => {
      const s = stateRef.current;
      if (!s.running) return;
      tick(s.nodes, s.edges, canvas.width, canvas.height);
      draw(ctx, s.nodes, s.edges, s.idxById, selectedRef.current, hoveredRef.current);
      animId = requestAnimationFrame(loop);
    };

    // Wait until data is loaded
    const startWhenReady = setInterval(() => {
      if (stateRef.current.nodes.length > 0) {
        clearInterval(startWhenReady);
        loop();
      }
    }, 100);

    return () => {
      clearInterval(startWhenReady);
      cancelAnimationFrame(animId);
      stateRef.current.running = false;
    };
  }, []);

  // ── canvas resize ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    });
    ro.observe(canvas);
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    return () => ro.disconnect();
  }, []);

  // ── mouse interaction ─────────────────────────────────────────────────────────

  const nodeAtPos = useCallback((x, y) => {
    const { nodes } = stateRef.current;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const dx = x - n.x, dy = y - n.y;
      if (dx * dx + dy * dy <= n.r * n.r) return n;
    }
    return null;
  }, []);

  const getCanvasXY = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return [clientX - rect.left, clientY - rect.top];
  };

  const onMouseMove = useCallback((e) => {
    const [x, y] = getCanvasXY(e);
    if (dragRef.current) {
      dragRef.current.x = x;
      dragRef.current.y = y;
      dragRef.current.vx = 0;
      dragRef.current.vy = 0;
      return;
    }
    const n = nodeAtPos(x, y);
    setHovered(n ? n.id : null);
    canvasRef.current.style.cursor = n ? "pointer" : "default";
  }, [nodeAtPos]);

  const onMouseDown = useCallback((e) => {
    const [x, y] = getCanvasXY(e);
    const n = nodeAtPos(x, y);
    if (n) dragRef.current = n;
  }, [nodeAtPos]);

  const onMouseUp = useCallback((e) => {
    const [x, y] = getCanvasXY(e);
    const n = nodeAtPos(x, y);
    if (n && dragRef.current === n) {
      setSelected(s => s === n.id ? null : n.id);
    }
    dragRef.current = null;
  }, [nodeAtPos]);

  const selectedPerson = stateRef.current.nodes.find(n => n.id === selected) || null;

  // ── filter/search overlay ─────────────────────────────────────────────────────

  const filtered = search.trim().toLowerCase();
  useEffect(() => {
    // Dim non-matching nodes by adjusting their render opacity
    // We do this by marking them on the node objects
    const { nodes } = stateRef.current;
    for (const n of nodes) {
      n._dim = filtered
        ? !`${n.name_given} ${n.name_surname}`.toLowerCase().includes(filtered)
        : false;
    }
  }, [filtered]);

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden", flexDirection: "column" }}>
      {/* Toolbar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "8px 16px",
        borderBottom: "0.5px solid var(--color-border-tertiary)",
        background: "var(--color-background-secondary)",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Family bubble board</span>
        <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
          Bubble size = photo count · click to inspect · drag to rearrange
        </span>
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter by name…"
          style={{ marginLeft: "auto", width: 180, fontSize: 12 }}
        />
        {/* Legend */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {[["M","Male"],["F","Female"],["U","Unknown"]].map(([g, label]) => (
            <span key={g} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--color-text-secondary)" }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: GENDER_COLOR[g]?.fill, display: "inline-block" }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
        {loading && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "var(--color-background-primary)",
            zIndex: 10, fontSize: 13, color: "var(--color-text-tertiary)",
            flexDirection: "column", gap: 12,
          }}>
            <div style={{
              width: 28, height: 28,
              border: "2.5px solid var(--color-border-secondary)",
              borderTopColor: "var(--color-accent)",
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

        {selected && (
          <PersonPanel
            person={selectedPerson}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  );
}
