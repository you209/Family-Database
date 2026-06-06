import { useState, useEffect, useRef } from "react";

const API = "";

function SLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
      color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: 10,
    }}>{children}</div>
  );
}

function Card({ children, style }) {
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-card)", borderRadius: 10, ...style }}>
      {children}
    </div>
  );
}

function StatusDot({ ok }) {
  return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: ok ? "var(--accent)" : "#E07070", marginRight: 6 }} />;
}

function PrimaryBtn({ children, disabled, onClick, style }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: "var(--accent)", color: "#fff", border: "none",
      borderRadius: 7, padding: "8px 20px", fontSize: 13, fontWeight: 500,
      cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1,
      ...style,
    }}>{children}</button>
  );
}

function OutBox({ text, placeholder = "Output will appear here…", rows = 10 }) {
  return (
    <textarea
      value={text || ""}
      readOnly
      rows={rows}
      placeholder={placeholder}
      style={{
        width: "100%", fontSize: 12, fontFamily: "var(--mono, monospace)",
        background: "var(--bg-sel)", color: "var(--text-secondary)",
        border: "1px solid var(--border)", borderRadius: 6,
        padding: "10px 12px", resize: "vertical", boxSizing: "border-box",
      }}
    />
  );
}

// ── Connect panel ─────────────────────────────────────────────────────────────

