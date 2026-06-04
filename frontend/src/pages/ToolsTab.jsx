/**
 * FamilyRoot — ToolsTab.jsx
 *
 * Unified tools & integrations page:
 *   OCR       — upload a scanned document image, extract text, link to person/event
 *   Whisper   — upload audio/video, transcribe speech to text
 *   Geocode   — auto-geocode all unresolved places via Nominatim
 *   Paperless — connect to paperless-ngx, browse/link documents
 *   Webtrees  — connect to Webtrees, import family tree
 */

import { useState, useEffect, useRef } from "react";

const API = "";

// ── shared UI ─────────────────────────────────────────────────────────────────

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
    <div style={{ background:"var(--bg-card)", border:"1px solid var(--border-card)", borderRadius:10, ...style }}>
      {children}
    </div>
  );
}

function StatusDot({ ok }) {
  return <span style={{ display:"inline-block", width:8, height:8, borderRadius:"50%", background: ok ? "var(--accent)" : "#E07070", marginRight:6 }} />;
}

function LogBox({ lines, running, logRef }) {
  return (
    <div ref={logRef} style={{
      background:"#0D0D0D", border:"1px solid var(--border)", borderRadius:8,
      padding:"10px 14px", fontFamily:"var(--mono,monospace)", fontSize:11,
      lineHeight:1.8, maxHeight:220, overflowY:"auto", color:"var(--text-secondary)",
    }}>
      {lines.map((l,i)=>(
        <div key={i} style={{ color: l.startsWith("✓")?"var(--accent)":l.startsWith("✗")||l.includes("error")?"#E07070":"var(--text-secondary)" }}>{l}</div>
      ))}
      {running && <div style={{color:"var(--accent)"}}>▌</div>}
      {lines.length===0&&!running&&<div style={{color:"var(--text-tertiary)"}}>Waiting…</div>}
    </div>
  );
}

function DropZone({ accept, label, onFile, icon="📄" }) {
  const [drag, setDrag] = useState(false);
  const ref = useRef();
  return (
    <div
      onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f)onFile(f);}}
      onDragOver={e=>{e.preventDefault();setDrag(true);}}
      onDragLeave={()=>setDrag(false)}
      onClick={()=>ref.current?.click()}
      style={{
        border:`1.5px dashed ${drag?"var(--accent)":"var(--border)"}`,
        borderRadius:10, padding:"20px 16px", textAlign:"center",
        cursor:"pointer", background:drag?"#0D2920":"transparent", transition:"all 0.15s",
      }}
    >
      <input ref={ref} type="file" accept={accept} style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(f)onFile(f);}} />
      <div style={{fontSize:28,marginBottom:6}}>{icon}</div>
      <div style={{fontSize:13,fontWeight:500,marginBottom:3}}>{label}</div>
      <div style={{fontSize:11,color:"var(--text-tertiary)"}}>{accept}</div>
    </div>
  );
}

// ── OCR panel ─────────────────────────────────────────────────────────────────

