import { useState, useEffect } from "react";
import PeopleTab   from "./pages/PeopleTab.jsx";
import PhotosTab   from "./pages/PhotosTab.jsx";
import FacesTab    from "./pages/FacesTab.jsx";
import TimelineTab from "./pages/TimelineTab.jsx";
import BubbleTab   from "./pages/BubbleTab.jsx";
import MapTab      from "./pages/MapTab.jsx";
import TreeTab     from "./pages/TreeTab.jsx";
import GrampsTab   from "./pages/GrampsTab.jsx";
import AdminTab    from "./pages/AdminTab.jsx";

const API = "";

// ── nav structure ─────────────────────────────────────────────────────────────

const NAV = [
  {
    section: "PEOPLE",
    items: [
      { id: "people",    label: "All people",     icon: "👥" },
      { id: "tree",      label: "Family tree",    icon: "🌳" },
      { id: "bubbles",   label: "Relationships",  icon: "🫧" },
    ],
  },
  {
    section: "RECORDS",
    items: [
      { id: "timeline",  label: "Timeline",       icon: "📅" },
      { id: "map",       label: "Places",         icon: "🗺"  },
      { id: "photos",    label: "Photos & media", icon: "🖼"  },
      { id: "faces",     label: "Faces",          icon: "🫣"  },
    ],
  },
  {
    section: "DATA",
    items: [
      { id: "gramps",    label: "Import", icon: "📥" },
      { id: "admin",     label: "Manage files",    icon: "🗂"  },
    ],
  },
];

// ── sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({ active, onNav, dbName }) {
  return (
    <aside style={{
      width: "var(--sidebar-w)", flexShrink: 0,
      background: "var(--bg-sidebar)",
      borderRight: "1px solid var(--border)",
      display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* App identity */}
      <div style={{ padding: "20px 20px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 22 }}>🌳</span>
          <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.02em" }}>FamilyRoot</span>
        </div>
        {dbName && (
          <div style={{ fontSize: 11, color: "var(--text-secondary)", paddingLeft: 32 }}>
            {dbName}
          </div>
        )}
      </div>

      {/* Nav sections */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "4px 10px" }}>
        {NAV.map(group => (
          <div key={group.section} style={{ marginBottom: 20 }}>
            <div style={{
              fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
              color: "var(--text-tertiary)", textTransform: "uppercase",
              padding: "0 10px", marginBottom: 4,
            }}>
              {group.section}
            </div>
            {group.items.map(item => (
              <NavItem
                key={item.id}
                item={item}
                active={active === item.id}
                onClick={() => onNav(item.id)}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* Settings */}
      <div style={{ padding: "12px 10px", borderTop: "1px solid var(--border)" }}>
        <NavItem
          item={{ id: "settings", label: "Settings", icon: "⚙️" }}
          active={active === "settings"}
          onClick={() => onNav("settings")}
        />
      </div>
    </aside>
  );
}

function NavItem({ item, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        width: "100%", textAlign: "left",
        background: active ? "var(--bg-sel)" : "none",
        border: "none",
        borderRadius: 8,
        padding: "8px 10px",
        fontSize: 13,
        fontWeight: active ? 500 : 400,
        color: active ? "var(--text-primary)" : "var(--text-secondary)",
        cursor: "pointer",
        transition: "background 0.1s, color 0.1s",
        marginBottom: 2,
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--bg-card)"; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = "none"; }}
    >
      <span style={{ fontSize: 15, width: 20, textAlign: "center", flexShrink: 0 }}>
        {item.icon}
      </span>
      {item.label}
    </button>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [page,   setPage]   = useState("people");
  const [dbName, setDbName] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/health`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setDbName("Family database"))
      .catch(() => {});
  }, []);

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <Sidebar active={page} onNav={setPage} dbName={dbName} />

      <main style={{ flex: 1, display: "flex", overflow: "hidden", background: "var(--bg-app)" }}>
        {page === "people"    && <PeopleTab   onNav={setPage} />}
        {page === "tree"      && <TreeTab     />}
        {page === "bubbles"   && <BubbleTab   />}
        {page === "timeline"  && <TimelineTab />}
        {page === "map"       && <MapTab      />}
        {page === "photos"    && <PhotosTab   />}
        {page === "faces"     && <FacesTab    />}
        {page === "gramps"    && <GrampsTab   />}
        {page === "admin"     && <AdminTab    />}
        {page === "settings"  && <SettingsPage />}
      </main>
    </div>
  );
}

function SettingsPage() {
  return (
    <div style={{ padding: 40, color: "var(--text-secondary)", fontSize: 14 }}>
      Settings coming soon.
    </div>
  );
}