function ConnectPanel() {
  const [url, setUrl] = useState("http://localhost:11434");
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/ollama/status`).then(r => r.json()).then(d => {
      setStatus(d);
      if (d.url) setUrl(d.url);
    }).catch(() => {});
  }, []);

  const connect = async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`${API}/api/ollama/connect`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base_url: url }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) setError(d.error || "Connection failed");
      else setStatus({ connected: true, url, models: d.models });
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  return (
    <div style={{ maxWidth: 620 }}>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 16 }}>
        Connect to a local <strong>Ollama</strong> instance to run AI tasks entirely on your device —
        no internet, no API keys, full privacy.
      </p>

      <Card style={{ padding: 16, marginBottom: 20 }}>
        {status?.connected && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "#0D2920", borderRadius: 8, marginBottom: 14, fontSize: 12 }}>
            <StatusDot ok />Connected · {status.models?.length} model(s) · {status.url}
          </div>
        )}
        <SLabel>Ollama URL</SLabel>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input type="text" value={url} onChange={e => setUrl(e.target.value)}
            placeholder="http://localhost:11434"
            style={{ flex: 1, fontSize: 13 }} />
          <PrimaryBtn onClick={connect} disabled={busy || !url}>
            {busy ? "Connecting…" : status?.connected ? "Reconnect" : "Connect"}
          </PrimaryBtn>
        </div>
        {error && <div style={{ fontSize: 12, color: "#E07070", marginTop: 8 }}>✗ {error}</div>}
      </Card>

      {status?.connected && status.models?.length > 0 && (
        <Card style={{ padding: 16, marginBottom: 20 }}>
          <SLabel>Available models ({status.models.length})</SLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {status.models.map(m => (
              <span key={m} style={{
                fontSize: 11, padding: "3px 10px", borderRadius: 20,
                background: "var(--bg-sel)", border: "1px solid var(--border)",
                color: "var(--text-secondary)",
              }}>{m}</span>
            ))}
          </div>
        </Card>
      )}

      <Card style={{ padding: 16 }}>
        <SLabel>Setup instructions</SLabel>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.8 }}>
          <div>1. Install Ollama: <code>curl -fsSL https://ollama.com/install.sh | sh</code></div>
          <div>2. Pull a model: <code>ollama pull llama3</code></div>
          <div>3. For photo analysis: <code>ollama pull llava</code></div>
          <div>4. Ollama runs at <code>http://localhost:11434</code> by default.</div>
          <div style={{ marginTop: 8, color: "var(--text-tertiary)" }}>
            On a Raspberry Pi or remote machine, set the URL to that machine's IP.
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── Story panel ───────────────────────────────────────────────────────────────

function StoryPanel() {
  const [q, setQ] = useState("");
  const [persons, setPersons] = useState([]);
  const [selected, setSelected] = useState(null);
  const [models, setModels] = useState([]);
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [story, setStory] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/ollama/models`).then(r => r.json()).then(d => {
      const ms = (d.models || []).map(m => m.name || m);
      setModels(ms);
      if (ms.length) setModel(ms[0]);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!q.trim()) { setPersons([]); return; }
    const t = setTimeout(() => {
      fetch(`${API}/api/persons/?q=${encodeURIComponent(q)}&per_page=10`)
        .then(r => r.json()).then(d => setPersons(d.persons || [])).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const generate = async () => {
    if (!selected) return;
    setBusy(true); setError(null); setStory("");
    try {
      const r = await fetch(`${API}/api/ollama/story`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ person_id: selected.id, model }),
      });
      const d = await r.json();
      if (!r.ok) setError(d.error);
      else setStory(d.story_text);
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  return (
    <div style={{ maxWidth: 680 }}>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 16 }}>
        Generate a narrative life story for any person in your family database using local AI.
      </p>

      <Card style={{ padding: 16, marginBottom: 16 }}>
        <SLabel>Search for a person</SLabel>
        <input type="search" value={q} onChange={e => setQ(e.target.value)}
          placeholder="Type a name…"
          style={{ width: "100%", fontSize: 13, marginBottom: persons.length ? 0 : 0, boxSizing: "border-box" }} />
        {persons.length > 0 && (
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
            {persons.map(p => (
              <button key={p.id} onClick={() => { setSelected(p); setQ(`${p.name_given || ""} ${p.name_surname || ""}`.trim()); setPersons([]); }}
                style={{
                  textAlign: "left", background: selected?.id === p.id ? "var(--bg-sel)" : "none",
                  border: "1px solid var(--border)", borderRadius: 6,
                  padding: "6px 10px", fontSize: 12, cursor: "pointer",
                  color: "var(--text-primary)",
                }}>
                {p.name_given} {p.name_surname}
                {p.birth_year ? ` · b. ${p.birth_year}` : ""}
                {p.death_year ? ` · d. ${p.death_year}` : ""}
              </button>
            ))}
          </div>
        )}
      </Card>

      {selected && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: "var(--accent)" }}>
            Selected: <strong>{selected.name_given} {selected.name_surname}</strong>
          </div>
          {models.length > 0 && (
            <select value={model} onChange={e => setModel(e.target.value)} style={{ fontSize: 12, marginLeft: "auto" }}>
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
          <PrimaryBtn onClick={generate} disabled={busy}>
            {busy ? "Generating…" : "Generate story"}
          </PrimaryBtn>
        </div>
      )}

      {error && <div style={{ fontSize: 12, color: "#E07070", marginBottom: 10 }}>✗ {error}</div>}
      <OutBox text={story} placeholder="Life story will appear here…" rows={16} />
    </div>
  );
}

// ── Photo AI panel ─────────────────────────────────────────────────────────────

