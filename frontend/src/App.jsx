import { useState, useEffect } from "react";
import PhotosTab   from "./pages/PhotosTab.jsx";
import FacesTab    from "./pages/FacesTab.jsx";
import TimelineTab from "./pages/TimelineTab.jsx";
import GrampsTab   from "./pages/GrampsTab.jsx";
import AdminTab    from "./pages/AdminTab.jsx";

const TABS = [
  { id: "photos",   label: "Photos"   },
  { id: "faces",    label: "Faces"    },
  { id: "timeline", label: "Timeline" },
  { id: "gramps",   label: "Gramps"   },
  { id: "admin",    label: "Admin"    },
];

const API = "http://localhost:5050";

export default function App() {
  const [tab, setTab]     = useState("photos");
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/photos/stats`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setStats(d))
      .catch(() => {});
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      {/* Top bar */}
      <header style={{
        display: "flex", alignItems: "center", gap: 0,
        borderBottom: "0.5px solid var(--color-border-tertiary)",
        background: "var(--color-background-secondary)",
        height: 44, flexShrink: 0, paddingLeft: 16,
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 24 }}>
          <span style={{ fontSize: 18 }}>🌳</span>
          <span style={{ fontWeight: 600, fontSize: 14, letterSpacing: "-0.01em" }}>FamilyRoot</span>
        </div>

        {/* Tabs */}
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              background: "none",
              border: "none",
              borderRadius: 0,
              padding: "0 14px",
              height: 44,
              fontSize: 13,
              fontWeight: tab === t.id ? 500 : 400,
              color: tab === t.id ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              borderBottom: tab === t.id ? "1.5px solid var(--color-accent)" : "1.5px solid transparent",
              cursor: "pointer",
              transition: "color 0.12s",
            }}
          >
            {t.label}
          </button>
        ))}

        {/* Stats pill */}
        {stats && (
          <div style={{
            marginLeft: "auto", marginRight: 16,
            fontSize: 11, color: "var(--color-text-tertiary)",
            display: "flex", gap: 12,
          }}>
            <span>{stats.total_photos.toLocaleString()} photos</span>
            {stats.earliest_year && stats.latest_year && (
              <span>{stats.earliest_year}–{stats.latest_year}</span>
            )}
          </div>
        )}
      </header>

      {/* Tab content */}
      <main style={{ flex: 1, overflow: "hidden", display: "flex" }}>
        {tab === "photos"   && <PhotosTab />}
        {tab === "faces"    && <FacesTab />}
        {tab === "timeline" && <TimelineTab />}
        {tab === "gramps"   && <GrampsTab />}
        {tab === "admin"    && <AdminTab />}
      </main>
    </div>
  );
}
