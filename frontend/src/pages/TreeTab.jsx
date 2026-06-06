/**
 * FamilyRoot — TreeTab.jsx
 *
 * Three views toggled by a top bar:
 *   Fan     — concentric arc fan chart (ancestors, 4 gens)
 *   Pedigree — horizontal ancestor chart (left=root, right=oldest)
 *   Descendants — vertical tree (root at top, children below)
 *
 * All views share the same root person picker in the header.
 */

import { useState, useEffect, useRef, useCallback } from "react";

const API = "";

// ── colour helpers ────────────────────────────────────────────────────────────

const GENDER_COLOR = { M: "#5B9BD5", F: "#C97BB0", U: "#7A7A7A", N: "#7A9E7E" };

function nameInitials(name = "") {
  return name.split(" ").filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
}

// ── tiny shared components ─────────────────────────────────────────────────

function PersonBox({ node, onClick, style, compact }) {
  if (!node) {
    return (
      <div style={{
        width: compact ? 120 : 150, minHeight: compact ? 44 : 60,
        borderRadius: 8, border: "1px dashed var(--border)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "var(--text-tertiary)", fontSize: 11,
        ...style,
      }}>
        Unknown
      </div>
    );
  }
  const gc = GENDER_COLOR[node.gender] || GENDER_COLOR.U;
  const years = node.birth_year
    ? `${node.birth_year}–${node.death_year || (node.is_living ? "living" : "")}`
    : "";
  return (
    <div
      onClick={() => onClick && onClick(node)}
      style={{
        width: compact ? 120 : 150,
        background: "var(--bg-card)",
        border: `1px solid var(--border-card)`,
        borderLeft: `3px solid ${gc}`,
        borderRadius: 8,
        padding: compact ? "6px 8px" : "8px 10px",
        cursor: onClick ? "pointer" : "default",
        transition: "background 0.1s, transform 0.1s",
        userSelect: "none",
        ...style,
      }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.background = "var(--bg-card-hov)"; e.currentTarget.style.transform = "scale(1.02)"; } }}
      onMouseLeave={e => { e.currentTarget.style.background = "var(--bg-card)"; e.currentTarget.style.transform = "scale(1)"; }}
    >
      {node.thumb ? (
        <img src={node.thumb} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", float: "right", marginLeft: 6 }} />
      ) : (
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: gc, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", float: "right", marginLeft: 6, opacity: 0.8 }}>
          {nameInitials(node.name)}
        </div>
      )}
      <div style={{ fontSize: compact ? 11 : 12, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {node.given || node.name}
      </div>
      {node.surname && (
        <div style={{ fontSize: compact ? 10 : 11, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {node.surname}
        </div>
      )}
      {years && (
        <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2 }}>
          {years}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FAN CHART (canvas)
// ═══════════════════════════════════════════════════════════════════════════

const FAN_RING_H = 72;         // radial height per generation ring
const FAN_CENTER_R = 60;       // inner circle radius
const FAN_START_GEN = 1;       // first ring after centre
const FAN_GENS = 4;

function FanChart({ rootId, onSelectPerson }) {
  const canvasRef = useRef(null);
  const [tree, setTree]   = useState(null);
  const [hover, setHover] = useState(null); // { node }
  const segmentsRef = useRef([]); // [{node, startAngle, endAngle, innerR, outerR}]

  useEffect(() => {
    if (!rootId) return;
    fetch(`${API}/api/tree/ancestors/${rootId}?generations=${FAN_GENS}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setTree(d))
      .catch(() => {});
  }, [rootId]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !tree) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2 + 40;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#111111";
    ctx.fillRect(0, 0, W, H);

    const segs = [];

    // draw one arc segment
    function drawSeg(node, startAngle, endAngle, innerR, outerR, gen) {
      if (!node) {
        // empty slot
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, startAngle, endAngle);
        ctx.arc(cx, cy, innerR, endAngle, startAngle, true);
        ctx.closePath();
        ctx.fillStyle = "#1A1A1A";
        ctx.fill();
        ctx.strokeStyle = "#2A2A2A";
        ctx.lineWidth = 1;
        ctx.stroke();
        return;
      }

      const gc = GENDER_COLOR[node.gender] || GENDER_COLOR.U;
      const isHovered = hover?.id === node.id;

      ctx.beginPath();
      ctx.arc(cx, cy, outerR, startAngle, endAngle);
      ctx.arc(cx, cy, innerR, endAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = isHovered ? "#2A2A2A" : "#1C1C1C";
      ctx.fill();
      ctx.strokeStyle = isHovered ? gc : "#333";
      ctx.lineWidth = isHovered ? 2 : 1;
      ctx.stroke();

      // coloured inner arc edge
      ctx.beginPath();
      ctx.arc(cx, cy, innerR + 2, startAngle, endAngle);
      ctx.strokeStyle = gc;
      ctx.lineWidth = 3;
      ctx.stroke();

      // text
      const midAngle = (startAngle + endAngle) / 2;
      const midR = (innerR + outerR) / 2;
      const tx = cx + Math.cos(midAngle) * midR;
      const ty = cy + Math.sin(midAngle) * midR;
      const arcWidth = (endAngle - startAngle) * midR;

      ctx.save();
      ctx.translate(tx, ty);
      const textAngle = midAngle + Math.PI / 2;
      ctx.rotate(textAngle);

      const maxW = Math.max(arcWidth - 8, 20);
      const nameStr = gen >= 3 ? (node.given || node.name || "?").split(" ")[0] : (node.name || "?");
      ctx.fillStyle = "#E0E0E0";
      ctx.font = `${gen >= 3 ? 9 : 11}px -apple-system, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // clip long names
      let display = nameStr;
      while (ctx.measureText(display).width > maxW && display.length > 3) {
        display = display.slice(0, -1);
      }
      if (display !== nameStr) display += "…";
      ctx.fillText(display, 0, 0);

      if (gen <= 3 && node.birth_year) {
        ctx.fillStyle = "#888";
        ctx.font = "9px -apple-system, sans-serif";
        ctx.fillText(node.birth_year, 0, 12);
      }
      ctx.restore();

      segs.push({ node, startAngle, endAngle, innerR, outerR });
    }

    // recursively place nodes
    function placeNode(node, startAngle, endAngle, gen) {
      if (gen > FAN_GENS) return;
      const innerR = FAN_CENTER_R + (gen - 1) * FAN_RING_H;
      const outerR = innerR + FAN_RING_H - 4;
      drawSeg(node, startAngle, endAngle, innerR, outerR, gen);
      if (node) {
        const midA = (startAngle + endAngle) / 2;
        placeNode(node.father, startAngle, midA, gen + 1);
        placeNode(node.mother, midA, endAngle, gen + 1);
      }
    }

    // root person centre circle
    const gc0 = GENDER_COLOR[tree.gender] || GENDER_COLOR.U;
    ctx.beginPath();
    ctx.arc(cx, cy, FAN_CENTER_R - 4, 0, Math.PI * 2);
    ctx.fillStyle = "#1C1C1C";
    ctx.fill();
    ctx.strokeStyle = gc0;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = "#F0F0F0";
    ctx.font = "bold 13px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(tree.given || tree.name || "?", cx, cy - 7);
    ctx.fillStyle = "#888";
    ctx.font = "10px -apple-system, sans-serif";
    ctx.fillText(tree.birth_year || "", cx, cy + 8);

    // father = left semicircle (Math.PI → 2π), mother = right (0 → π)
    // Actually let's use top half for father (−π/2 → π/2) and bottom for mother
    // Convention: left=paternal, right=maternal (standard fan chart)
    placeNode(tree.father, Math.PI, Math.PI * 2);
    placeNode(tree.mother, 0, Math.PI);

    segmentsRef.current = segs;
  }, [tree, hover]);

  useEffect(() => { draw(); }, [draw]);

  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    canvas.width  = parent.clientWidth;
    canvas.height = parent.clientHeight;
    draw();
  }, [draw]);

  useEffect(() => {
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [handleResize]);

  const getHitNode = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2 + 40;
    const dx = mx - cx, dy = my - cy;
    const r = Math.sqrt(dx * dx + dy * dy);
    let angle = Math.atan2(dy, dx);
    if (angle < 0) angle += Math.PI * 2;

    // centre circle
    if (r < FAN_CENTER_R - 4) return tree;

    for (const seg of segmentsRef.current) {
      if (r >= seg.innerR && r <= seg.outerR) {
        let sa = seg.startAngle, ea = seg.endAngle;
        if (sa < 0) sa += Math.PI * 2;
        if (ea < 0) ea += Math.PI * 2;
        let inArc = false;
        if (sa <= ea) {
          inArc = angle >= sa && angle <= ea;
        } else {
          inArc = angle >= sa || angle <= ea;
        }
        if (inArc) return seg.node;
      }
    }
    return null;
  }, [tree]);

  const handleMouseMove = useCallback((e) => {
    const node = getHitNode(e);
    setHover(node || null);
  }, [getHitNode]);

  const handleClick = useCallback((e) => {
    const node = getHitNode(e);
    if (node && onSelectPerson) onSelectPerson(node);
  }, [getHitNode, onSelectPerson]);

  return (
    <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
      <canvas
        ref={canvasRef}
        style={{ display: "block", cursor: hover ? "pointer" : "default" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
        onClick={handleClick}
      />
      {hover && (
        <div style={{
          position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
          background: "var(--bg-card)", border: "1px solid var(--border-card)",
          borderRadius: 8, padding: "8px 14px", fontSize: 12,
          pointerEvents: "none",
          color: "var(--text-primary)",
        }}>
          <strong>{hover.name}</strong>
          {hover.birth_year && <span style={{ color: "var(--text-tertiary)", marginLeft: 8 }}>b. {hover.birth_year}</span>}
          {hover.death_year && <span style={{ color: "var(--text-tertiary)", marginLeft: 8 }}>d. {hover.death_year}</span>}
          <span style={{ marginLeft: 12, color: "var(--accent)", fontSize: 11 }}>Click to recentre</span>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HORIZONTAL PEDIGREE (ancestor tree — root left, oldest right)
// ═══════════════════════════════════════════════════════════════════════════

const H_BOX_W    = 150;
const H_BOX_H    = 72;
const H_COL_GAP  = 60;
const H_ROW_GAP  = 12;

function countLeaves(node, maxGen, gen = 0) {
  if (!node || gen >= maxGen) return 1;
  const fl = countLeaves(node.father, maxGen, gen + 1);
  const ml = countLeaves(node.mother, maxGen, gen + 1);
  return fl + ml;
}

function PedigreeTree({ rootId, onSelectPerson }) {
  const [tree, setTree] = useState(null);
  const GENS = 4;

  useEffect(() => {
    if (!rootId) return;
    fetch(`${API}/api/tree/ancestors/${rootId}?generations=${GENS}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setTree(d))
      .catch(() => {});
  }, [rootId]);

  if (!tree) return <div style={{ padding: 40, color: "var(--text-tertiary)" }}>Loading…</div>;

  // Lay out nodes on a grid: col=generation, row=position
  // We compute y positions by leaf-counting.
  const nodes = [];   // {node, col, y (centre)}
  const edges = [];   // {x1,y1,x2,y2}
  const colW = H_BOX_W + H_COL_GAP;

  let totalHeight = 0;

  function layout(node, col, yOffset, availH) {
    const cy = yOffset + availH / 2;
    nodes.push({ node, col, cy });

    if (node && col < GENS) {
      const fLeaves = countLeaves(node?.father, GENS, col + 1);
      const mLeaves = countLeaves(node?.mother, GENS, col + 1);
      const totalLeaves = fLeaves + mLeaves;
      const fH = (fLeaves / totalLeaves) * availH;
      const mH = (mLeaves / totalLeaves) * availH;

      const fIdx = nodes.length;
      layout(node?.father, col + 1, yOffset,      fH);
      const mIdx = nodes.length;
      layout(node?.mother, col + 1, yOffset + fH, mH);

      if (node?.father || node?.mother) {
        edges.push({
          fromCol: col, fromCy: cy,
          toColF: col + 1, toCyF: nodes[fIdx]?.cy,
          toCyM: nodes[mIdx]?.cy,
        });
      }
    }

    totalHeight = Math.max(totalHeight, yOffset + availH);
  }

  const totalLeaves = countLeaves(tree, GENS);
  const treeH = Math.max(totalLeaves * (H_BOX_H + H_ROW_GAP), 200);
  layout(tree, 0, 0, treeH);

  const svgW = (GENS + 1) * colW + H_BOX_W;
  const svgH = treeH;

  return (
    <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
      <svg width={svgW} height={svgH} style={{ overflow: "visible" }}>
        {/* connector lines */}
        {edges.map((e, i) => {
          const x1 = e.fromCol * colW + H_BOX_W;
          const y1 = e.fromCy;
          const x2 = (e.fromCol + 1) * colW;
          const mx = (x1 + x2) / 2;
          return (
            <g key={i}>
              {e.toCyF != null && (
                <path
                  d={`M${x1},${y1} C${mx},${y1} ${mx},${e.toCyF} ${x2},${e.toCyF}`}
                  fill="none" stroke="#333" strokeWidth={1.5}
                />
              )}
              {e.toCyM != null && (
                <path
                  d={`M${x1},${y1} C${mx},${y1} ${mx},${e.toCyM} ${x2},${e.toCyM}`}
                  fill="none" stroke="#333" strokeWidth={1.5}
                />
              )}
            </g>
          );
        })}

        {/* person boxes as foreignObject */}
        {nodes.map(({ node, col, cy }, i) => (
          <foreignObject
            key={i}
            x={col * colW}
            y={cy - H_BOX_H / 2}
            width={H_BOX_W}
            height={H_BOX_H}
          >
            <div xmlns="http://www.w3.org/1999/xhtml">
              <PersonBox
                node={node}
                onClick={node ? onSelectPerson : null}
                compact
                style={{ width: H_BOX_W, minHeight: H_BOX_H }}
              />
            </div>
          </foreignObject>
        ))}
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DESCENDANTS TREE (root top, children below)
// ═══════════════════════════════════════════════════════════════════════════

const D_BOX_W   = 150;
const D_BOX_H   = 72;
const D_COL_GAP = 30;   // horizontal gap between siblings
const D_ROW_GAP = 60;   // vertical gap between generations

function DescTree({ rootId, onSelectPerson }) {
  const [tree, setTree] = useState(null);
  const GENS = 3;

  useEffect(() => {
    if (!rootId) return;
    fetch(`${API}/api/tree/descendants/${rootId}?generations=${GENS}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setTree(d))
      .catch(() => {});
  }, [rootId]);

  if (!tree) return <div style={{ padding: 40, color: "var(--text-tertiary)" }}>Loading…</div>;

  // Build list of {node, x, y} and edges
  const placed = [];
  const edges  = [];
  let svgW = 0, svgH = 0;

  function countDesc(node) {
    if (!node) return 1;
    const kids = node.families?.flatMap(f => f.children) || [];
    if (kids.length === 0) return 1;
    return kids.reduce((s, c) => s + countDesc(c), 0);
  }

  function layoutDesc(node, xOffset, availW, gen) {
    if (!node) return;
    const cx = xOffset + availW / 2;
    const cy = gen * (D_BOX_H + D_ROW_GAP);
    placed.push({ node, cx, cy });
    svgW = Math.max(svgW, cx + D_BOX_W / 2 + 10);
    svgH = Math.max(svgH, cy + D_BOX_H + 10);

    const allKids = node.families?.flatMap(f => f.children).filter(Boolean) || [];
    if (allKids.length === 0) return;

    const totalLeaves = allKids.reduce((s, c) => s + countDesc(c), 0);
    let x = xOffset;
    const parentIdx = placed.length - 1;

    allKids.forEach(kid => {
      const kidLeaves = countDesc(kid);
      const kidW = (kidLeaves / totalLeaves) * availW;
      const kidCx = x + kidW / 2;
      const kidCy = (gen + 1) * (D_BOX_H + D_ROW_GAP);
      edges.push({ px: cx, py: cy + D_BOX_H, kx: kidCx, ky: kidCy });
      layoutDesc(kid, x, kidW, gen + 1);
      x += kidW;
    });
  }

  const totalLeaves = countDesc(tree);
  const totalW = Math.max(totalLeaves * (D_BOX_W + D_COL_GAP), D_BOX_W + 40);
  layoutDesc(tree, 0, totalW, 0);

  return (
    <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
      <svg width={Math.max(svgW, totalW)} height={svgH + 20} style={{ overflow: "visible" }}>
        {edges.map((e, i) => {
          const my = (e.py + e.ky) / 2;
          return (
            <path key={i}
              d={`M${e.px},${e.py} C${e.px},${my} ${e.kx},${my} ${e.kx},${e.ky}`}
              fill="none" stroke="#333" strokeWidth={1.5}
            />
          );
        })}
        {placed.map(({ node, cx, cy }, i) => (
          <foreignObject
            key={i}
            x={cx - D_BOX_W / 2}
            y={cy}
            width={D_BOX_W}
            height={D_BOX_H}
          >
            <div xmlns="http://www.w3.org/1999/xhtml">
              <PersonBox
                node={node}
                onClick={onSelectPerson}
                compact
                style={{ width: D_BOX_W, minHeight: D_BOX_H }}
              />
            </div>
          </foreignObject>
        ))}
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ROOT PERSON PICKER
// ═══════════════════════════════════════════════════════════════════════════

function PersonPicker({ value, onChange }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!q) { setResults([]); return; }
    const t = setTimeout(() => {
      fetch(`${API}/api/persons/?q=${encodeURIComponent(q)}&per_page=10`)
        .then(r => r.json())
        .then(d => setResults(d.persons || []))
        .catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative", width: 260 }}>
      <input
        type="search"
        value={value ? `${value.given || ""} ${value.surname || ""}`.trim() : q}
        onChange={e => { setQ(e.target.value); setOpen(true); if (value) onChange(null); }}
        onFocus={() => setOpen(true)}
        placeholder="Search for a person…"
        style={{ width: "100%", fontSize: 13 }}
      />
      {open && results.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
          background: "var(--bg-card)", border: "1px solid var(--border-card)",
          borderRadius: 8, marginTop: 4, overflow: "hidden",
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}>
          {results.map(p => (
            <div key={p.id}
              onMouseDown={() => { onChange(p); setQ(""); setOpen(false); }}
              style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13,
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

// ═══════════════════════════════════════════════════════════════════════════
// RELATIONSHIP FINDER PANEL
// ═══════════════════════════════════════════════════════════════════════════

function RelationshipPanel() {
  const [personA, setPersonA] = useState(null);
  const [personB, setPersonB] = useState(null);
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const findRelationship = () => {
    if (!personA || !personB) return;
    setLoading(true);
    setError(null);
    setResult(null);
    fetch(`${API}/api/tree/relationship?a=${personA.id}&b=${personB.id}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(d => { setResult(d); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  };

  return (
    <div style={{
      margin: "16px 20px",
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      padding: "16px 20px",
      flexShrink: 0,
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
        Relationship Finder
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>Person A</div>
          <PersonPicker value={personA} onChange={setPersonA} />
        </div>
        <div style={{ color: "var(--text-tertiary)", marginTop: 16 }}>↔</div>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>Person B</div>
          <PersonPicker value={personB} onChange={setPersonB} />
        </div>
        <button
          onClick={findRelationship}
          disabled={!personA || !personB || loading}
          style={{
            marginTop: 16,
            background: "var(--accent, #1D9E75)",
            border: "none",
            borderRadius: 8,
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 500,
            color: "#fff",
            cursor: (!personA || !personB || loading) ? "default" : "pointer",
            opacity: (!personA || !personB) ? 0.5 : 1,
          }}
        >
          {loading ? "Searching…" : "Find relationship"}
        </button>
      </div>

      {error && (
        <div style={{ marginTop: 12, color: "#E06C75", fontSize: 13 }}>Error: {error}</div>
      )}

      {result && (
        <div style={{ marginTop: 16 }}>
          {result.relationship === "not related" ? (
            <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>
              These two people appear to be <strong style={{ color: "var(--text-primary)" }}>not related</strong> in the database.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--accent, #1D9E75)", marginBottom: 8 }}>
                {result.relationship}
              </div>

              {result.path && result.path.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
                  {result.path.map((step, i) => (
                    step === "→" ? (
                      <span key={i} style={{ color: "var(--text-tertiary)", fontSize: 14 }}>→</span>
                    ) : (
                      <span key={i} style={{
                        background: "var(--bg-sel)",
                        borderRadius: 6,
                        padding: "2px 8px",
                        fontSize: 13,
                        color: "var(--text-primary)",
                      }}>
                        {step}
                      </span>
                    )
                  ))}
                </div>
              )}

              {result.common_ancestors && result.common_ancestors.length > 0 && (
                <div>
                  <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                    Common ancestor{result.common_ancestors.length > 1 ? "s" : ""}:
                  </span>
                  {result.common_ancestors.map(ca => (
                    <span key={ca.id} style={{
                      marginLeft: 8,
                      fontSize: 13,
                      color: "var(--text-secondary)",
                      background: "var(--bg-sel)",
                      borderRadius: 6,
                      padding: "2px 8px",
                    }}>
                      {ca.name}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN TAB
// ═══════════════════════════════════════════════════════════════════════════

const VIEWS = [
  { id: "fan",         label: "Fan chart" },
  { id: "pedigree",    label: "Ancestors" },
  { id: "descendants", label: "Descendants" },
];

export default function TreeTab({ initialPersonId }) {
  const [view,        setView]       = useState("fan");
  const [rootPerson,  setRootPerson] = useState(null);

  // load first person if none selected
  useEffect(() => {
    if (rootPerson) return;
    fetch(`${API}/api/persons/?per_page=1`)
      .then(r => r.json())
      .then(d => { if (d.persons?.[0]) setRootPerson(d.persons[0]); })
      .catch(() => {});
  }, []);

  const handleSelectFromTree = (node) => {
    // convert brief node to a compatible person object
    setRootPerson({ id: node.id, name_given: node.given, name_surname: node.surname, birth_year: node.birth_year });
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", overflowY: "auto" }}>

      {/* toolbar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "12px 20px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-sidebar)",
        flexShrink: 0,
      }}>
        {/* view switcher */}
        <div style={{ display: "flex", background: "var(--bg-input)", borderRadius: 8, padding: 3, gap: 2 }}>
          {VIEWS.map(v => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              style={{
                background: view === v.id ? "var(--bg-sel)" : "none",
                border: "none",
                borderRadius: 6,
                padding: "5px 14px",
                fontSize: 12,
                fontWeight: view === v.id ? 500 : 400,
                color: view === v.id ? "var(--text-primary)" : "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* person picker */}
        <PersonPicker value={rootPerson} onChange={setRootPerson} />

        {rootPerson && (
          <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            Click any person in the chart to recentre
          </div>
        )}

        {/* print button — push to far right */}
        <div style={{ marginLeft: "auto" }}>
          <button
            onClick={() => window.print()}
            style={{
              background: "var(--bg-input)",
              border: "1px solid var(--border)",
              borderRadius: 7,
              padding: "5px 12px",
              fontSize: 12,
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            🖨 Print
          </button>
        </div>
      </div>

      {/* chart area */}
      {!rootPerson ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)", fontSize: 14 }}>
          Search for a person above to view their family tree.
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 400 }}>
            {view === "fan"         && <FanChart     rootId={rootPerson.id} onSelectPerson={handleSelectFromTree} />}
            {view === "pedigree"    && <PedigreeTree rootId={rootPerson.id} onSelectPerson={handleSelectFromTree} />}
            {view === "descendants" && <DescTree     rootId={rootPerson.id} onSelectPerson={handleSelectFromTree} />}
          </div>
          <RelationshipPanel />
        </div>
      )}
    </div>
  );
}