function PhotoPanel() {
  const [photos, setPhotos] = useState([]);
  const [selected, setSelected] = useState(null);
  const [models, setModels] = useState([]);
  const [model, setModel] = useState("llava");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/photos/?per_page=12`).then(r => r.json()).then(d => setPhotos(d.photos || [])).catch(() => {});
    fetch(`${API}/api/ollama/models`).then(r => r.json()).then(d => {
      const all = (d.models || []).map(m => m.name || m);
      const multi = all.filter(m => m.includes("llava") || m.includes("bakllava") || m.includes("vision"));
      setModels(multi.length ? multi : all.length ? all : ["llava"]);
      setModel(multi[0] || all[0] || "llava");
    }).catch(() => {});
  }, []);

  const analyse = async () => {
    if (!selected) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const r = await fetch(`${API}/api/ollama/tag-photo`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ media_id: selected.id, model }),
      });
      const d = await r.json();
      if (!r.ok) setError(d.error);
      else setResult(d);
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 16 }}>
        Use a multimodal AI model (llava, bakllava) to generate captions and tags for family photos.
        Requires <code>ollama pull llava</code>.
      </p>

      <SLabel>Recent photos — click to select</SLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8, marginBottom: 20 }}>
        {photos.map(p => (
          <div key={p.id}
            onClick={() => { setSelected(p); setResult(null); setError(null); }}
            style={{
              borderRadius: 8, overflow: "hidden", cursor: "pointer",
              border: selected?.id === p.id ? "2px solid var(--accent)" : "2px solid transparent",
              background: "var(--bg-card)",
            }}>
            <div style={{ aspectRatio: "1", background: "var(--bg-sel)", overflow: "hidden" }}>
              <img
                src={p.thumb_url || `/api/photos/${p.id}/thumb`}
                alt={p.description || ""}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                onError={e => { e.currentTarget.style.display = "none"; }}
              />
            </div>
            <div style={{ padding: "4px 6px", fontSize: 10, color: "var(--text-tertiary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {p.description || p.filename || `#${p.id}`}
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 12, color: "var(--accent)" }}>Selected: {selected.filename || `#${selected.id}`}</span>
          {models.length > 0 && (
            <select value={model} onChange={e => setModel(e.target.value)} style={{ fontSize: 12 }}>
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
          <PrimaryBtn onClick={analyse} disabled={busy}>
            {busy ? "Analysing…" : "Analyse"}
          </PrimaryBtn>
        </div>
      )}

      {error && <div style={{ fontSize: 12, color: "#E07070", marginBottom: 10 }}>✗ {error}</div>}

      {result && (
        <Card style={{ padding: 16 }}>
          <SLabel>Caption</SLabel>
          <div style={{ fontSize: 13, color: "var(--text-primary)", marginBottom: 14, lineHeight: 1.6 }}>{result.caption}</div>
          {result.tags?.length > 0 && (
            <>
              <SLabel>Tags</SLabel>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {result.tags.map((tag, i) => (
                  <span key={i} style={{
                    fontSize: 11, padding: "3px 10px", borderRadius: 20,
                    background: "var(--bg-sel)", border: "1px solid var(--border)",
                    color: "var(--text-secondary)",
                  }}>{tag}</span>
                ))}
              </div>
            </>
          )}
          <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 10 }}>Model: {result.model}</div>
        </Card>
      )}
    </div>
  );
}

// ── Chat panel ────────────────────────────────────────────────────────────────

