import { useState, useId, useRef, useEffect } from "react";
import {
  Building2,
  UsersRound,
  MapPin,
  CalendarCheck2,
  BadgeIndianRupee,
  TrendingUp,
  TrendingDown,
  CalendarDays,
  ArrowUpRight,
  ArrowRight,
  ChevronRight,
  Phone,
  FileText,
  CheckCheck,
  MessageCircle,
  CalendarClock,
  BriefcaseBusiness,
  BookmarkCheck,
} from "lucide-react";
import {
  useApp,
  useLoad,
  qs,
  navigate,
  fmtN,
  money,
  fmtDate,
  fmtTime,
  Avatar,
  Badge,
  Select,
  FilterBar,
  Empty,
  DataState,
  code,
} from "./lib";
export function smooth(pts) {
  if (!pts.length) return "";
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1],
      b = pts[i],
      p = pts[i - 2] || a,
      n = pts[i + 1] || b;
    d += ` C ${a[0] + (b[0] - p[0]) / 6},${a[1] + (b[1] - p[1]) / 6} ${b[0] - (n[0] - a[0]) / 6},${b[1] - (n[1] - a[1]) / 6} ${b[0]},${b[1]}`;
  }
  return d;
}
const metricMeta = [
  {
    title: "Total leads",
    icon: UsersRound,
    color: "#477aeb",
    theme: "blue",
    path: "leads",
  },
  {
    title: "Site visits",
    icon: MapPin,
    color: "#9270d9",
    theme: "purple",
    path: "visits",
  },
  {
    title: "Bookings",
    icon: BookmarkCheck,
    color: "#20a786",
    theme: "green",
    path: "bookings",
  },
  {
    title: "Booking value",
    icon: BadgeIndianRupee,
    color: "#dc9a34",
    theme: "amber",
    path: "bookings",
  },
];
function Spark({ i, color, values }) {
  const gid = useId().replace(/:/g, "");
  const seq =
    values?.length > 1 ? values : [values?.[0] || 0, values?.[0] || 0];
  const max = Math.max(...seq),
    min = Math.min(...seq);
  const pts = seq.map((a, j) => [
    (j * 84) / (seq.length - 1),
    30 - ((a - min) / (max - min || 1)) * 24,
  ]);
  const d = smooth(pts);
  return (
    <svg className="spark" viewBox="-1 0 87 36" aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L84,36 L0,36 Z`} fill={`url(#${gid})`} />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}
export function Metrics({ d, f }) {
  const { allowed } = useApp();
  return (
    <div className="metrics">
      {metricMeta.map((m, i) => {
        const Icon = m.icon,
          change = d.previous[i]
            ? ((d.current[i] - d.previous[i]) / d.previous[i]) * 100
            : null;
        const actionable = allowed(
          i === 0 ? "readLeads" : i === 1 ? "visits" : "quote",
        );
        const Tag = actionable ? "button" : "div";
        const go = () => {
          if (actionable)
            navigate(m.path, {
              ...f,
              ...(i >= 2 ? { status: "Confirmed" } : {}),
            });
        };
        return (
          <Tag
            key={m.title}
            className="metric-card"
            onClick={go}
            aria-label={"View " + m.title.toLowerCase()}
          >
            <div className="metric-top">
              <span className={"metric-icon " + m.theme}>
                <Icon size={17} strokeWidth={1.85} />
              </span>
              <span>{m.title}</span>
            </div>
            <div className="metric-value">
              <strong>
                {i === 3 ? money(d.current[i]) : fmtN(d.current[i])}
              </strong>
              <Spark
                i={i}
                color={m.color}
                values={d.sparklines?.[i] || d.trend.map((x) => x.value)}
              />
            </div>
            <div className="metric-foot">
              <span className={"delta " + (change < 0 ? "down" : "")}>
                {change < 0 ? (
                  <TrendingDown size={11} />
                ) : (
                  <TrendingUp size={11} />
                )}{" "}
                {change == null ? "New" : Math.abs(change).toFixed(1) + "%"}
              </span>
              <span>
                {(f.period || "This month") === "This month"
                  ? "vs last month"
                  : "vs prior period"}
              </span>
            </div>
          </Tag>
        );
      })}
    </div>
  );
}
export function Trend({ d }) {
  const plot = useRef(null),
    [bounds, setBounds] = useState({ width: 660, height: 162 });
  useEffect(() => {
    if (!plot.current) return;
    const observer = new ResizeObserver((es) => {
      const r = es[0].contentRect;
      setBounds({
        width: Math.max(170, Math.round(r.width)),
        height: Math.max(90, Math.round(r.height)),
      });
    });
    observer.observe(plot.current);
    return () => observer.disconnect();
  }, []);
  const [group, setGroup] = useState("Daily"),
    [hover, setHover] = useState(null);
  let rows = d.trend;
  if (group === "Weekly") {
    rows = rows.reduce((a, r, i) => {
      if (i % 7 === 0) a.push({ ...r });
      else {
        a.at(-1).value += r.value;
        a.at(-1).previous += r.previous;
      }
      return a;
    }, []);
  }
  const w = bounds.width,
    h = bounds.height,
    left = 28,
    right = 10,
    top = 8,
    bottom = 26,
    plotH = h - bottom - top,
    plotW = w - left - right;
  const highest = Math.max(1, ...rows.flatMap((v) => [v.value, v.previous]));
  const step = Math.max(5, Math.ceil(highest / 4 / 5) * 5),
    max = step * 4;
  const x = (i) =>
      left + (rows.length > 1 ? (i * plotW) / (rows.length - 1) : plotW / 2),
    y = (v) => top + plotH * (1 - v / max);
  const a = rows.map((v, i) => [x(i), y(v.value)]),
    b = rows.map((v, i) => [x(i), y(v.previous)]),
    path = smooth(a);
  const gid = useId().replace(/:/g, "");
  const sel = hover != null ? rows[hover] : null;
  const labels = new Set(
    Array.from({ length: Math.min(w < 450 ? 5 : 7, rows.length) }, (_, i) =>
      Math.round(
        (i * (rows.length - 1)) /
          (Math.min(w < 450 ? 5 : 7, rows.length) - 1 || 1),
      ),
    ),
  );
  return (
    <section className="panel trend-panel">
      <div className="panel-head">
        <div>
          <h2>Lead generation trend</h2>
          <p>Incoming enquiries across your projects</p>
        </div>
        <Select
          label="Chart interval"
          small
          value={group}
          options={["Daily", "Weekly"]}
          onChange={(v) => {
            setGroup(v);
            setHover(null);
          }}
        />
      </div>
      <div className="chart-legend">
        <span>
          <i className="line-key" />
          Current period
        </span>
        <span>
          <i className="line-key previous" />
          Previous period
        </span>
      </div>
      <div
        className="trend-chart"
        ref={plot}
        onMouseLeave={() => setHover(null)}
      >
        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${group} lead generation, current period compared with the previous period`}
          onMouseMove={(e) => {
            let rect = e.currentTarget.getBoundingClientRect();
            setHover(
              Math.min(
                rows.length - 1,
                Math.max(
                  0,
                  Math.round(
                    ((((e.clientX - rect.left) / rect.width) * w - left) /
                      plotW) *
                      (rows.length - 1),
                  ),
                ),
              ),
            );
          }}
        >
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4a82ff" stopOpacity=".18" />
              <stop offset="100%" stopColor="#4a82ff" stopOpacity=".015" />
            </linearGradient>
          </defs>
          {Array.from({ length: 5 }, (_, i) => (
            <g key={i}>
              <text x={left - 10} y={y(i * step) + 3.5} textAnchor="end">
                {fmtN(i * step)}
              </text>
              <line
                x1={left}
                x2={w - right}
                y1={y(i * step)}
                y2={y(i * step)}
                stroke="#e8edf3"
                strokeDasharray="3 4"
              />
            </g>
          ))}
          <path
            d={`${path} L${x(rows.length - 1)},${h - bottom} L${x(0)},${h - bottom} Z`}
            fill={`url(#${gid})`}
          />
          <path
            d={smooth(b)}
            stroke="#aebfd7"
            strokeWidth="2"
            strokeDasharray="5 6"
            strokeLinecap="round"
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={path}
            stroke="#3976f2"
            strokeWidth="2.7"
            fill="none"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {rows.map(
            (r, i) =>
              labels.has(i) && (
                <text
                  key={i}
                  x={x(i)}
                  y={h - 3}
                  textAnchor={
                    i === rows.length - 1 ? "end" : i === 0 ? "start" : "middle"
                  }
                >
                  {fmtDate(r.date, { day: "2-digit", month: "short" })}
                </text>
              ),
          )}
          {sel && (
            <g>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={top}
                y2={h - bottom}
                stroke="#b7c6df"
                strokeDasharray="3 3"
              />
              <circle
                cx={x(hover)}
                cy={y(sel.value)}
                r="4.5"
                fill="#3976f2"
                stroke="white"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>
        {sel && (
          <div
            className="chart-tooltip"
            style={{
              left: Math.max(15, Math.min(82, (x(hover) / w) * 100)) + "%",
            }}
          >
            <b>{fmtDate(sel.date, { day: "numeric", month: "short" })}</b>
            <span>
              Current: {sel.value} · Previous: {sel.previous}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
export const taskMeta = (type) =>
  ({
    Call: [Phone, "blue"],
    Callback: [Phone, "blue"],
    "Site visit": [MapPin, "purple"],
    Quotation: [FileText, "amber"],
    WhatsApp: [MessageCircle, "green"],
    Meeting: [BriefcaseBusiness, "purple"],
  })[type] || [CalendarCheck2, "blue"];
function WorkPanel({ tasks }) {
  const { open } = useApp();
  return (
    <section className="panel work-panel">
      <div className="panel-head">
        <div>
          <h2>
            Today’s work <span className="count-chip">{tasks.length}</span>
          </h2>
          <p>Your scheduled activities for today</p>
        </div>
        <span className="work-cal">
          <CalendarClock size={18} strokeWidth={1.6} />
        </span>
      </div>
      <div className="task-snippets">
        {tasks.length ? (
          tasks.slice(0, 3).map((t) => {
            const [Icon, color] = taskMeta(t.type);
            return (
              <button
                key={t.id}
                className="task-snippet"
                onClick={() => open("task-detail", t)}
              >
                <span className={"task-symbol " + color}>
                  <Icon size={16} strokeWidth={1.8} />
                </span>
                <span className="task-text">
                  <strong>{t.subject}</strong>
                  <small>{t.project}</small>
                </span>
                <span className="task-time">{fmtTime(t.due_at)}</span>
              </button>
            );
          })
        ) : (
          <div className="inline-empty">
            <CheckCheck size={20} />
            You’re all caught up for today.
          </div>
        )}
      </div>
      <button className="panel-foot-link" onClick={() => navigate("my-work")}>
        View my work <ArrowRight size={14} />
      </button>
    </section>
  );
}
export function ProjectCard({ p }) {
  return (
    <button
      className="project-card"
      onClick={() => navigate("projects/" + p.id)}
    >
      <div className={"project-img " + (!p.image ? "placeholder-image" : "")}>
        {p.image ? (
          <img src={p.image} alt={p.name + " development"} loading="lazy" />
        ) : (
          <Building2 size={38} />
        )}
        <span className="image-status">
          <i />
          {p.status}
        </span>
        <span className="image-open">
          <ArrowUpRight size={16} />
        </span>
      </div>
      <div className="project-body">
        <div className="project-kind">
          {p.category}
          <span>·</span>
          {p.units} units
        </div>
        <h3>{p.name}</h3>
        <div className="project-location">
          <MapPin size={13} />
          {p.location}
        </div>
        <div className="project-bottom">
          <span>
            <i />
            {p.available} available
          </span>
          <b>{fmtN(p.leads)} leads</b>
        </div>
      </div>
    </button>
  );
}
export function RecentLeads({ items }) {
  return (
    <section className="panel recent-panel">
      <div className="panel-head">
        <div>
          <h2>Recent enquiries</h2>
          <p>The latest leads in your workspace</p>
        </div>
        <button className="text-link" onClick={() => navigate("leads")}>
          View all leads <ArrowRight size={14} />
        </button>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Project</th>
              <th>Source</th>
              <th>Stage</th>
              <th>Lead owner</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((l) => (
              <tr key={l.id} onClick={() => navigate("leads/" + l.id)}>
                <td>
                  <div className="person-cell">
                    <Avatar name={l.name} />
                    <div>
                      <b>{l.name}</b>
                      <small>{code("LD", l.id)}</small>
                    </div>
                  </div>
                </td>
                <td>{l.project}</td>
                <td>{l.source}</td>
                <td>
                  <Badge>{l.stage}</Badge>
                </td>
                <td>{l.owner || "Unassigned"}</td>
                <td>
                  <ChevronRight size={14} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && (
          <Empty
            title="No enquiries in this period"
            text="Your new leads will appear here."
          />
        )}
      </div>
    </section>
  );
}
export default function Dashboard() {
  const { boot, allowed } = useApp();
  const [f, setF] = useState({ project: "", period: "This month" });
  const state = useLoad("/dashboard" + qs(f));
  return (
    <>
      <section className="welcome-banner">
        <div className="hero-lines" />
        <div className="welcome-content">
          <div className="welcome-kicker">
            <span />
            {[
              "Super Admin",
              "CRM Admin",
              "Sales Manager",
              "Sales Head",
            ].includes(boot.user.role)
              ? "MANAGEMENT WORKSPACE"
              : "MY SALES WORKSPACE"}
          </div>
          <h1>
            Good{" "}
            {new Date().getUTCHours() < 12
              ? "morning"
              : new Date().getUTCHours() < 18
                ? "afternoon"
                : "evening"}
            , {boot.user.name.split(" ")[0]}
          </h1>
          <p>Here’s what’s happening across your real estate portfolio.</p>
        </div>
        <div className="welcome-date">
          <CalendarDays size={13} />
          {fmtDate(boot.today, {
            weekday: "short",
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </div>
      </section>
      <div className="section-row performance-head">
        <div className="heading-inline">
          <h2>Performance overview</h2>
          <span
            className="live-label"
            title="Refreshes every minute while this workspace is visible"
          >
            <i />
            Live
          </span>
        </div>
        <FilterBar f={f} set={setF} />
      </div>
      <DataState state={state}>
        {(d) => (
          <>
            <Metrics d={d} f={f} />
            <div className="analysis-grid">
              <Trend d={d} />
              {allowed("activity") ? (
                <WorkPanel tasks={d.tasks} />
              ) : (
                <section className="panel padded">
                  <h2>Inventory availability</h2>
                  <p className="muted">Available units by project</p>
                  {d.projects.map((p) => (
                    <button
                      key={p.id}
                      className="attention-row"
                      onClick={() => navigate("projects/" + p.id)}
                    >
                      {p.name}
                      <b>{p.available} units</b>
                      <ArrowRight size={13} />
                    </button>
                  ))}
                </section>
              )}
            </div>
            <section className="portfolio-section">
              <div className="section-row">
                <div className="heading-inline">
                  <h2>Project portfolio</h2>
                  <span className="neutral-count">
                    {d.projects.length} projects
                  </span>
                </div>
                <button
                  className="text-link"
                  onClick={() => navigate("projects")}
                >
                  View all projects <ArrowRight size={14} />
                </button>
              </div>
              <div className="project-grid">
                {d.projects.slice(0, 3).map((p) => (
                  <ProjectCard key={p.id} p={p} />
                ))}
              </div>
              {!d.projects.length && (
                <Empty
                  title="Your portfolio starts here"
                  text="Add a project to organize leads and inventory."
                />
              )}
            </section>
            {allowed("readLeads") && <RecentLeads items={d.recent} />}
          </>
        )}
      </DataState>
    </>
  );
}
