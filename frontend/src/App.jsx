import { useState, useEffect } from "react";
import PeopleTab   from "./pages/PeopleTab.jsx";
import PhotosTab   from "./pages/PhotosTab.jsx";
import FacesTab    from "./pages/FacesTab.jsx";
import TimelineTab from "./pages/TimelineTab.jsx";
import BubbleTab   from "./pages/BubbleTab.jsx";
import MapTab      from "./pages/MapTab.jsx";
import TreeTab      from "./pages/TreeTab.jsx";
import GrampsTab    from "./pages/GrampsTab.jsx";
import AdminTab     from "./pages/AdminTab.jsx";
import PhotoPrismTab    from "./pages/PhotoPrismTab.jsx";
import GrampsEngineTab from "./pages/GrampsEngineTab.jsx";
import ToolsTab        from "./pages/ToolsTab.jsx";
import OllamaTab       from "./pages/OllamaTab.jsx";

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
      { id: "gramps",        label: "Import",         icon: "📥" },
      { id: "grampsengine", label: "Gramps Engine",  icon: "🌿"  },
      { id: "photoprism",  label: "PhotoPrism",     icon: "📷"  },
      { id: "ollama",      label: "Ollama AI",      icon: "🤖"  },
      { id: "tools",       label: "Tools",          icon: "🔧"  },
      { id: "admin",       label: "Manage files",   icon: "🗂"  },
    ],
  },
];

// Bottom tab bar items (mobile only — most important pages)
const BOTTOM_TABS = [
  { id: "people",   label: "People",   icon: "👥" },
  { id: "tree",     label: "Tree",     icon: "🌳" },
  { id: "timeline", label: "Timeline", icon: "📅" },
  { id: "photos",   label: "Photos",   icon: "🖼" },
  { id: "gramps",   label: "Import",   icon: "📥" },
];

// ── useWindowWidth hook ───────────────────────────────────────────────────────

function useWindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return width;
}

// ── sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({ active, onNav, dbName, collapsed }) {
  return (
    <aside style={{
      width: collapsed ? 60 : "var(--sidebar-w)",
      flexShrink: 0,
      background: "var(--bg-sidebar)",
      borderRight: "1px solid var(--border)",
      display: "flex", flexDirection: "column",
      overflow: "hidden",
      transition: "width 0.2s ease",
    }}>
      {/* App identity */}
      <div style={{ padding: collapsed ? "20px 0 16px" : "20px 20px 16px", display: "flex", justifyContent: collapsed ? "center" : "flex-start", alignItems: "center" }}>
        {collapsed ? (
          <span style={{ fontSize: 22 }}>🌳</span>
        ) : (
          <div>
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
        )}
      </div>

      {/* Nav sections */}
      <nav style={{ flex: 1, overflowY: "auto", padding: collapsed ? "4px 0" : "4px 10px" }}>
        {NAV.map(group => (
          <div key={group.section} style={{ marginBottom: collapsed ? 8 : 20 }}>
            {!collapsed && (
              <div style={{
                fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
                color: "var(--text-tertiary)", textTransform: "uppercase",
                padding: "0 10px", marginBottom: 4,
              }}>
                {group.section}
              </div>
            )}
            {group.items.map(item => (
              <NavItem
                key={item.id}
                item={item}
                active={active === item.id}
                onClick={() => onNav(item.id)}
                collapsed={collapsed}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* Settings */}
      <div style={{ padding: collapsed ? "12px 0" : "12px 10px", borderTop: "1px solid var(--border)" }}>
        <NavItem
          item={{ id: "settings", label: "Settings", icon: "⚙️" }}
          active={active === "settings"}
          onClick={() => onNav("settings")}
          collapsed={collapsed}
        />
      </div>
    </aside>
  );
}

function NavItem({ item, active, onClick, collapsed }) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      style={{
        display: "flex", alignItems: "center",
        justifyContent: collapsed ? "center" : "flex-start",
        gap: collapsed ? 0 : 10,
        width: "100%", textAlign: "left",
        background: active ? "var(--bg-sel)" : "none",
        border: "none",
        borderRadius: 8,
        padding: collapsed ? "10px 0" : "8px 10px",
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
      <span style={{ fontSize: collapsed ? 18 : 15, width: collapsed ? "auto" : 20, textAlign: "center", flexShrink: 0 }}>
        {item.icon}
      </span>
      {!collapsed && item.label}
    </button>
  );
}

// ── mobile bottom tab bar ─────────────────────────────────────────────────────

function BottomTabBar({ active, onNav }) {
  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0,
      height: 60,
      background: "var(--bg-sidebar)",
      borderTop: "1px solid var(--border)",
      display: "flex",
      zIndex: 100,
    }}>
      {BOTTOM_TABS.map(tab => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onNav(tab.id)}
            style={{
              flex: 1,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              gap: 2,
              background: "none",
              border: "none",
              borderRadius: 0,
              padding: 0,
              color: isActive ? "var(--accent)" : "var(--text-secondary)",
              cursor: "pointer",
              transition: "color 0.1s",
            }}
          >
            <span style={{ fontSize: 20 }}>{tab.icon}</span>
            <span style={{ fontSize: 10 }}>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── mobile header + drawer ────────────────────────────────────────────────────

function MobileHeader({ active, onNav, dbName }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleNav = (id) => {
    onNav(id);
    setDrawerOpen(false);
  };

  return (
    <>
      {/* Top bar */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0,
        height: 52,
        background: "var(--bg-sidebar)",
        borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 16px",
        zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>🌳</span>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em" }}>FamilyRoot</span>
        </div>
        <button
          onClick={() => setDrawerOpen(true)}
          style={{
            background: "none", border: "none",
            borderRadius: 8, padding: "6px 8px",
            fontSize: 20, color: "var(--text-primary)",
            cursor: "pointer",
          }}
          aria-label="Open menu"
        >
          ☰
        </button>
      </div>

      {/* Overlay */}
      {drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 200,
          }}
        />
      )}

      {/* Drawer */}
      <div style={{
        position: "fixed", top: 0, left: 0, bottom: 0,
        width: 280,
        background: "var(--bg-sidebar)",
        borderRight: "1px solid var(--border)",
        display: "flex", flexDirection: "column",
        zIndex: 300,
        transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 0.25s ease",
        overflowY: "auto",
      }}>
        {/* Drawer header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 16px 12px",
          borderBottom: "1px solid var(--border)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20 }}>🌳</span>
            <span style={{ fontWeight: 700, fontSize: 15 }}>FamilyRoot</span>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            style={{
              background: "none", border: "none",
              borderRadius: 8, padding: "4px 8px",
              fontSize: 18, color: "var(--text-secondary)",
              cursor: "pointer",
            }}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        {/* Drawer nav */}
        <nav style={{ flex: 1, padding: "8px 10px" }}>
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
                  onClick={() => handleNav(item.id)}
                  collapsed={false}
                />
              ))}
            </div>
          ))}
        </nav>

        {/* Drawer settings */}
        <div style={{ padding: "12px 10px", borderTop: "1px solid var(--border)" }}>
          <NavItem
            item={{ id: "settings", label: "Settings", icon: "⚙️" }}
            active={active === "settings"}
            onClick={() => handleNav("settings")}
            collapsed={false}
          />
        </div>
      </div>
    </>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [page,   setPage]   = useState("people");
  const [dbName, setDbName] = useState(null);
  const width = useWindowWidth();

  const isMobile  = width < 768;
  const isTablet  = width >= 768 && width < 1024;
  // isDesktop = width >= 1024

  useEffect(() => {
    fetch(`${API}/api/health`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setDbName("Family database"))
      .catch(() => {});
  }, []);

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Sidebar: hidden on mobile, collapsed on tablet, full on desktop */}
      {!isMobile && (
        <Sidebar active={page} onNav={setPage} dbName={dbName} collapsed={isTablet} />
      )}

      {/* Mobile top bar + drawer */}
      {isMobile && (
        <MobileHeader active={page} onNav={setPage} dbName={dbName} />
      )}

      <main style={{
        flex: 1,
        display: "flex",
        overflow: "hidden",
        background: "var(--bg-app)",
        paddingTop: isMobile ? 52 : 0,
        paddingBottom: isMobile ? 60 : 0,
      }}>
        {page === "people"    && <PeopleTab   onNav={setPage} />}
        {page === "tree"      && <TreeTab     />}
        {page === "bubbles"   && <BubbleTab   />}
        {page === "timeline"  && <TimelineTab />}
        {page === "map"       && <MapTab      />}
        {page === "photos"    && <PhotosTab   />}
        {page === "faces"     && <FacesTab    />}
        {page === "gramps"        && <GrampsTab       />}
        {page === "grampsengine"  && <GrampsEngineTab />}
        {page === "photoprism"    && <PhotoPrismTab   />}
        {page === "ollama"        && <OllamaTab       />}
        {page === "tools"         && <ToolsTab        />}
        {page === "admin"         && <AdminTab        />}
        {page === "settings"  && <SettingsPage />}
      </main>

      {/* Mobile bottom tab bar */}
      {isMobile && (
        <BottomTabBar active={page} onNav={setPage} />
      )}
    </div>
  );
}

