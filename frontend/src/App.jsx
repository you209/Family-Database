import { useState, useEffect, useRef, useCallback } from "react";
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

// ── global search ─────────────────────────────────────────────────────────────

function GlobalSearch({ onNav }) {
  const [q,       setQ]       = useState("");
  const [results, setResults] = useState(null);
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const ref     = useRef(null);
  const timerRef = useRef(null);

  const search = useCallback((query) => {
    if (query.length < 2) { setResults(null); setOpen(false); return; }
    setLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(query)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) { setResults(d.results); setOpen(true); }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleChange = (e) => {
    const val = e.target.value;
    setQ(val);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(val), 300);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") { setOpen(false); setQ(""); }
  };

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (item) => {
    setOpen(false);
    setQ("");
    const TAB_MAP = { person: "people", place: "map", event: "timeline", media: "photos" };
    onNav(TAB_MAP[item.type] || "people");
  };

  return (
    <div ref={ref} style={{ position: "relative", padding: "0 10px", marginBottom: 8 }}>
      <div style={{ position: "relative" }}>
        <span style={{
          position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
          fontSize: 13, pointerEvents: "none", color: "var(--text-tertiary)",
        }}>🔍</span>
        <input
          type="search"
          value={q}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => results && results.length > 0 && setOpen(true)}
          placeholder="Search…"
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: "var(--bg-sel)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "7px 10px 7px 30px",
            fontSize: 13,
            color: "var(--text-primary)",
            outline: "none",
          }}
        />
      </div>

      {open && results && results.length > 0 && (
        <div style={{
          position: "absolute",
          top: "100%",
          left: 10,
          right: 10,
          zIndex: 200,
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          marginTop: 4,
          maxHeight: 360,
          overflowY: "auto",
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}>
          {results.map((item, i) => (
            <div
              key={`${item.type}-${item.id}-${i}`}
              onMouseDown={() => handleSelect(item)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 12px",
                cursor: "pointer",
                borderBottom: i < results.length - 1 ? "1px solid var(--border)" : "none",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--bg-card-hov, var(--bg-sel))"}
              onMouseLeave={e => e.currentTarget.style.background = ""}
            >
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {item.title}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {item.subtitle}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && results && results.length === 0 && !loading && (
        <div style={{
          position: "absolute", top: "100%", left: 10, right: 10, zIndex: 200,
          background: "var(--bg-card)", border: "1px solid var(--border)",
          borderRadius: 8, marginTop: 4,
          padding: "12px",
          fontSize: 13, color: "var(--text-secondary)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}>
          No results found
        </div>
      )}
    </div>
  );
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

      {/* Global search — only when sidebar is expanded */}
      {!collapsed && <GlobalSearch onNav={onNav} />}

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

// ── PIN lock screen ───────────────────────────────────────────────────────────

function PinScreen({ onUnlocked }) {
  const [pin, setPin]         = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = async () => {
    if (pin.length !== 6) { setError("Enter all 6 digits"); return; }
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`${API}/api/share/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
        credentials: "same-origin",
      });
      if (r.ok) {
        onUnlocked();
      } else {
        setError("Incorrect PIN. Please try again.");
        setPin("");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "var(--bg-app)",
      zIndex: 9999,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: "40px 36px",
        width: 340,
        textAlign: "center",
      }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>🌳</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>FamilyRoot</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 28 }}>
          Enter PIN to view family records
        </div>
        <input
          ref={inputRef}
          type="password"
          value={pin}
          maxLength={6}
          onChange={e => { setPin(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
          onKeyDown={e => { if (e.key === "Enter") submit(); }}
          placeholder="••••••"
          style={{
            width: "100%", textAlign: "center", fontSize: 28,
            letterSpacing: "0.3em", padding: "10px 12px",
            borderRadius: 8, border: "1px solid var(--border)",
            background: "var(--bg-sel)", color: "var(--text-primary)",
            marginBottom: 12, boxSizing: "border-box",
          }}
        />
        {error && (
          <div style={{ fontSize: 12, color: "#F08060", marginBottom: 10 }}>{error}</div>
        )}
        <button
          onClick={submit}
          disabled={loading}
          style={{
            width: "100%", padding: "10px 0", fontSize: 14, fontWeight: 600,
            background: "#1D9E75", color: "#fff", border: "none", borderRadius: 8,
            cursor: loading ? "default" : "pointer",
          }}
        >
          {loading ? "Checking…" : "Unlock"}
        </button>
      </div>
    </div>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [page,        setPage]        = useState("people");
  const [dbName,      setDbName]      = useState(null);
  const [pinRequired, setPinRequired] = useState(false);
  const [pinUnlocked, setPinUnlocked] = useState(false);
  const width = useWindowWidth();

  const isMobile  = width < 768;
  const isTablet  = width >= 768 && width < 1024;
  // isDesktop = width >= 1024

  useEffect(() => {
    const loadApp = () => {
      fetch(`${API}/api/health`)
        .then(r => r.ok ? r.json() : null)
        .then(d => d && setDbName("Family database"))
        .catch(() => {});
    };

    fetch(`${API}/api/share/status`)
      .then(r => r.ok ? r.json() : null)
      .then(async d => {
        if (d?.enabled) {
          const healthResp = await fetch(`${API}/api/health`, { credentials: "same-origin" });
          if (healthResp.status === 401) {
            setPinRequired(true);
            return;
          }
        }
        loadApp();
      })
      .catch(() => loadApp());
  }, []);

  const handleUnlocked = () => {
    setPinRequired(false);
    setPinUnlocked(true);
    fetch(`${API}/api/health`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setDbName("Family database"))
      .catch(() => {});
  };

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* PIN overlay */}
      {pinRequired && !pinUnlocked && <PinScreen onUnlocked={handleUnlocked} />}

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

// ── shared access settings card ───────────────────────────────────────────────

function SharedAccessCard({ cardStyle, sectionTitleStyle, btnStyle, accentBtnStyle }) {
  const [shareEnabled, setShareEnabled] = useState(false);
  const [hasPin, setHasPin]             = useState(false);
  const [pinInput, setPinInput]         = useState("");
  const [showSetup, setShowSetup]       = useState(false);
  const [saving, setSaving]             = useState(false);
  const [msg, setMsg]                   = useState(null);

  useEffect(() => {
    fetch(`${API}/api/share/status`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setShareEnabled(d.enabled); setHasPin(d.has_pin); } })
      .catch(() => {});
  }, []);

  const savePin = async () => {
    if (!/^\d{6}$/.test(pinInput)) { setMsg({ ok: false, text: "PIN must be exactly 6 digits" }); return; }
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/share/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinInput, enabled: true }),
      });
      const d = await r.json();
      if (d.ok) {
        setShareEnabled(true);
        setHasPin(true);
        setShowSetup(false);
        setPinInput("");
        setMsg({ ok: true, text: "PIN protection enabled." });
      } else {
        setMsg({ ok: false, text: d.error || "Failed to save PIN." });
      }
    } catch {
      setMsg({ ok: false, text: "Network error." });
    } finally {
      setSaving(false);
    }
  };

  const disable = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/api/share/disable`, { method: "POST" });
      setShareEnabled(false);
      setShowSetup(false);
      setMsg({ ok: true, text: "Shared access disabled." });
    } catch {
      setMsg({ ok: false, text: "Network error." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={cardStyle}>
      <div style={sectionTitleStyle}>Shared Access</div>

      <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
        Anyone visiting this address will need the PIN to view records.
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
          <input
            type="checkbox"
            checked={shareEnabled}
            onChange={e => {
              if (e.target.checked) { setShowSetup(true); setMsg(null); }
              else disable();
            }}
          />
          Enable PIN protection
        </label>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 5,
          background: shareEnabled ? "rgba(29,158,117,0.18)" : "var(--bg-sel)",
          color: shareEnabled ? "#1D9E75" : "var(--text-tertiary)",
        }}>
          {shareEnabled ? "ENABLED" : "DISABLED"}
        </span>
      </div>

      {(showSetup || (!shareEnabled && hasPin)) && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
            {hasPin ? "Set a new 6-digit PIN:" : "Set a 6-digit PIN:"}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="password"
              value={pinInput}
              maxLength={6}
              onChange={e => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="••••••"
              style={{ width: 100, fontSize: 16, letterSpacing: "0.2em", textAlign: "center" }}
            />
            <button style={accentBtnStyle} onClick={savePin} disabled={saving}>
              {saving ? "Saving…" : "Save PIN"}
            </button>
            <button style={btnStyle} onClick={() => { setShowSetup(false); setPinInput(""); setMsg(null); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {shareEnabled && !showSetup && (
        <button style={btnStyle} onClick={() => { setShowSetup(true); setMsg(null); }}>
          {hasPin ? "Change PIN" : "Set PIN"}
        </button>
      )}

      {msg && (
        <div style={{ fontSize: 12, marginTop: 8, color: msg.ok ? "var(--accent)" : "#e05c5c" }}>
          {msg.text}
        </div>
      )}
    </div>
  );
}

// ── updates card ──────────────────────────────────────────────────────────────

function UpdatesCard({ cardStyle, sectionTitleStyle, btnStyle, accentBtnStyle }) {
  const [versionInfo, setVersionInfo] = useState(null);
  const [checking, setChecking]       = useState(false);
  const [updating, setUpdating]       = useState(false);
  const [updateLog, setUpdateLog]     = useState([]);
  const [updateDone, setUpdateDone]   = useState(false);
  const esRef = useRef(null);

  const fetchVersion = useCallback(() => {
    setChecking(true);
    fetch("/api/admin/version")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setVersionInfo(d); })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => { fetchVersion(); }, [fetchVersion]);

  const startUpdate = async () => {
    setUpdating(true);
    setUpdateLog([]);
    setUpdateDone(false);
    try {
      await fetch("/api/admin/update", { method: "POST" });
    } catch {
      // ignore, SSE will report error
    }
    if (esRef.current) esRef.current.close();
    const es = new EventSource("/api/admin/update/status");
    esRef.current = es;
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.done) {
          setUpdateDone(true);
          setUpdating(false);
          es.close();
        } else if (d.message) {
          setUpdateLog(prev => [...prev, d.message]);
        }
      } catch { /* ignore */ }
    };
    es.onerror = () => {
      setUpdating(false);
      es.close();
    };
  };

  return (
    <div style={cardStyle}>
      <div style={sectionTitleStyle}>Updates</div>

      {!versionInfo && checking && (
        <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Checking…</div>
      )}

      {versionInfo && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
            Current version: <strong style={{ color: "var(--text-primary)" }}>v{versionInfo.current}</strong>
          </div>

          {versionInfo.update_available ? (
            <div style={{
              background: "rgba(29,158,117,0.12)",
              border: "1px solid rgba(29,158,117,0.35)",
              borderRadius: 8,
              padding: "10px 14px",
              marginBottom: 12,
            }}>
              <div style={{ fontSize: 13, color: "#1D9E75", fontWeight: 600, marginBottom: 4 }}>
                v{versionInfo.latest} available
              </div>
              {versionInfo.changelog && (
                <div style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "pre-wrap", marginBottom: 8, maxHeight: 120, overflowY: "auto" }}>
                  {versionInfo.changelog}
                </div>
              )}
              <a
                href={versionInfo.release_url}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 12, color: "var(--text-secondary)", marginRight: 12 }}
              >
                View release notes
              </a>
            </div>
          ) : (
            !checking && (
              <div style={{ fontSize: 13, color: "var(--accent)", marginBottom: 8 }}>
                You're up to date ✓
              </div>
            )
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button style={btnStyle} onClick={fetchVersion} disabled={checking || updating}>
          {checking ? "Checking…" : "Check for updates"}
        </button>
        {versionInfo?.update_available && (
          <button style={accentBtnStyle} onClick={startUpdate} disabled={updating}>
            {updating ? "Updating…" : "Update now"}
          </button>
        )}
      </div>

      {(updateLog.length > 0 || updating) && (
        <div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Update log
          </div>
          <div style={{
            background: "var(--bg-app)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "10px 12px",
            fontFamily: "monospace",
            fontSize: 12,
            color: "var(--text-secondary)",
            maxHeight: 180,
            overflowY: "auto",
            marginBottom: 8,
          }}>
            {updateLog.map((line, i) => (
              <div key={i} style={{ color: line.startsWith("Error") || line.startsWith("✗") ? "#e05c5c" : line.startsWith("✓") || line.includes("complete") ? "#1D9E75" : "var(--text-secondary)" }}>
                {line}
              </div>
            ))}
            {updating && <div style={{ color: "var(--text-tertiary)" }}>…</div>}
          </div>
          {updateDone && (
            <div style={{ fontSize: 12, color: "#e8a020", fontWeight: 500 }}>
              ⚠ The app will need to be restarted after updating.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SettingsPage() {
  const [stats, setStats] = useState(null);
  const [statsErr, setStatsErr] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState(null);

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

      {/* Backup & Restore */}
      <div style={cardStyle}>
        <div style={sectionTitleStyle}>Backup &amp; Restore</div>

        {/* Backup */}
        <button style={accentBtnStyle} onClick={() => window.open("/api/admin/backup")}>
          Create backup
        </button>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 14 }}>
          Downloads a zip of your database and all media files.
        </div>

        <hr style={{ border: "none", borderTop: "1px solid var(--border)", marginBottom: 14 }} />

        {/* Restore */}
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 8 }}>
          Restore from backup
        </div>
        <div style={{ fontSize: 12, color: "#e05c5c", marginBottom: 10, fontWeight: 500 }}>
          ⚠ This will overwrite your current database
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <input
            type="file"
            accept=".zip"
            onChange={e => { setRestoreFile(e.target.files[0] || null); setRestoreMsg(null); }}
            style={{ fontSize: 12 }}
          />
          <button
            style={btnStyle}
            disabled={!restoreFile || restoring}
            onClick={async () => {
              if (!restoreFile) return;
              setRestoring(true);
              setRestoreMsg(null);
              const fd = new FormData();
              fd.append("file", restoreFile);
              try {
                const r = await fetch("/api/admin/restore", { method: "POST", body: fd });
                const d = await r.json();
                if (d.ok) {
                  setRestoreMsg({ ok: true, text: `Restored — ${d.restored.media_files} media files.` });
                } else {
                  setRestoreMsg({ ok: false, text: d.error || "Restore failed." });
                }
              } catch {
                setRestoreMsg({ ok: false, text: "Network error during restore." });
              } finally {
                setRestoring(false);
              }
            }}
          >
            {restoring ? "Restoring…" : "Restore"}
          </button>
        </div>
        {restoreMsg && (
          <div style={{ fontSize: 12, color: restoreMsg.ok ? "var(--accent)" : "#e05c5c" }}>
            {restoreMsg.text}
          </div>
        )}
      </div>

      {/* Shared Access */}
      <SharedAccessCard cardStyle={cardStyle} sectionTitleStyle={sectionTitleStyle} btnStyle={btnStyle} accentBtnStyle={accentBtnStyle} />

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

      {/* Print */}
      <div style={cardStyle}>
        <div style={sectionTitleStyle}>Print</div>
        <button style={btnStyle} onClick={() => window.print()}>
          🖨 Print this page
        </button>
      </div>

      {/* Updates */}
      <UpdatesCard cardStyle={cardStyle} sectionTitleStyle={sectionTitleStyle} btnStyle={btnStyle} accentBtnStyle={accentBtnStyle} />

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
