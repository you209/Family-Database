import { useState, useEffect } from "react";

// ── helpers ───────────────────────────────────────────────────────────────────

function useFetch(url) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    setLoading(true);
    setError(false);
    fetch(url)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [url]);
  return { data, loading, error };
}

// ── Skeleton placeholder ──────────────────────────────────────────────────────

function Skeleton({ w = "100%", h = 20, style = {} }) {
  return (
    <div style={{
      width: w, height: h,
      background: "var(--bg-sel)",
      borderRadius: 6,
      animation: "pulse 1.5s ease-in-out infinite",
      ...style,
    }} />
  );
}

// ── Card wrapper ──────────────────────────────────────────────────────────────

function Card({ title, children, style = {} }) {
  return (
    <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: 12,
      padding: "16px 20px",
      ...style,
    }}>
      {title && (
        <div style={{
          fontSize: 11, fontWeight: 600, letterSpacing: "0.09em",
          textTransform: "uppercase", color: "var(--text-tertiary)",
          marginBottom: 14,
        }}>
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

// ── Big number tile ───────────────────────────────────────────────────────────

function Tile({ label, value, sub, color }) {
  return (
    <div style={{
      flex: "1 1 100px",
      background: "var(--bg-sel)",
      borderRadius: 10,
      padding: "14px 16px",
      minWidth: 90,
    }}>
      <div style={{
        fontSize: 28, fontWeight: 700,
        color: color || "var(--text-primary)",
        lineHeight: 1.1,
      }}>
        {value ?? "—"}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Vertical bar chart (SVG) ──────────────────────────────────────────────────

function BarChart({ data, barColor = "var(--accent)", height = 200 }) {
  if (!data || data.length === 0) {
    return <div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>No data</div>;
  }
  const max = Math.max(...data.map(d => d.count));
  const barW = Math.max(8, Math.min(40, Math.floor(580 / data.length) - 4));
  const svgW = data.length * (barW + 4) + 20;
  const chartH = height - 28; // leave room for labels

  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={svgW} height={height} style={{ display: "block" }}>
        {data.map((d, i) => {
          const barH = max > 0 ? Math.round((d.count / max) * chartH) : 0;
          const x = i * (barW + 4) + 10;
          const y = chartH - barH;
          return (
            <g key={i}>
              <rect
                x={x} y={y}
                width={barW} height={barH}
                fill={barColor}
                rx={3}
                opacity={0.85}
              />
              {/* label */}
              <text
                x={x + barW / 2} y={height - 4}
                textAnchor="middle"
                fontSize={9}
                fill="var(--text-tertiary)"
              >
                {d.decade ?? d.label}
              </text>
              {/* count on top */}
              {barH > 14 && (
                <text
                  x={x + barW / 2} y={y + 12}
                  textAnchor="middle"
                  fontSize={9}
                  fill="#fff"
                  opacity={0.9}
                >
                  {d.count}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Horizontal bar list ───────────────────────────────────────────────────────

function HBarList({ data, nameKey = "name", countKey = "count", barColor = "var(--accent)" }) {
  if (!data || data.length === 0) {
    return <div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>No data</div>;
  }
  const max = Math.max(...data.map(d => d[countKey]));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {data.map((d, i) => {
        const pct = max > 0 ? (d[countKey] / max) * 100 : 0;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <div style={{
              width: 100, flexShrink: 0,
              color: "var(--text-secondary)",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {d[nameKey]}
            </div>
            <div style={{
              flex: 1, height: 14, background: "var(--bg-sel)",
              borderRadius: 3, overflow: "hidden",
            }}>
              <div style={{
                width: `${pct}%`, height: "100%",
                background: barColor, borderRadius: 3,
                opacity: 0.85,
              }} />
            </div>
            <div style={{ width: 28, textAlign: "right", color: "var(--text-primary)", fontWeight: 500 }}>
              {d[countKey]}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Gender bar ────────────────────────────────────────────────────────────────

function GenderBar({ split }) {
  if (!split) return <Skeleton h={28} />;
  const total = (split.M || 0) + (split.F || 0) + (split.U || 0);
  if (total === 0) return <div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>No data</div>;
  const pM = ((split.M || 0) / total * 100).toFixed(1);
  const pF = ((split.F || 0) / total * 100).toFixed(1);
  const pU = ((split.U || 0) / total * 100).toFixed(1);
  const segments = [
    { pct: pM, color: "#4A90D9", label: "Male", count: split.M || 0 },
    { pct: pF, color: "#E07AB0", label: "Female", count: split.F || 0 },
    { pct: pU, color: "#888", label: "Unknown", count: split.U || 0 },
  ].filter(s => s.count > 0);

  return (
    <div>
      <div style={{ display: "flex", height: 28, borderRadius: 6, overflow: "hidden", marginBottom: 10 }}>
        {segments.map((s, i) => (
          <div
            key={i}
            style={{ width: `${s.pct}%`, background: s.color, transition: "width 0.3s" }}
            title={`${s.label}: ${s.count} (${s.pct}%)`}
          />
        ))}
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {segments.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color }} />
            <span style={{ color: "var(--text-secondary)" }}>{s.label}</span>
            <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{s.count}</span>
            <span style={{ color: "var(--text-tertiary)" }}>({s.pct}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Events by type: pill list ─────────────────────────────────────────────────

function EventTypePills({ data }) {
  if (!data || data.length === 0) return <Skeleton h={20} />;
  const max = Math.max(...data.map(d => d.count));
  const COLORS = ["#1D9E75","#4A90D9","#E07AB0","#F5A623","#9B59B6","#E74C3C","#2ECC71","#3498DB"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {data.map((d, i) => {
        const pct = max > 0 ? (d.count / max * 100).toFixed(0) : 0;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <div style={{
              width: 80, flexShrink: 0,
              color: "var(--text-secondary)",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {d.type}
            </div>
            <div style={{
              flex: 1, height: 12, background: "var(--bg-sel)",
              borderRadius: 3, overflow: "hidden",
            }}>
              <div style={{
                width: `${pct}%`, height: "100%",
                background: COLORS[i % COLORS.length],
                borderRadius: 3, opacity: 0.8,
              }} />
            </div>
            <div style={{ width: 32, textAlign: "right", color: "var(--text-primary)", fontWeight: 500 }}>
              {d.count}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Donut SVG ─────────────────────────────────────────────────────────────────

function DonutChart({ data, size = 120 }) {
  if (!data || data.length === 0) return null;
  const COLORS = ["#1D9E75","#4A90D9","#E07AB0","#F5A623","#9B59B6","#E74C3C","#2ECC71","#3498DB"];
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return null;

  const cx = size / 2, cy = size / 2;
  const r = size * 0.38, inner = size * 0.22;

  let currentAngle = -Math.PI / 2;
  const arcs = data.slice(0, 8).map((d, i) => {
    const angle = (d.count / total) * 2 * Math.PI;
    const startAngle = currentAngle;
    currentAngle += angle;
    const endAngle = currentAngle;

    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const xi1 = cx + inner * Math.cos(endAngle);
    const yi1 = cy + inner * Math.sin(endAngle);
    const xi2 = cx + inner * Math.cos(startAngle);
    const yi2 = cy + inner * Math.sin(startAngle);

    const largeArc = angle > Math.PI ? 1 : 0;
    const pathD = [
      `M ${x1} ${y1}`,
      `A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${xi1} ${yi1}`,
      `A ${inner} ${inner} 0 ${largeArc} 0 ${xi2} ${yi2}`,
      "Z",
    ].join(" ");

    return { pathD, color: COLORS[i % COLORS.length] };
  });

  return (
    <svg width={size} height={size} style={{ display: "block" }}>
      {arcs.map((a, i) => (
        <path key={i} d={a.pathD} fill={a.color} opacity={0.85} />
      ))}
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11} fill="var(--text-tertiary)">
        {total}
      </text>
    </svg>
  );
}

// ── Calendar mini-grid ────────────────────────────────────────────────────────

function MiniCalendar({ year, month, events, selectedDay, onSelectDay }) {
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  // Build set of days with events
  const eventDays = new Set(events.map(e => e.day));

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && (today.getMonth() + 1) === month;

  return (
    <div>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
        gap: 2, marginBottom: 4,
      }}>
        {dayNames.map(n => (
          <div key={n} style={{
            textAlign: "center", fontSize: 10,
            color: "var(--text-tertiary)", fontWeight: 600, padding: "2px 0",
          }}>
            {n}
          </div>
        ))}
        {cells.map((d, i) => {
          const hasEvent = d && eventDays.has(d);
          const isToday = isCurrentMonth && d === today.getDate();
          const isSelected = d === selectedDay;
          return (
            <div
              key={i}
              onClick={() => d && onSelectDay(isSelected ? null : d)}
              style={{
                textAlign: "center", fontSize: 11,
                padding: "3px 1px",
                borderRadius: 5,
                cursor: d ? "pointer" : "default",
                background: isSelected
                  ? "var(--accent)"
                  : isToday
                    ? "var(--bg-sel)"
                    : "transparent",
                color: isSelected
                  ? "#fff"
                  : isToday
                    ? "var(--text-primary)"
                    : d ? "var(--text-secondary)" : "transparent",
                fontWeight: isToday ? 700 : 400,
                position: "relative",
              }}
            >
              {d || ""}
              {hasEvent && !isSelected && (
                <div style={{
                  position: "absolute", bottom: 1, left: "50%",
                  transform: "translateX(-50%)",
                  width: 4, height: 4, borderRadius: "50%",
                  background: "var(--accent)",
                }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Upcoming event row ────────────────────────────────────────────────────────

function EventRow({ ev }) {
  const icon = ev.type === "birthday" ? "🎂" : "💍";
  const sub = ev.type === "birthday"
    ? ev.age != null ? `Turns ${ev.age}` : null
    : ev.years != null ? `${ev.years} years` : null;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 0",
      borderBottom: "1px solid var(--border)",
    }}>
      <div style={{
        width: 36, height: 36, flexShrink: 0,
        background: "var(--bg-sel)", borderRadius: 8,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 18,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 500, color: "var(--text-primary)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {ev.name || ev.names}
        </div>
        {sub && (
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 1 }}>
            {sub}
          </div>
        )}
      </div>
      <div style={{
        fontSize: 13, fontWeight: 700, color: "var(--accent)",
        flexShrink: 0,
      }}>
        {ev.day ? `${ev.month ?? ""}/${ev.day}` : ""}
      </div>
    </div>
  );
}

// ── CalendarPanel ─────────────────────────────────────────────────────────────

function CalendarPanel() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [selectedDay, setSelectedDay] = useState(null);

  const { data: calData, loading: calLoading } = useFetch(
    `/api/stats/calendar?month=${month}&year=${year}`
  );
  const { data: upcomingData, loading: upLoading } = useFetch(
    "/api/stats/upcoming?days=30"
  );

  const MONTHS = ["January","February","March","April","May","June",
                  "July","August","September","October","November","December"];

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
    setSelectedDay(null);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
    setSelectedDay(null);
  };

  const calEvents = calData?.events || [];
  const dayEvents = selectedDay
    ? calEvents.filter(e => e.day === selectedDay)
    : [];
  const upcomingEvents = upcomingData?.events || [];

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "minmax(200px, 280px) 1fr",
      gap: 16,
      marginTop: 24,
    }}>
      {/* Mini calendar */}
      <Card title="Calendar">
        {/* Month nav */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <button
            onClick={prevMonth}
            style={{
              background: "none", border: "none",
              color: "var(--text-secondary)", cursor: "pointer", fontSize: 16, padding: "2px 6px",
            }}
          >
            ‹
          </button>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            {MONTHS[month - 1]} {year}
          </span>
          <button
            onClick={nextMonth}
            style={{
              background: "none", border: "none",
              color: "var(--text-secondary)", cursor: "pointer", fontSize: 16, padding: "2px 6px",
            }}
          >
            ›
          </button>
        </div>

        {calLoading ? (
          <Skeleton h={120} />
        ) : (
          <MiniCalendar
            year={year}
            month={month}
            events={calEvents}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
          />
        )}

        {/* Selected day events */}
        {selectedDay && dayEvents.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 6, fontWeight: 600 }}>
              {MONTHS[month - 1]} {selectedDay}
            </div>
            {dayEvents.map((ev, i) => (
              <EventRow key={i} ev={{ ...ev, month }} />
            ))}
          </div>
        )}
        {selectedDay && dayEvents.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 10 }}>
            No events on {MONTHS[month - 1]} {selectedDay}
          </div>
        )}
      </Card>

      {/* Upcoming list */}
      <Card title="Upcoming — next 30 days">
        {upLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[1,2,3,4,5].map(i => <Skeleton key={i} h={48} />)}
          </div>
        ) : upcomingEvents.length === 0 ? (
          <div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>
            No upcoming birthdays or anniversaries in the next 30 days.
          </div>
        ) : (
          <div>
            {upcomingEvents.map((ev, i) => (
              <EventRow key={i} ev={ev} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Main StatsTab ─────────────────────────────────────────────────────────────

export default function StatsTab() {
  const { data, loading } = useFetch("/api/stats/overview");

  const gridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: 16,
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
      `}</style>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24, color: "var(--text-primary)" }}>
        Statistics
      </h1>

      <div style={gridStyle}>
        {/* Overview numbers */}
        <Card title="Overview" style={{ gridColumn: "span 2" }}>
          {loading ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[1,2,3,4,5,6].map(i => <Skeleton key={i} w={100} h={70} style={{ borderRadius: 10 }} />)}
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Tile label="People"   value={data?.totals?.persons}  color="var(--accent)" />
              <Tile label="Families" value={data?.totals?.families} />
              <Tile label="Events"   value={data?.totals?.events}   />
              <Tile label="Places"   value={data?.totals?.places}   />
              <Tile label="Media"    value={data?.totals?.media}    />
              <Tile
                label="Year range"
                value={data?.year_range?.length === 2 ? `${data.year_range[0]}` : "—"}
                sub={data?.year_range?.length === 2 ? `to ${data.year_range[1]}` : undefined}
              />
            </div>
          )}
        </Card>

        {/* Gender split */}
        <Card title="Gender split">
          {loading ? <Skeleton h={60} /> : <GenderBar split={data?.gender_split} />}
        </Card>

        {/* Lifespan & depth */}
        <Card title="Lifespan & depth">
          {loading ? (
            <div style={{ display: "flex", gap: 8 }}>
              <Skeleton w="50%" h={70} style={{ borderRadius: 10 }} />
              <Skeleton w="50%" h={70} style={{ borderRadius: 10 }} />
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <Tile
                label="Avg lifespan"
                value={data?.avg_lifespan != null ? `${data.avg_lifespan}y` : "—"}
                color="var(--accent)"
              />
              <Tile
                label="Generation depth"
                value={data?.generation_depth ?? "—"}
              />
              <Tile
                label="Living"
                value={data?.living_count ?? "—"}
                color="#4A90D9"
              />
            </div>
          )}
        </Card>

        {/* Births by decade */}
        <Card title="Births by decade">
          {loading
            ? <Skeleton h={200} />
            : <BarChart data={data?.births_by_decade} barColor="var(--accent)" height={200} />
          }
        </Card>

        {/* Deaths by decade */}
        <Card title="Deaths by decade">
          {loading
            ? <Skeleton h={200} />
            : <BarChart data={data?.deaths_by_decade} barColor="#B05050" height={200} />
          }
        </Card>

        {/* Top surnames */}
        <Card title="Top surnames">
          {loading
            ? <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[1,2,3,4,5].map(i => <Skeleton key={i} h={14} />)}
              </div>
            : <HBarList data={data?.top_surnames} barColor="var(--accent)" />
          }
        </Card>

        {/* Top places */}
        <Card title="Top places">
          {loading
            ? <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[1,2,3,4,5].map(i => <Skeleton key={i} h={14} />)}
              </div>
            : <HBarList data={data?.top_places} barColor="#4A90D9" />
          }
        </Card>

        {/* Events by type */}
        <Card title="Events by type" style={{ gridColumn: "span 2" }}>
          {loading
            ? <Skeleton h={160} />
            : (
              <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
                <DonutChart data={data?.events_by_type} size={120} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <EventTypePills data={data?.events_by_type} />
                </div>
              </div>
            )
          }
        </Card>
      </div>

      {/* Calendar section */}
      <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 32, marginBottom: 4, color: "var(--text-primary)" }}>
        Family Calendar
      </h2>
      <CalendarPanel />
    </div>
  );
}