function OcrPanel() {
  const [file,    setFile]    = useState(null);
  const [lang,    setLang]    = useState("eng");
  const [busy,    setBusy]    = useState(false);
  const [result,  setResult]  = useState(null);
  const [error,   setError]   = useState(null);
  const [langs,   setLangs]   = useState([]);
  const [copied,  setCopied]  = useState(false);

  useEffect(()=>{
    fetch(`${API}/api/ocr/languages`).then(r=>r.json()).then(d=>setLangs(d.languages||[])).catch(()=>{});
  },[]);

  const run = async () => {
    if (!file) return;
    setBusy(true); setError(null); setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("lang", lang);
    try {
      const r = await fetch(`${API}/api/ocr/extract`, { method:"POST", body:fd });
      const d = await r.json();
      if (!r.ok) setError(d.error);
      else setResult(d);
    } catch(e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const copy = () => {
    navigator.clipboard.writeText(result.text);
    setCopied(true);
    setTimeout(()=>setCopied(false),1500);
  };

  return (
    <div style={{maxWidth:620}}>
      <p style={{fontSize:12,color:"var(--text-secondary)",lineHeight:1.7,marginBottom:16}}>
        Extract text from scanned documents — birth certificates, census pages, old letters, death notices.
        Needs <code>apt install tesseract-ocr</code> and <code>pip install pytesseract pillow</code>.
      </p>
      <DropZone accept="image/*,.pdf" label="Drop a scanned image here" onFile={f=>{setFile(f);setResult(null);}} icon="🖼" />
      {file && <div style={{fontSize:12,color:"var(--accent)",marginTop:8}}>Selected: {file.name}</div>}

      <div style={{display:"flex",gap:10,alignItems:"center",marginTop:12}}>
        <select value={lang} onChange={e=>setLang(e.target.value)} style={{fontSize:12}}>
          {langs.length > 0
            ? langs.map(l=><option key={l} value={l}>{l}</option>)
            : <option value="eng">eng</option>}
        </select>
        <button className="primary" onClick={run} disabled={busy||!file} style={{fontSize:13,padding:"7px 20px"}}>
          {busy?"Extracting…":"Extract text"}
        </button>
      </div>

      {error && <div style={{fontSize:12,color:"#E07070",marginTop:10}}>✗ {error}</div>}

      {result && (
        <div style={{marginTop:16}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
            <SLabel>Extracted text ({result.word_count} words)</SLabel>
            <button onClick={copy} style={{fontSize:11,padding:"3px 10px"}}>{copied?"✓ Copied":"Copy"}</button>
          </div>
          <textarea
            value={result.text}
            readOnly
            rows={10}
            style={{width:"100%",fontSize:12,fontFamily:"var(--mono,monospace)",background:"#0D0D0D",color:"var(--text-secondary)",border:"1px solid var(--border)",borderRadius:8,padding:"10px 12px",resize:"vertical"}}
          />
        </div>
      )}
    </div>
  );
}

// ── Whisper panel ─────────────────────────────────────────────────────────────

function WhisperPanel() {
  const [file,    setFile]    = useState(null);
  const [model,   setModel]   = useState("base");
  const [busy,    setBusy]    = useState(false);
  const [result,  setResult]  = useState(null);
  const [error,   setError]   = useState(null);
  const [models,  setModels]  = useState([]);

  useEffect(()=>{
    fetch(`${API}/api/whisper/models`).then(r=>r.json()).then(d=>setModels(d.models||[])).catch(()=>{});
  },[]);

  const run = async () => {
    if (!file) return;
    setBusy(true); setError(null); setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("model", model);
    try {
      const r = await fetch(`${API}/api/whisper/transcribe`, { method:"POST", body:fd });
      const d = await r.json();
      if (!r.ok) setError(d.error);
      else setResult(d);
    } catch(e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{maxWidth:620}}>
      <p style={{fontSize:12,color:"var(--text-secondary)",lineHeight:1.7,marginBottom:16}}>
        Transcribe recorded family stories, interviews, voicemails, or home videos.
        Runs completely offline. Needs <code>pip install openai-whisper</code>.
      </p>
      <DropZone accept="audio/*,video/*,.mp3,.m4a,.wav,.ogg,.mp4,.mov" label="Drop an audio or video file here" onFile={f=>{setFile(f);setResult(null);}} icon="🎙" />
      {file && <div style={{fontSize:12,color:"var(--accent)",marginTop:8}}>Selected: {file.name}</div>}

      <div style={{display:"flex",gap:10,alignItems:"center",marginTop:12}}>
        <div>
          <label style={{fontSize:11,color:"var(--text-tertiary)",display:"block",marginBottom:4}}>Model</label>
          <select value={model} onChange={e=>setModel(e.target.value)} style={{fontSize:12}}>
            {models.map(m=><option key={m.id} value={m.id}>{m.id} — {m.size} — {m.note}</option>)}
          </select>
        </div>
        <button className="primary" onClick={run} disabled={busy||!file} style={{fontSize:13,padding:"7px 20px",alignSelf:"flex-end"}}>
          {busy?"Transcribing… (may take a moment)":"Transcribe"}
        </button>
      </div>

      {busy && <div style={{fontSize:12,color:"var(--text-tertiary)",marginTop:10}}>Running Whisper — this may take a minute on Pi hardware…</div>}
      {error && <div style={{fontSize:12,color:"#E07070",marginTop:10}}>✗ {error}</div>}

      {result && (
        <div style={{marginTop:16}}>
          <SLabel>Transcript {result.language ? `(detected: ${result.language})` : ""}</SLabel>
          <textarea
            value={result.text}
            readOnly
            rows={8}
            style={{width:"100%",fontSize:12,background:"#0D0D0D",color:"var(--text-secondary)",border:"1px solid var(--border)",borderRadius:8,padding:"10px 12px",resize:"vertical"}}
          />
          {result.segments?.length > 0 && (
            <details style={{marginTop:12}}>
              <summary style={{fontSize:11,color:"var(--text-tertiary)",cursor:"pointer"}}>Timestamped segments ({result.segments.length})</summary>
              <div style={{marginTop:8,maxHeight:200,overflowY:"auto"}}>
                {result.segments.map((s,i)=>(
                  <div key={i} style={{display:"flex",gap:10,fontSize:11,padding:"3px 0",borderBottom:"1px solid var(--border)"}}>
                    <span style={{color:"var(--accent)",minWidth:60,flexShrink:0}}>{s.start}s – {s.end}s</span>
                    <span style={{color:"var(--text-secondary)"}}>{s.text}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// ── Geocode panel ─────────────────────────────────────────────────────────────

function GeocodePanel() {
  const [running, setRunning] = useState(false);
  const [log,     setLog]     = useState([]);
  const [done,    setDone]    = useState(false);

  // Quick single geocode test
  const [testQ,  setTestQ]  = useState("");
  const [testRes,setTestRes]= useState(null);
  const logRef = useRef();
  useEffect(()=>{ if(logRef.current) logRef.current.scrollTop=logRef.current.scrollHeight; },[log]);

  const testGeocode = async () => {
    const r = await fetch(`${API}/api/places/geocode?q=${encodeURIComponent(testQ)}`);
    const d = await r.json();
    setTestRes(d);
  };

  const runAll = async () => {
    setRunning(true); setLog([]); setDone(false);
    const r = await fetch(`${API}/api/places/geocode-all`, { method:"POST" });
    if (!r.ok) { setRunning(false); return; }
    const es = new EventSource(`${API}/api/places/geocode-all/status`);
    es.onmessage = e => {
      const d = JSON.parse(e.data);
      if (d.done) { setDone(true); setRunning(false); es.close(); }
      else if (d.message) setLog(prev=>[...prev,d.message]);
    };
    es.onerror = () => { setRunning(false); es.close(); };
  };

  return (
    <div style={{maxWidth:600}}>
      <p style={{fontSize:12,color:"var(--text-secondary)",lineHeight:1.7,marginBottom:16}}>
        Automatically find latitude/longitude for every place in your database using the free
        OpenStreetMap Nominatim service. No install needed — works straight away.
        Respects the 1 request/second rate limit automatically.
      </p>

      {/* quick test */}
      <Card style={{padding:16,marginBottom:20}}>
        <SLabel>Test a single place</SLabel>
        <div style={{display:"flex",gap:8}}>
          <input type="text" value={testQ} onChange={e=>setTestQ(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&testGeocode()}
            placeholder="e.g. Liverpool, England" style={{flex:1,fontSize:13}} />
          <button onClick={testGeocode} disabled={!testQ} style={{fontSize:12,padding:"7px 16px"}}>Geocode</button>
        </div>
        {testRes && (
          <div style={{marginTop:10,fontSize:12}}>
            {testRes.found
              ? <span style={{color:"var(--accent)"}}>✓ Found: {testRes.lat.toFixed(5)}, {testRes.lon.toFixed(5)}</span>
              : <span style={{color:"#E07070"}}>✗ Not found</span>}
          </div>
        )}
      </Card>

      {/* batch */}
      <SLabel>Geocode all unresolved places</SLabel>
      <button className="primary" onClick={runAll} disabled={running} style={{fontSize:13,padding:"9px 24px",marginBottom:16}}>
        {running?"Geocoding…":done?"Run again":"Geocode all places"}
      </button>
      {(running||log.length>0) && <LogBox lines={log} running={running} logRef={logRef} />}
    </div>
  );
}

// ── Paperless panel ───────────────────────────────────────────────────────────

function PaperlessPanel() {
  const [status,  setStatus]  = useState(null);
  const [url,     setUrl]     = useState("http://localhost:8000");
  const [token,   setToken]   = useState("");
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState(null);
  const [docs,    setDocs]    = useState(null);
  const [q,       setQ]       = useState("");

  useEffect(()=>{
    fetch(`${API}/api/paperless/status`).then(r=>r.json()).then(d=>{setStatus(d);if(d.url)setUrl(d.url);}).catch(()=>{});
  },[]);

  const connect = async () => {
    setBusy(true); setError(null);
    const r = await fetch(`${API}/api/paperless/connect`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url,token})});
    const d = await r.json();
    if (!r.ok) setError(d.error);
    else { setStatus({connected:true,...d}); loadDocs(""); }
    setBusy(false);
  };

  const loadDocs = async (query) => {
    const r = await fetch(`${API}/api/paperless/documents?q=${encodeURIComponent(query)}&per_page=20`);
    const d = await r.json();
    setDocs(d.documents||[]);
  };

  useEffect(()=>{
    if(status?.connected) loadDocs(q);
  },[status?.connected]);

  useEffect(()=>{
    if(!status?.connected) return;
    const t = setTimeout(()=>loadDocs(q),300);
    return()=>clearTimeout(t);
  },[q]);

  return (
    <div style={{maxWidth:680}}>
      <p style={{fontSize:12,color:"var(--text-secondary)",lineHeight:1.7,marginBottom:16}}>
        Connect to a running <strong>paperless-ngx</strong> instance to browse scanned documents and link
        birth certificates, wills, letters, and census pages directly to people and events in FamilyRoot.
      </p>

      {/* connection */}
      <Card style={{padding:16,marginBottom:20}}>
        {status?.connected && (
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",background:"#0D2920",borderRadius:8,marginBottom:14,fontSize:12}}>
            <StatusDot ok />Connected · {status.doc_count?.toLocaleString()} documents · {status.url}
          </div>
        )}
        <SLabel>Paperless-ngx connection</SLabel>
        <div style={{display:"flex",gap:8,marginBottom:8}}>
          <input type="text" value={url} onChange={e=>setUrl(e.target.value)} placeholder="http://192.168.1.x:8000" style={{flex:2,fontSize:12}} />
          <input type="text" value={token} onChange={e=>setToken(e.target.value)} placeholder="API token" style={{flex:1,fontSize:12}} />
          <button className="primary" onClick={connect} disabled={busy||!token} style={{fontSize:12,padding:"6px 16px"}}>
            {busy?"Connecting…":status?.connected?"Reconnect":"Connect"}
          </button>
        </div>
        <div style={{fontSize:11,color:"var(--text-tertiary)"}}>
          Get your API token from paperless-ngx → Settings → API → Generate token
        </div>
        {error&&<div style={{fontSize:12,color:"#E07070",marginTop:8}}>✗ {error}</div>}
      </Card>

      {/* document browser */}
      {status?.connected && (
        <>
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            <input type="search" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search documents…" style={{flex:1,fontSize:13}} />
          </div>
          {!docs && <div style={{fontSize:13,color:"var(--text-tertiary)"}}>Loading…</div>}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:10}}>
            {docs?.map(d=>(
              <Card key={d.id} style={{overflow:"hidden"}}>
                <div style={{aspectRatio:"3/4",background:"var(--bg-input)",overflow:"hidden"}}>
                  <img src={d.thumb_url} alt="" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}
                    onError={e=>{e.currentTarget.style.display="none";}}/>
                </div>
                <div style={{padding:"8px 10px"}}>
                  <div style={{fontSize:12,fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{d.title}</div>
                  <div style={{fontSize:10,color:"var(--text-tertiary)",marginTop:2}}>{d.created?.slice(0,10)}</div>
                  {d.content_snippet&&<div style={{fontSize:10,color:"var(--text-secondary)",marginTop:4,lineClamp:2,overflow:"hidden"}}>{d.content_snippet}</div>}
                  <a href={d.preview_url} target="_blank" rel="noreferrer" style={{fontSize:11,color:"var(--accent)",display:"block",marginTop:6}}>Open ↗</a>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Webtrees panel ────────────────────────────────────────────────────────────

function WebtreesPanel() {
  const [status,  setStatus]  = useState(null);
  const [url,     setUrl]     = useState("http://localhost:8080");
  const [apiKey,  setApiKey]  = useState("");
  const [trees,   setTrees]   = useState([]);
  const [treeId,  setTreeId]  = useState("");
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState(null);
  const [running, setRunning] = useState(false);
  const [log,     setLog]     = useState([]);
  const [done,    setDone]    = useState(false);
  const [stats,   setStats]   = useState(null);
  const logRef = useRef();
  useEffect(()=>{ if(logRef.current) logRef.current.scrollTop=logRef.current.scrollHeight; },[log]);

  useEffect(()=>{
    fetch(`${API}/api/webtrees/status`).then(r=>r.json()).then(d=>{
      setStatus(d);
      if(d.url) setUrl(d.url);
      if(d.trees) setTrees(d.trees);
      if(d.active_tree) setTreeId(d.active_tree);
    }).catch(()=>{});
  },[]);

  const connect = async () => {
    setBusy(true); setError(null);
    const r = await fetch(`${API}/api/webtrees/connect`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url,api_key:apiKey,tree_id:treeId})});
    const d = await r.json();
    if (!r.ok) setError(d.error);
    else { setStatus({connected:true,...d}); setTrees(d.trees||[]); }
    setBusy(false);
  };

  const startImport = async () => {
    setRunning(true); setLog([]); setDone(false); setStats(null);
    const r = await fetch(`${API}/api/webtrees/import`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tree_id:treeId})});
    if (!r.ok) { setRunning(false); return; }
    const es = new EventSource(`${API}/api/webtrees/import/status`);
    es.onmessage = e => {
      const d = JSON.parse(e.data);
      if(d.done){setDone(true);setStats(d.stats);setRunning(false);es.close();}
      else if(d.message) setLog(prev=>[...prev,d.message]);
    };
    es.onerror=()=>{setRunning(false);es.close();};
  };

  return (
    <div style={{maxWidth:600}}>
      <p style={{fontSize:12,color:"var(--text-secondary)",lineHeight:1.7,marginBottom:16}}>
        Connect to a <strong>Webtrees</strong> instance and import your family tree.
        Webtrees is a PHP genealogy web app — an alternative to Gramps Web for those who prefer it.
      </p>

      <Card style={{padding:16,marginBottom:20}}>
        {status?.connected&&(
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",background:"#0D2920",borderRadius:8,marginBottom:14,fontSize:12}}>
            <StatusDot ok />Connected · {status.url}
          </div>
        )}
        <SLabel>Webtrees connection</SLabel>
        <div style={{marginBottom:8}}>
          <input type="text" value={url} onChange={e=>setUrl(e.target.value)} placeholder="http://192.168.1.x:8080/webtrees" style={{width:"100%",fontSize:12,marginBottom:8}} />
          <input type="text" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="API key (Webtrees → My account → API keys)" style={{width:"100%",fontSize:12}} />
        </div>
        {error&&<div style={{fontSize:12,color:"#E07070",marginBottom:8}}>✗ {error}</div>}
        <button className="primary" onClick={connect} disabled={busy||!apiKey} style={{fontSize:12,padding:"6px 16px"}}>
          {busy?"Connecting…":status?.connected?"Reconnect":"Connect"}
        </button>
      </Card>

      {status?.connected && (
        <>
          {trees.length > 0 && (
            <div style={{marginBottom:16}}>
              <SLabel>Select tree</SLabel>
              <select value={treeId} onChange={e=>setTreeId(e.target.value)} style={{fontSize:13}}>
                <option value="">Choose a tree…</option>
                {trees.map(t=><option key={t.id||t.name} value={t.id||t.name}>{t.title||t.name}</option>)}
              </select>
            </div>
          )}

          <button className="primary" onClick={startImport} disabled={running||!treeId} style={{fontSize:14,padding:"9px 24px",marginBottom:16}}>
            {running?"Importing…":done?"Import again":"Import from Webtrees"}
          </button>

          {(running||log.length>0)&&<LogBox lines={log} running={running} logRef={logRef} />}

          {done&&stats&&(
            <div style={{display:"flex",gap:10,marginTop:12}}>
              {Object.entries(stats).map(([k,v])=>(
                <div key={k} style={{flex:1,background:"var(--bg-input)",borderRadius:8,padding:"10px 14px",textAlign:"center"}}>
                  <div style={{fontSize:18,fontWeight:600,color:k==="errors"&&v>0?"#E07070":"var(--accent)"}}>{v}</div>
                  <div style={{fontSize:11,color:"var(--text-secondary)",marginTop:3}}>{k}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── main tab ──────────────────────────────────────────────────────────────────

const TABS = [
  { id:"ocr",       label:"OCR",        icon:"🔍" },
  { id:"whisper",   label:"Whisper",    icon:"🎙" },
  { id:"geocode",   label:"Geocode",    icon:"🗺" },
  { id:"paperless", label:"Paperless",  icon:"📄" },
  { id:"webtrees",  label:"Webtrees",   icon:"🌲" },
];

export default function ToolsTab() {
  const [tab, setTab] = useState("ocr");

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>

      {/* toolbar */}
      <div style={{
        display:"flex", alignItems:"center",
        padding:"0 24px",
        borderBottom:"1px solid var(--border)",
        background:"var(--bg-sidebar)",
        flexShrink:0, overflowX:"auto",
      }}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            background:"none", border:"none",
            borderBottom:`2px solid ${tab===t.id?"var(--accent)":"transparent"}`,
            padding:"14px 16px 12px", fontSize:12, whiteSpace:"nowrap",
            fontWeight:tab===t.id?500:400,
            color:tab===t.id?"var(--text-primary)":"var(--text-secondary)",
            cursor:"pointer",
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* body */}
      <div style={{flex:1,overflowY:"auto",padding:"24px 28px"}}>
        {tab==="ocr"       && <OcrPanel />}
        {tab==="whisper"   && <WhisperPanel />}
        {tab==="geocode"   && <GeocodePanel />}
        {tab==="paperless" && <PaperlessPanel />}
        {tab==="webtrees"  && <WebtreesPanel />}
      </div>
    </div>
  );
}