function ChatPanel() {
  const [models, setModels] = useState([]);
  const [model, setModel] = useState("");
  const [system, setSystem] = useState("You are a helpful assistant for genealogy research.");
  const [input, setInput] = useState("");
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef();

  useEffect(() => {
    fetch(`${API}/api/ollama/models`).then(r => r.json()).then(d => {
      const ms = (d.models || []).map(m => m.name || m);
      setModels(ms);
      if (ms.length) setModel(ms[0]);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  const send = async () => {
    if (!input.trim() || busy) return;
    const userMsg = input.trim();
    setInput("");
    setHistory(h => [...h, { role: "user", text: userMsg }]);
    setBusy(true); setError(null);

    const contextPrompt = history.map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`).join("\n") +
      `\nUser: ${userMsg}\nAssistant:`;

    try {
      const r = await fetch(`${API}/api/ollama/generate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt: contextPrompt, system, stream: false }),
      });
      const d = await r.json();
      if (!r.ok) setError(d.error);
      else setHistory(h => [...h, { role: "assistant", text: d.response }]);
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  const handleKey = e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div style={{ maxWidth: 700, display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
        {models.length > 0 && (
          <div>
            <SLabel>Model</SLabel>
            <select value={model} onChange={e => setModel(e.target.value)} style={{ fontSize: 12 }}>
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <SLabel>System prompt</SLabel>
        <textarea
          value={system}
          onChange={e => setSystem(e.target.value)}
          rows={2}
          style={{
            width: "100%", fontSize: 12, background: "var(--bg-sel)", color: "var(--text-secondary)",
            border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px",
            resize: "vertical", boxSizing: "border-box",
          }}
        />
      </div>

      <div style={{
        flex: 1, minHeight: 260, maxHeight: 400, overflowY: "auto",
        background: "var(--bg-sel)", borderRadius: 8, border: "1px solid var(--border)",
        padding: "12px 14px", marginBottom: 10, display: "flex", flexDirection: "column", gap: 10,
      }}>
        {history.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", textAlign: "center", marginTop: 40 }}>
            Start a conversation…
          </div>
        )}
        {history.map((msg, i) => (
          <div key={i} style={{
            alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
            maxWidth: "80%",
          }}>
            <div style={{
              fontSize: 11, color: "var(--text-tertiary)", marginBottom: 3,
              textAlign: msg.role === "user" ? "right" : "left",
            }}>{msg.role === "user" ? "You" : model || "AI"}</div>
            <div style={{
              background: msg.role === "user" ? "var(--accent)" : "var(--bg-card)",
              color: msg.role === "user" ? "#fff" : "var(--text-primary)",
              borderRadius: 10, padding: "8px 12px", fontSize: 13, lineHeight: 1.6,
              border: msg.role === "user" ? "none" : "1px solid var(--border)",
              whiteSpace: "pre-wrap",
            }}>{msg.text}</div>
          </div>
        ))}
        {busy && (
          <div style={{ alignSelf: "flex-start" }}>
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 12px", fontSize: 13, color: "var(--text-tertiary)" }}>
              ▌ Thinking…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <div style={{ fontSize: 12, color: "#E07070", marginBottom: 8 }}>✗ {error}</div>}

      <div style={{ display: "flex", gap: 8 }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          rows={2}
          placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
          style={{
            flex: 1, fontSize: 13, background: "var(--bg-sel)", color: "var(--text-primary)",
            border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px",
            resize: "none", boxSizing: "border-box",
          }}
        />
        <PrimaryBtn onClick={send} disabled={busy || !input.trim()} style={{ alignSelf: "flex-end", padding: "9px 20px" }}>
          Send
        </PrimaryBtn>
      </div>

      {history.length > 0 && (
        <button onClick={() => setHistory([])} style={{
          marginTop: 8, fontSize: 11, color: "var(--text-tertiary)",
          background: "none", border: "none", cursor: "pointer", textAlign: "left",
        }}>Clear conversation</button>
      )}
    </div>
  );
}

// ── main tab ──────────────────────────────────────────────────────────────────

const TABS = [
  { id: "connect", label: "Connect", icon: "🔗" },
  { id: "story",   label: "Story",   icon: "📖" },
  { id: "photo",   label: "Photo AI", icon: "🖼" },
  { id: "chat",    label: "Chat",    icon: "💬" },
];

export default function OllamaTab() {
  const [tab, setTab] = useState("connect");

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{
        display: "flex", alignItems: "center",
        padding: "0 24px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-sidebar)",
        flexShrink: 0, overflowX: "auto",
      }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: "none", border: "none",
            borderBottom: `2px solid ${tab === t.id ? "var(--accent)" : "transparent"}`,
            padding: "14px 16px 12px", fontSize: 12, whiteSpace: "nowrap",
            fontWeight: tab === t.id ? 500 : 400,
            color: tab === t.id ? "var(--text-primary)" : "var(--text-secondary)",
            cursor: "pointer",
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
        {tab === "connect" && <ConnectPanel />}
        {tab === "story"   && <StoryPanel />}
        {tab === "photo"   && <PhotoPanel />}
        {tab === "chat"    && <ChatPanel />}
      </div>
    </div>
  );
}