function SettingsPage() {
  const [stats, setStats] = useState(null);
  const [statsErr, setStatsErr] = useState(false);

  useEffect(() => {
    fetch("/api/export/stats")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setStats(d))
      .catch(() => setStatsErr(true));
  }, []);

  const cardStyle = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
  };

  const sectionTitleStyle = {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-tertiary)",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    marginBottom: 12,
  };

  const btnStyle = {
    display: "inline-block",
    background: "var(--bg-sel)",
    border: "1px solid var(--border)",
    borderRadius: 7,
    padding: "7px 14px",
    fontSize: 13,
    color: "var(--text-primary)",
    cursor: "pointer",
    marginRight: 8,
    marginBottom: 8,
  };

  const accentBtnStyle = {
    ...btnStyle,
    background: "#1D9E75",
    border: "1px solid #1D9E75",
    color: "#fff",
  };

  const statRow = (label, value) => (
    <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{value ?? "—"}</span>
    </div>
  );

  const yearRange = stats?.date_range
    ? (stats.date_range[0] && stats.date_range[1]
        ? `${stats.date_range[0]} – ${stats.date_range[1]}`
        : "—")
    : null;

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "32px 40px", maxWidth: 600 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24, color: "var(--text-primary)" }}>
        Settings
      </h1>

      {/* Database stats */}
      <div style={cardStyle}>
        <div style={sectionTitleStyle}>Database Statistics</div>
        {statsErr && (
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Could not load stats.</div>
        )}
        {!stats && !statsErr && (
          <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Loading…</div>
        )}
        {stats && (
          <div>
            {statRow("People", stats.total_persons)}
            {statRow("Families", stats.total_families)}
            {statRow("Events", stats.total_events)}
            {statRow("Places", stats.total_places)}
            {statRow("Photos / media", stats.total_media)}
            {statRow("Year range", yearRange)}
          </div>
        )}
      </div>

      {/* Export */}
      <div style={cardStyle}>
        <div style={sectionTitleStyle}>Export</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
          Download your family data in standard formats.
        </div>
        <button style={accentBtnStyle} onClick={() => window.open("/api/export/gedcom")}>
          Download GEDCOM (.ged)
        </button>
        <button style={btnStyle} onClick={() => window.open("/api/export/csv/persons")}>
          Download people CSV
        </button>
        <button style={btnStyle} onClick={() => window.open("/api/export/csv/events")}>
          Download events CSV
        </button>
      </div>

      {/* About */}
      <div style={cardStyle}>
        <div style={sectionTitleStyle}>About</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 22 }}>🌳</span>
          <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>FamilyRoot</span>
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>v0.1.0</span>
        </div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 10 }}>
          A local-first family history application.
        </div>
        <a
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
          style={{ ...btnStyle, textDecoration: "none" }}
        >
          GitHub
        </a>
      </div>
    </div>
  );
}
