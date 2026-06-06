/**
 * FamilyRoot — FacesTab.jsx
 *
 * Browse unassigned face clusters from the AI.
 * For each cluster: see sample crops, face count, then search for or create
 * a person to assign the whole cluster to.
 */

import { useState, useEffect, useCallback } from "react";

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

// ── face crop image ───────────────────────────────────────────────────────────

function FaceCrop({ thumbUrl, bbox, size = 72 }) {
  if (!thumbUrl || !bbox) {
    return (
      <div style={{
        width: size, height: size, borderRadius: size * 0.2,
        background: "var(--bg-sel)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.4, flexShrink: 0,
      }}>👤</div>
    );
  }

  // We render the full thumbnail scaled + clipped to the face bbox
  const [x1, y1, x2, y2] = bbox;
  const fw = x2 - x1;
  const fh = y2 - y1;
  // We don't know natural image dims at this point, so show whole thumb in a circle
  // (proper crop would need naturalWidth/naturalHeight from the API or img onLoad)
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      overflow: "hidden", flexShrink: 0, border: "2px solid var(--border)",
      background: "var(--bg-sel)",
    }}>
      <img
        src={thumbUrl}
        alt="face"
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </div>
  );
}

// ── person search / picker ────────────────────────────────────────────────────

function PersonPicker({ onSelect, onCreateNew }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query || query.length < 2) { setResults([]); return; }
    setLoading(true);
    // We use the persons list endpoint (search by surname contains)
    fetch(`${API}/api/persons/?q=${encodeURIComponent(query)}&per_page=10`)
      .then(r => r.ok ? r.json() : { persons: [] })
      .then(d => { setResults(d.persons || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [query]);

  return (
    <div>
      <div style={{ position: "relative", marginBottom: 8 }}>
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name…"
          style={{ width: "100%", fontSize: 12 }}
          autoFocus
        />
        {loading && (
          <div style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)" }}>
            <Spinner />
          </div>
        )}
      </div>

      {results.length > 0 && (
        <div style={{
          border: "0.5px solid var(--border)",
          borderRadius: 8, overflow: "hidden", marginBottom: 8,
        }}>
          {results.map(p => (
            <div
              key={p.id}
              onClick={() => onSelect(p)}
              style={{
                padding: "8px 12px", cursor: "pointer", fontSize: 13,
                borderBottom: "0.5px solid var(--border)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--bg-card)"}
              onMouseLeave={e => e.currentTarget.style.background = ""}
            >
              <span>{p.name_given} {p.name_surname}</span>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                {p.birth_year || ""}
              </span>
            </div>
          ))}
        </div>
      )}

      {query.length >= 2 && results.length === 0 && !loading && (
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>
          No matches found.
        </div>
      )}

      {query.length >= 2 && (
        <button
          onClick={() => onCreateNew(query)}
          style={{ fontSize: 12, width: "100%" }}
        >
          + Create new person "{query}"
        </button>
      )}
    </div>
  );
}

// ── single cluster card ───────────────────────────────────────────────────────

function ClusterCard({ cluster, onAssigned }) {
  const [expanded, setExpanded] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  const assign = async (personId) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/faces/clusters/${cluster.cluster_id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ person_id: personId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setDone(true);
      setTimeout(() => onAssigned?.(), 800);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  const createAndAssign = async (name) => {
    setSaving(true);
    setError(null);
    const parts = name.trim().split(/\s+/);
    const given   = parts.slice(0, -1).join(" ") || parts[0];
    const surname = parts.length > 1 ? parts[parts.length - 1] : "";
    try {
      const res = await fetch(`${API}/api/persons/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name_given: given, name_surname: surname }),
      });
      const person = await res.json();
      if (!res.ok) throw new Error(person.error || "Failed to create person");
      await assign(person.id);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div style={{
        border: "0.5px solid var(--accent)",
        borderRadius: 10, padding: 14, background: "rgba(29,158,117,0.18)",
        display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#0F6E56",
      }}>
        ✓ Assigned successfully
      </div>
    );
  }

  return (
    <div style={{
      border: "0.5px solid var(--border)",
      borderRadius: 10, overflow: "hidden",
      background: "var(--bg-app)",
    }}>
      {/* Card header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 14px", cursor: "pointer",
        }}
      >
        <FaceCrop
          thumbUrl={cluster.sample_thumb_url}
          bbox={cluster.sample_bbox}
          size={52}
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 3 }}>
            Unknown person #{cluster.cluster_id}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {cluster.face_count} face{cluster.face_count !== 1 ? "s" : ""} across{" "}
            {cluster.photo_count} photo{cluster.photo_count !== 1 ? "s" : ""}
            {cluster.avg_confidence && (
              <span style={{ color: "var(--text-tertiary)" }}>
                {" "}· {Math.round(cluster.avg_confidence * 100)}% confidence
              </span>
            )}
          </div>
        </div>
        <div style={{ fontSize: 18, color: "var(--text-tertiary)", userSelect: "none" }}>
          {expanded ? "▲" : "▼"}
        </div>
      </div>

      {/* Expanded: assign UI */}
      {expanded && (
        <div style={{
          padding: "0 14px 14px",
          borderTop: "0.5px solid var(--border)",
        }}>
          {!assigning ? (
            <div style={{ paddingTop: 12 }}>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 10 }}>
                All {cluster.face_count} faces in this cluster will be tagged with the person you choose.
              </p>
              <button
                className="primary"
                onClick={() => setAssigning(true)}
                disabled={saving}
              >
                Name this person
              </button>
            </div>
          ) : (
            <div style={{ paddingTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>
                Who is this person?
              </div>
              <PersonPicker
                onSelect={p => assign(p.id)}
                onCreateNew={name => createAndAssign(name)}
              />
              {error && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#993C1D" }}>
                  Error: {error}
                </div>
              )}
              <button
                onClick={() => setAssigning(false)}
                style={{ marginTop: 8, fontSize: 12 }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function FacesTab() {
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [reclustering, setReclustering] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API}/api/faces/clusters`)
      .then(r => r.json())
      .then(d => { setClusters(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const recluster = async () => {
    setReclustering(true);
    try {
      await fetch(`${API}/api/photos/recluster`, { method: "POST" });
      load();
    } finally {
      setReclustering(false);
    }
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        padding: "12px 20px", borderBottom: "0.5px solid var(--border)",
        background: "var(--bg-card)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 500 }}>Unknown face clusters</span>
          {!loading && (
            <span style={{ fontSize: 12, color: "var(--text-tertiary)", marginLeft: 10 }}>
              {clusters.length} cluster{clusters.length !== 1 ? "s" : ""} to name
            </span>
          )}
        </div>
        <button onClick={recluster} disabled={reclustering} style={{ fontSize: 12 }}>
          {reclustering ? "Re-clustering…" : "Re-cluster faces"}
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 60 }}>
            <Spinner />
          </div>
        )}

        {!loading && clusters.length === 0 && (
          <div style={{ textAlign: "center", marginTop: 80, color: "var(--text-tertiary)" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>👥</div>
            <div style={{ fontSize: 14, marginBottom: 6 }}>All faces are named!</div>
            <div style={{ fontSize: 12 }}>
              Import more photos and click "Re-cluster faces" to find new unknown people.
            </div>
          </div>
        )}

        {!loading && clusters.length > 0 && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 12, maxWidth: 1100,
          }}>
            {clusters.map(c => (
              <ClusterCard
                key={c.cluster_id}
                cluster={c}
                onAssigned={load}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
