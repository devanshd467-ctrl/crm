import {
  CalendarView,
  ManagementMetrics,
  RoutingRules,
  IntegrationInbox,
  PartnerReviews,
} from "./extra";
import { useState } from "react";
import {
  Plus,
  CalendarCheck2,
  Phone,
  MessageCircle,
  MapPin,
  FileText,
  Handshake,
  Building2,
  Layers3,
  Grid2X2,
  Table2,
  ChevronRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Download,
  Upload,
  UsersRound,
  CheckCheck,
  ShieldCheck,
  CalendarDays,
  Megaphone,
  Link2,
  Globe,
  Check,
  Settings2,
  Bell,
  BellRing,
  Target,
  BookmarkCheck,
} from "lucide-react";
import {
  useApp,
  useLoad,
  useDebounce,
  api,
  qs,
  navigate,
  money,
  fmtN,
  fmtDate,
  stamp,
  Avatar,
  Badge,
  Button,
  IconButton,
  Select,
  FilterBar,
  SearchBox,
  Pager,
  Empty,
  DataState,
  ErrorBox,
  PageHead,
  Tabs,
  Modal,
  Field,
  code,
  download,
  csv,
} from "./lib";
import { ProjectCard, Trend, Metrics, taskMeta } from "./dashboard";
import { Timeline } from "./leads";
const recordConfig = {
  tasks: {
    title: "Follow-ups & tasks",
    sub: "Keep track of your team’s next actions and customer commitments.",
    cta: "Add follow-up",
    label: "Subject",
    statuses: ["Open", "In Progress", "Completed", "Cancelled"],
    icon: CalendarCheck2,
  },
  calls: {
    title: "Call management",
    sub: "Review conversations, outcomes, and the next step for each customer.",
    cta: "Log call",
    label: "Customer",
    statuses: [
      "Connected",
      "No Answer",
      "Busy",
      "Callback Requested",
      "Wrong Number",
      "Call Failed",
    ],
    icon: Phone,
  },
  visits: {
    title: "Site visits",
    sub: "Schedule property walkthroughs, check in visitors, and capture feedback.",
    cta: "Schedule visit",
    label: "Customer",
    statuses: [
      "Scheduled",
      "Confirmed",
      "Checked in",
      "Completed",
      "Rescheduled",
      "Cancelled",
      "No Show",
    ],
    icon: MapPin,
  },
  meetings: {
    title: "Field meetings",
    sub: "Plan and track outside business meetings with customers and partners.",
    cta: "Schedule meeting",
    label: "Meeting",
    statuses: [
      "Scheduled",
      "Confirmed",
      "Completed",
      "Rescheduled",
      "Cancelled",
    ],
    icon: Handshake,
  },
  messages: {
    title: "Communications",
    sub: "Prepare opted-in WhatsApp conversations and review communication history.",
    cta: "Prepare message",
    label: "Customer",
    statuses: ["Chat opened"],
    icon: MessageCircle,
  },
  quotations: {
    title: "Quotations & cost sheets",
    sub: "Create unit-level cost sheets with approved pricing, discounts, and taxes.",
    cta: "Create quotation",
    label: "Quotation",
    statuses: ["Approved", "Pending approval", "Sent", "Superseded"],
    icon: FileText,
  },
  bookings: {
    title: "Booking management",
    sub: "Review booking requests, confirm approved sales, and lock inventory.",
    cta: "Request booking",
    label: "Booking",
    statuses: ["Pending approval", "Confirmed", "Rejected"],
    icon: BookmarkCheck,
  },
};
export function Records({ type, query = {}, mine = false }) {
  const { boot, open } = useApp(),
    c = recordConfig[type],
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(query.status || "All"),
    [when, setWhen] = useState(mine ? "Today" : "All dates"),
    [display, setDisplay] = useState("List"),
    [date, setDate] = useState(""),
    [project, setProject] = useState(query.project || ""),
    [page, setPage] = useState(1),
    deb = useDebounce(search);
  const f = {
    ...query,
    q: deb,
    status,
    when,
    project,
    date,
    mine: mine ? "1" : "",
    page,
    size: 15,
  };
  const state = useLoad("/" + type + qs(f));
  const dated = ["tasks", "visits", "meetings"].includes(type);
  const setFilter = (fn, v) => {
    fn(v);
    setPage(1);
  };
  return (
    <>
      <PageHead
        eyebrow={
          mine
            ? "PERSONAL WORKSPACE"
            : type === "quotations" || type === "bookings"
              ? "PROPERTY & SALES"
              : "SALES ACTIVITY"
        }
        title={mine ? "My today’s work" : c.title}
        sub={
          mine
            ? "Your personal activity queue, organized around what needs attention."
            : c.sub
        }
      >
        <Button
          kind="primary"
          icon={Plus}
          onClick={() => open(type, query.lead ? { lead_id: query.lead } : {})}
        >
          {c.cta}
        </Button>
      </PageHead>
      {mine && (
        <div className="work-banner">
          <span className="task-symbol blue">
            <CalendarCheck2 size={23} />
          </span>
          <div>
            <b>
              {fmtDate(boot.today, {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </b>
            <p>
              {boot.workCount
                ? `${boot.workCount} activities are on your schedule today.`
                : "You have no open activities scheduled for today."}
            </p>
          </div>
          <Badge color="blue">My workspace</Badge>
        </div>
      )}
      <section className="panel list-panel">
        <div className="list-top">
          <div className="heading-inline">
            <h2>
              {mine
                ? "My activity queue"
                : c.title.split(" & ")[0] + " directory"}
            </h2>
            <span className="neutral-count">
              {fmtN(state.data?.total || 0)}
            </span>
          </div>
          <Select
            icon={Building2}
            label="Filter records by project"
            value={project}
            onChange={(v) => setFilter(setProject, v)}
            options={[
              { value: "", label: "All projects" },
              ...boot.projects.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        </div>
        <div className="list-tools">
          <SearchBox
            value={search}
            onChange={(v) => setFilter(setSearch, v)}
            placeholder="Search customer or project…"
          />
          <Select
            label="Record status"
            value={status}
            onChange={(v) => setFilter(setStatus, v)}
            options={[
              {
                value: "All",
                label: type === "calls" ? "All outcomes" : "All statuses",
              },
              ...c.statuses,
            ]}
          />
          {dated && display === "List" && (
            <Select
              icon={CalendarDays}
              label="Activity dates"
              value={when}
              onChange={(v) => setFilter(setWhen, v)}
              options={["All dates", "Today", "Upcoming", "Overdue"]}
            />
          )}{" "}
          {dated && (
            <IconButton
              icon={display === "List" ? CalendarDays : Table2}
              label={display === "List" ? "Show calendar" : "Show list"}
              onClick={() =>
                setDisplay(display === "List" ? "Calendar" : "List")
              }
            />
          )}
        </div>
        {date && display === "List" && (
          <div className="active-filters">
            <button onClick={() => setDate("")}>{fmtDate(date)} · Clear</button>
          </div>
        )}
        {display === "Calendar" ? (
          <CalendarView
            type={type}
            project={project}
            mine={mine}
            q={deb}
            status={status}
            onPick={(date) => {
              setDate(date);
              setWhen("All dates");
              setPage(1);
              setDisplay("List");
            }}
          />
        ) : (
          <DataState state={state}>
            {(r) => (
              <>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>{c.label}</th>
                        <th>Project</th>
                        <th>
                          {type === "calls"
                            ? "Direction"
                            : type === "tasks"
                              ? "Task type"
                              : type === "quotations" || type === "bookings"
                                ? "Unit"
                                : "Owner"}
                        </th>
                        <th>{type === "calls" ? "Outcome" : "Status"}</th>
                        <th>
                          {type === "quotations" || type === "bookings"
                            ? "Value"
                            : dated
                              ? "Scheduled for"
                              : "Created"}
                        </th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {r.items.map((x) => {
                        const [Ic, color] =
                          type === "tasks"
                            ? taskMeta(x.type)
                            : [c.icon, "blue"];
                        return (
                          <tr
                            key={x.id}
                            onClick={() => open("record", { type, row: x })}
                          >
                            <td>
                              <div className="person-cell">
                                {type === "tasks" ||
                                type === "quotations" ||
                                type === "bookings" ? (
                                  <span className={"task-symbol " + color}>
                                    <Ic size={16} />
                                  </span>
                                ) : (
                                  <Avatar name={x.customer} />
                                )}
                                <div>
                                  <button
                                    className="cell-title"
                                    onClick={() =>
                                      open("record", { type, row: x })
                                    }
                                  >
                                    {type === "tasks"
                                      ? x.subject
                                      : type === "quotations"
                                        ? code("QT", x.id)
                                        : type === "bookings"
                                          ? code("BK", x.id)
                                          : type === "meetings"
                                            ? x.purpose
                                            : x.customer}
                                  </button>
                                  <small>
                                    {type === "tasks" ||
                                    type === "quotations" ||
                                    type === "bookings" ||
                                    type === "meetings"
                                      ? x.customer
                                      : code("LD", x.lead_id)}
                                  </small>
                                </div>
                              </div>
                            </td>
                            <td>{x.project}</td>
                            <td>
                              {type === "calls"
                                ? x.direction
                                : type === "tasks"
                                  ? x.type
                                  : type === "quotations" || type === "bookings"
                                    ? `${x.tower}-${x.unit_number}`
                                    : x.owner || "—"}
                            </td>
                            <td>
                              <Badge>
                                {type === "calls" ? x.outcome : x.status}
                              </Badge>
                            </td>
                            <td>
                              {type === "quotations" || type === "bookings"
                                ? money(x.total || x.value)
                                : stamp(x.due_at || x.created_at)}
                            </td>
                            <td>
                              <ChevronRight size={14} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!r.total && (
                    <Empty
                      icon={c.icon}
                      title="No records in this view"
                      text={
                        "Change your filters or use “" +
                        c.cta +
                        "” to get started."
                      }
                    />
                  )}
                </div>
                <Pager
                  page={page}
                  set={setPage}
                  total={r.total}
                  size={r.size}
                />
              </>
            )}
          </DataState>
        )}
      </section>
    </>
  );
}
export function Projects({ id }) {
  const { boot, allowed, open } = useApp(),
    [search, setSearch] = useState(""),
    [cat, setCat] = useState("All categories");
  const state = useLoad("/projects");
  if (id)
    return (
      <DataState state={state}>
        {(projects) => {
          const p = projects.find((p) => p.id === Number(id));
          if (!p)
            return (
              <Empty
                title="Project unavailable"
                text="This project is not part of your workspace."
              />
            );
          return (
            <>
              <button
                className="back-link"
                onClick={() => navigate("projects")}
              >
                <ArrowLeft size={14} />
                Back to projects
              </button>
              <div
                className="project-cover"
                style={
                  p.image
                    ? {
                        backgroundImage: `linear-gradient(90deg,rgba(15,31,52,.93),rgba(15,31,52,.12)),url(${p.image})`,
                      }
                    : {}
                }
              >
                <Badge color="green" dot>
                  {p.status}
                </Badge>
                <h1>{p.name}</h1>
                <p>
                  <MapPin size={15} />
                  {p.location}
                </p>
              </div>
              <div className="summary-grid">
                {[
                  ["Total units", p.units, Layers3],
                  ["Available units", p.available, Grid2X2],
                  ["Project leads", p.leads, UsersRound],
                  ["Bookings", p.bookings, BookmarkCheck],
                ].map(([k, v, I]) => (
                  <div className="summary-card" key={k}>
                    <I />
                    <small>{k}</small>
                    <b>{fmtN(v)}</b>
                  </div>
                ))}
              </div>
              <section className="panel padded">
                <div className="section-row">
                  <h2>Project overview</h2>
                  <div className="toolbar-buttons">
                    <Badge>{p.category}</Badge>
                    {allowed("projects") && (
                      <Button
                        icon={Settings2}
                        onClick={() =>
                          open("projects", { edit: p.id, defaults: p })
                        }
                      >
                        Edit project
                      </Button>
                    )}
                  </div>
                </div>
                <p className="body-copy">
                  {p.description ||
                    "Property details are managed by the project team."}
                </p>
                <div className="detail-facts">
                  {[
                    ["Developer", p.developer || "Not specified"],
                    ["Starting price", money(p.start_price)],
                    ["City", p.city || p.location],
                    ["RERA registration", p.rera || "Not provided"],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <small>{k}</small>
                      <strong>{v}</strong>
                    </div>
                  ))}
                </div>
                <div className="quick-actions">
                  {allowed("inventory") && (
                    <Button
                      icon={Layers3}
                      onClick={() => navigate("inventory", { project: p.id })}
                    >
                      Explore inventory
                    </Button>
                  )}
                  {allowed("readLeads") && (
                    <Button
                      icon={UsersRound}
                      onClick={() => navigate("leads", { project: p.id })}
                    >
                      View project leads
                    </Button>
                  )}
                  {allowed("writeLead") && (
                    <Button
                      kind="primary"
                      icon={Plus}
                      onClick={() => open("add-lead", { project_id: p.id })}
                    >
                      Add enquiry
                    </Button>
                  )}
                </div>
              </section>
            </>
          );
        }}
      </DataState>
    );
  return (
    <>
      <PageHead
        eyebrow="PROPERTY PORTFOLIO"
        title="Projects"
        sub="Your residential and commercial developments, all in one place."
      >
        {allowed("projects") && (
          <Button kind="primary" icon={Plus} onClick={() => open("projects")}>
            Add project
          </Button>
        )}
      </PageHead>
      <div className="section-row">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search your portfolio…"
        />
        <Select
          label="Project category"
          options={["All categories", "Residential", "Commercial", "Mixed-use"]}
          value={cat}
          onChange={setCat}
        />
      </div>
      <DataState state={state}>
        {(ps) => {
          const items = ps.filter(
            (p) =>
              (cat === "All categories" || p.category === cat) &&
              (p.name + " " + p.location)
                .toLowerCase()
                .includes(search.toLowerCase()),
          );
          return items.length ? (
            <div className="project-grid stand-alone">
              {items.map((p) => (
                <ProjectCard key={p.id} p={p} />
              ))}
            </div>
          ) : (
            <Empty icon={Building2} title="No matching projects" />
          );
        }}
      </DataState>
    </>
  );
}
export function Inventory({ query }) {
  const { boot, allowed, open } = useApp(),
    [f, setF] = useState({
      project: query.project || "",
      status: "",
      floor: "",
    }),
    [q, setQ] = useState(""),
    [view, setView] = useState("Matrix"),
    [page, setPage] = useState(1);
  const state = useLoad(
    "/units" +
      qs({ ...f, q: useDebounce(q), page, size: view === "Matrix" ? 40 : 15 }),
  );
  const change = (k, v) => {
    setF({ ...f, [k]: v });
    setPage(1);
  };
  return (
    <>
      <PageHead
        eyebrow="PROPERTY PORTFOLIO"
        title="Inventory management"
        sub="Explore floor-wise availability, manage holds, and review unit pricing."
      >
        {allowed("pricing") && (
          <Button kind="primary" icon={Plus} onClick={() => open("units")}>
            Add unit
          </Button>
        )}
      </PageHead>
      <section className="panel">
        <div className="list-top">
          <div className="heading-inline">
            <h2>Unit inventory</h2>
            <span className="neutral-count">
              {fmtN(state.data?.total || 0)} units
            </span>
          </div>
          <div className="segmented">
            {[
              ["Matrix", Grid2X2],
              ["Table", Table2],
            ].map(([k, I]) => (
              <button
                key={k}
                className={view === k ? "active" : ""}
                onClick={() => {
                  setView(k);
                  setPage(1);
                }}
              >
                <I size={13} />
                {k}
              </button>
            ))}
          </div>
        </div>
        <div className="list-tools">
          <SearchBox
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
            placeholder="Search unit or type…"
          />
          <Select
            value={f.project}
            label="Inventory project"
            icon={Building2}
            onChange={(v) => change("project", v)}
            options={[
              { value: "", label: "All projects" },
              ...boot.projects.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
          <Select
            value={f.status}
            label="Availability"
            onChange={(v) => change("status", v)}
            options={[
              { value: "", label: "All statuses" },
              "Available",
              "On Hold",
              "Booked",
              "Sold",
              "Blocked",
            ]}
          />
        </div>
        <DataState state={state}>
          {(r) => (
            <>
              {!r.items.length ? (
                <Empty
                  title="No matching units"
                  text="Choose another project or add an inventory unit."
                />
              ) : view === "Matrix" ? (
                <div className="matrix-wrap">
                  <div className="matrix-legend">
                    {["Available", "On Hold", "Booked", "Blocked"].map((s) => (
                      <span
                        key={s}
                        className={
                          "unit-key " + s.replace(" ", "-").toLowerCase()
                        }
                      >
                        <i />
                        {s}
                      </span>
                    ))}
                  </div>
                  {Object.entries(
                    r.items.reduce((a, x) => {
                      const k =
                        x.project + " · " + x.tower + " · Floor " + x.floor;
                      (a[k] ||= []).push(x);
                      return a;
                    }, {}),
                  ).map(([k, units]) => (
                    <div className="floor-row" key={k}>
                      <div className="floor-label">
                        <b>{k.split(" · ")[2]}</b>
                        <small>
                          {k.split(" · ")[0]} · {k.split(" · ")[1]}
                        </small>
                      </div>
                      <div className="floor-units">
                        {units.map((x) => (
                          <button
                            className={
                              "unit-tile " +
                              x.status.replace(" ", "-").toLowerCase()
                            }
                            key={x.id}
                            onClick={() =>
                              open("record", { type: "units", row: x })
                            }
                          >
                            <b>
                              {x.tower}-{x.number}
                            </b>
                            <small>{x.category}</small>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Unit</th>
                        <th>Project</th>
                        <th>Floor</th>
                        <th>Category</th>
                        <th>Area (sq. ft.)</th>
                        <th>Price</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.items.map((x) => (
                        <tr
                          key={x.id}
                          onClick={() =>
                            open("record", { type: "units", row: x })
                          }
                        >
                          <td>
                            <b>
                              {x.tower}-{x.number}
                            </b>
                          </td>
                          <td>{x.project}</td>
                          <td>{x.floor}</td>
                          <td>{x.category}</td>
                          <td>{fmtN(x.area)}</td>
                          <td>{money(x.price)}</td>
                          <td>
                            <Badge>{x.status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Pager page={page} set={setPage} total={r.total} size={r.size} />
            </>
          )}
        </DataState>
      </section>
    </>
  );
}
export function Directory({ type }) {
  const { allowed, open, boot } = useApp(),
    [q, setQ] = useState("");
  const team = type === "team" || type === "users",
    partners = type === "partners",
    title =
      type === "team"
        ? "Team performance"
        : type === "users"
          ? "User management"
          : partners
            ? "Channel partners"
            : "Marketing campaigns",
    state = useLoad("/" + (team ? "team" : type));
  const canAdd = team
    ? allowed("manageUsers")
    : allowed(partners ? "partners" : "marketing");
  return (
    <>
      <PageHead
        eyebrow={team ? "WORKSPACE MANAGEMENT" : "MARKETING WORKSPACE"}
        title={title}
        sub={
          team
            ? "Manage authorized CRM users and review sales team activity."
            : partners
              ? "Track your partner network and the enquiries they generate."
              : "Connect source attribution, campaign spend, and lead quality."
        }
      >
        {canAdd && (
          <Button
            kind="primary"
            icon={Plus}
            onClick={() => open(team ? "users" : type)}
          >
            {team
              ? "Add user"
              : partners
                ? "Register partner"
                : "Create campaign"}
          </Button>
        )}
      </PageHead>
      <section className="panel">
        <div className="list-top">
          <h2>
            {team
              ? "Workspace team"
              : partners
                ? "Partner directory"
                : "Campaign directory"}
          </h2>
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder={
              "Search " +
              (team ? "team" : partners ? "partners" : "campaigns") +
              "…"
            }
          />
        </div>
        <DataState state={state}>
          {(all) => {
            const rows = all.filter((x) =>
              (x.name + " " + (x.company || x.role || x.project))
                .toLowerCase()
                .includes(q.toLowerCase()),
            );
            return (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {(team
                        ? [
                            "Team member",
                            "Role",
                            "Team",
                            "Leads",
                            "Calls",
                            "Bookings",
                            "Access",
                          ]
                        : partners
                          ? [
                              "Partner",
                              "Agency",
                              "Mobile",
                              "Attributed leads",
                              "Status",
                              "",
                            ]
                          : [
                              "Campaign",
                              "Project",
                              "Platform",
                              "Leads",
                              "Qualified",
                              "Spend",
                              "CPL",
                              "Status",
                            ]
                      ).map((h, i) => (
                        <th key={i}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((x) => (
                      <tr
                        key={x.id}
                        onClick={
                          team
                            ? undefined
                            : () =>
                                navigate(
                                  "leads",
                                  partners
                                    ? { partner: x.id }
                                    : { campaign: x.name },
                                )
                        }
                      >
                        <td>
                          <div className="person-cell">
                            {team || partners ? (
                              <Avatar name={x.name} />
                            ) : (
                              <span className="task-symbol purple">
                                <Megaphone size={16} />
                              </span>
                            )}
                            <div>
                              <b>{x.name}</b>
                              <small>
                                {team || partners
                                  ? x.email
                                  : fmtDate(x.start_date) +
                                    " – " +
                                    fmtDate(x.end_date)}
                              </small>
                            </div>
                          </div>
                        </td>
                        {team ? (
                          <>
                            <td>{x.role}</td>
                            <td>{x.team}</td>
                            <td>{fmtN(x.leads)}</td>
                            <td>{fmtN(x.calls)}</td>
                            <td>{x.bookings}</td>
                            <td>
                              {allowed("manageUsers") &&
                              x.id !== boot.user.id ? (
                                <button
                                  className="badge-button"
                                  title="Change account access"
                                  onClick={() =>
                                    open("confirm", {
                                      title: x.active
                                        ? "Deactivate CRM user?"
                                        : "Reactivate CRM user?",
                                      text: x.active
                                        ? `${x.name} will lose workspace access and stop receiving new leads. Historical records will be retained.`
                                        : `Restore CRM access for ${x.name}.`,
                                      button: x.active
                                        ? "Deactivate"
                                        : "Reactivate",
                                      action: () =>
                                        api("/users/" + x.id, "PATCH", {
                                          active: !x.active,
                                        }),
                                    })
                                  }
                                >
                                  <Badge dot>
                                    {x.active ? "Active" : "Inactive"}
                                  </Badge>
                                </button>
                              ) : (
                                <Badge dot>
                                  {x.active ? "Active" : "Inactive"}
                                </Badge>
                              )}
                            </td>
                          </>
                        ) : partners ? (
                          <>
                            <td>{x.company}</td>
                            <td>{x.phone}</td>
                            <td>{fmtN(x.leads)}</td>
                            <td>
                              <Badge>{x.status}</Badge>
                            </td>
                            <td>
                              <ArrowUpRight size={14} />
                            </td>
                          </>
                        ) : (
                          <>
                            <td>{x.project}</td>
                            <td>{x.source}</td>
                            <td>{fmtN(x.leads)}</td>
                            <td>{fmtN(x.qualified)}</td>
                            <td>
                              {x.spend != null
                                ? money(x.spend)
                                : "Not available"}
                            </td>
                            <td>
                              {x.leads && x.spend != null
                                ? money(Math.round(x.spend / x.leads))
                                : "—"}
                            </td>
                            <td>
                              <Badge>{x.status}</Badge>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!rows.length && (
                  <Empty
                    title="No matching records"
                    text="Add a record or try a different search."
                  />
                )}
              </div>
            );
          }}
        </DataState>
      </section>
      {partners && <PartnerReviews />}
    </>
  );
}
export function Reports() {
  const { allowed, toast } = useApp(),
    [f, setF] = useState({ period: "This month", project: "" }),
    [tab, setTab] = useState("Overview");
  const state = useLoad("/dashboard" + qs(f));
  async function exportReport() {
    try {
      const d = await api("/reports/export" + qs(f));
      const rows = [
        ["Bull Realty Global — CRM performance report"],
        ["From", d.range.start, "Through", d.range.end],
        ["Metric", "Value"],
        ...[
          "Total leads",
          "Site visits",
          "Bookings",
          "Booking value (INR)",
        ].map((k, i) => [k, d.current[i]]),
        ...[
          "stages",
          "sources",
          "calls",
          "followups",
          "visits",
          "meetings",
          "quotations",
        ].flatMap((key) => [
          [key.toUpperCase(), "Count"],
          ...d[key].map((x) => [x.name, x.value]),
        ]),
      ];
      download("CRM-performance-" + d.range.end + ".csv", csv(rows));
      toast("Report exported.");
    } catch (e) {
      toast(e.message, "error");
    }
  }
  return (
    <>
      <PageHead
        eyebrow="MANAGEMENT INSIGHTS"
        title="Reports & analytics"
        sub="A reconciled view of lead generation, sales activity, and business outcomes."
      >
        {allowed("export") && (
          <Button icon={Download} onClick={exportReport}>
            Export report
          </Button>
        )}
      </PageHead>
      <div className="section-row">
        <div className="segmented">
          {["Overview", "Daily briefing"].map((k) => (
            <button
              key={k}
              className={tab === k ? "active" : ""}
              onClick={() => {
                setTab(k);
                setF({
                  ...f,
                  period: k === "Daily briefing" ? "Today" : "This month",
                });
              }}
            >
              {k}
            </button>
          ))}
        </div>
        <FilterBar f={f} set={setF} />
      </div>
      <DataState state={state}>
        {(d) => (
          <>
            <Metrics d={d} f={f} />
            <div className="reports-title">
              <h2>
                {tab === "Daily briefing"
                  ? "Daily management briefing"
                  : "Sales & acquisition insights"}
              </h2>
              <span>
                {fmtDate(d.range.start)} – {fmtDate(d.range.end)}
              </span>
            </div>
            <div className="report-grid">
              <Trend d={d} />
              <BarPanel
                title="Lead sources"
                desc="Where your enquiries come from"
                data={d.sources}
              />
              <BarPanel
                title="Pipeline distribution"
                desc="Stages of enquiries received in this period"
                data={d.stages}
              />
              <section className="panel padded">
                <h2>Management attention</h2>
                <p className="muted">
                  Actionable enquiries for the selected period
                </p>
                {[
                  [
                    "Unassigned active leads",
                    d.attention.unassigned,
                    "Unassigned",
                  ],
                  ["Pending first contact", d.attention.fresh, "New leads"],
                  ["Actionable hot leads", d.attention.hot, "Hot leads"],
                ].map(([k, v, view]) => (
                  <button
                    className="attention-row"
                    key={k}
                    onClick={() => navigate("leads", { ...f, view })}
                  >
                    <span>{k}</span>
                    <b>{fmtN(v)}</b>
                    <ArrowRight size={14} />
                  </button>
                ))}
                <div className="conversion">
                  <Target size={20} />
                  <div>
                    <b>{(d.leadConversion || 0).toFixed(1)}%</b>
                    <small>Lead-to-booking conversion · enquiry cohort</small>
                  </div>
                </div>
              </section>
              {[
                ["Calling outcomes", "calls"],
                ["Follow-up completion", "followups"],
                ["Site visit activity", "visits"],
                ["Outside business meetings", "meetings"],
                ["Quotation activity", "quotations"],
              ].map(([t, k]) => (
                <BarPanel
                  key={k}
                  title={t}
                  desc="Activity during the selected date range"
                  data={d[k]}
                />
              ))}
            </div>
            <ManagementMetrics d={d} />
          </>
        )}
      </DataState>
    </>
  );
}
function BarPanel({ title, desc, data }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <section className="panel bar-panel">
      <h2>{title}</h2>
      <p>{desc}</p>
      {data.length ? (
        <div className="bar-rows">
          {data.map((x, i) => (
            <div key={x.name}>
              <div>
                <span>{x.name}</span>
                <b>{fmtN(x.value)}</b>
              </div>
              <div className="bar-track">
                <i
                  style={{
                    width: (x.value / max) * 100 + "%",
                    background: [
                      "#4c7bf0",
                      "#8e75d7",
                      "#4eaf9e",
                      "#e3ac5b",
                      "#7e9fcd",
                    ][i % 5],
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty
          title="No activity in this period"
          text="Change the date range to see earlier records."
        />
      )}
    </section>
  );
}
export function Logs() {
  const [q, setQ] = useState("");
  return (
    <>
      <PageHead
        eyebrow="WORKSPACE GOVERNANCE"
        title="Activity log"
        sub="A chronological, read-only audit trail of critical CRM actions."
      />
      <section className="panel">
        <div className="list-top">
          <h2>Workspace timeline</h2>
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="Search activities or remarks…"
          />
        </div>
        <Timeline search={useDebounce(q)} />
      </section>
    </>
  );
}
export function Notifications() {
  const { refresh, toast } = useApp(),
    [tab, setTab] = useState("All"),
    state = useLoad("/notifications");
  const read = async (id) => {
    try {
      await api("/notifications/read", "POST", { id });
      refresh();
    } catch (e) {
      toast(e.message, "error");
    }
  };
  return (
    <>
      <PageHead
        eyebrow="WORKSPACE INBOX"
        title="Notifications"
        sub="Assignment alerts, follow-up reminders, and important workspace updates."
      >
        <Button icon={CheckCheck} onClick={() => read()}>
          Mark all as read
        </Button>
      </PageHead>
      <section className="panel">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            "All",
            "Unread",
            "Assignment",
            "Reminder",
            "Escalation",
            "Booking",
          ]}
        />
        <DataState state={state}>
          {(rows) => {
            const filtered = rows.filter(
              (x) =>
                tab === "All" ||
                (tab === "Unread" && !x.is_read) ||
                x.kind === tab,
            );
            return filtered.length ? (
              <div className="notification-list">
                {filtered.map((n) => (
                  <button
                    key={n.id}
                    className={!n.is_read ? "unread" : ""}
                    onClick={() => {
                      read(n.id);
                      if (n.lead_id) navigate("leads/" + n.lead_id);
                      else if (n.kind === "Report") navigate("reports");
                      else if (n.kind === "Reminder") navigate("my-work");
                      else navigate("leads");
                    }}
                  >
                    <span
                      className={
                        "task-symbol " +
                        (n.kind === "Escalation" ? "amber" : "blue")
                      }
                    >
                      <BellRing size={16} />
                    </span>
                    <span>
                      <b>{n.title}</b>
                      <p>{n.body}</p>
                      <small>
                        {stamp(n.created_at)} · {n.kind}
                      </small>
                    </span>
                    {!n.is_read && <i />}
                  </button>
                ))}
              </div>
            ) : (
              <Empty
                icon={Bell}
                title="You’re all caught up"
                text="No notifications match this view."
              />
            );
          }}
        </DataState>
      </section>
    </>
  );
}
export function Settings() {
  const { boot, refresh, toast, open } = useApp(),
    [tab, setTab] = useState("Workflow rules"),
    [s, setS] = useState({ ...boot.settings }),
    [err, setErr] = useState(""),
    [saving, setSaving] = useState(false),
    [guide, setGuide] = useState(null);
  const imports = useLoad(tab === "Import history" ? "/imports" : null);
  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setErr("");
    try {
      await api("/settings", "PATCH", s);
      refresh();
      toast("Workspace rules saved.");
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <PageHead
        eyebrow="ADMINISTRATION"
        title="Workspace settings"
        sub="Configure assignment, communication integrations, and sales workflow rules."
      />
      <section className="panel">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            "Workflow rules",
            "Routing rules",
            "Integrations",
            "Event review",
            "Import history",
          ]}
        />
        {tab === "Workflow rules" ? (
          <form className="settings-form" onSubmit={save}>
            <div className="settings-section">
              <div>
                <span className="task-symbol blue">
                  <UsersRound size={18} />
                </span>
                <h3>Lead assignment</h3>
                <p>
                  Automatically route enquiries to active, project-authorized
                  team members.
                </p>
              </div>
              <div className="form-grid">
                <Field label="Assignment method" full>
                  <select
                    value={s.assignment}
                    onChange={(e) => setS({ ...s, assignment: e.target.value })}
                  >
                    {["Round robin", "Lowest workload", "Manual"].map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Active lead limit per owner">
                  <input
                    type="number"
                    min="1"
                    required
                    value={s.workload}
                    onChange={(e) => setS({ ...s, workload: e.target.value })}
                  />
                </Field>
                <Field label="First contact SLA (minutes)">
                  <input
                    type="number"
                    min="1"
                    required
                    value={s.firstContactMinutes}
                    onChange={(e) =>
                      setS({ ...s, firstContactMinutes: e.target.value })
                    }
                  />
                </Field>
              </div>
            </div>
            <div className="settings-section">
              <div>
                <span className="task-symbol purple">
                  <Target size={18} />
                </span>
                <h3>Qualification & inventory</h3>
                <p>Set score thresholds and the duration of a unit hold.</p>
              </div>
              <div className="form-grid">
                {[
                  ["hotThreshold", "Hot score threshold"],
                  ["warmThreshold", "Warm score threshold"],
                  ["holdHours", "Unit hold duration (hours)"],
                ].map(([key, label]) => (
                  <Field key={key} label={label}>
                    <input
                      type="number"
                      min="0"
                      required
                      value={s[key]}
                      onChange={(e) => setS({ ...s, [key]: e.target.value })}
                    />
                  </Field>
                ))}
              </div>
            </div>
            <div className="settings-section">
              <div>
                <span className="task-symbol amber">
                  <BellRing size={18} />
                </span>
                <h3>Callback reminders</h3>
                <p>
                  Create follow-ups for unanswered calls and callback requests.
                </p>
              </div>
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={s.callbackTasks}
                  onChange={(e) =>
                    setS({ ...s, callbackTasks: e.target.checked })
                  }
                />
                Automatically create callback tasks
              </label>
            </div>
            {err && <ErrorBox error={err} />}
            <div className="settings-footer">
              <span>
                <ShieldCheck size={13} />
                Changes are recorded in the audit log.
              </span>
              <Button
                kind="primary"
                type="submit"
                icon={Check}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save rules"}
              </Button>
            </div>
          </form>
        ) : tab === "Routing rules" ? (
          <RoutingRules />
        ) : tab === "Event review" ? (
          <IntegrationInbox />
        ) : tab === "Integrations" ? (
          <div className="padded">
            <div className="info-banner">
              <ShieldCheck size={18} />
              <p>
                Provider credentials belong on the server. Demo data is not
                connected to any live marketing or calling account.
              </p>
            </div>
            <div className="integration-grid">
              {[
                [
                  "Marketing lead capture",
                  "Map Meta, Google, portal, or website enquiries into the inbound lead endpoint.",
                  Globe,
                  "leads",
                ],
                [
                  "Cloud telephony",
                  "Receive normalized call outcomes, durations, and recording references.",
                  Phone,
                  "calls",
                ],
                [
                  "WhatsApp Business",
                  "Use opted-in click-to-chat today. An approved Business API adapter is required for templates and delivery receipts.",
                  MessageCircle,
                  "whatsapp",
                ],
              ].map(([title, desc, I, key]) => (
                <div className="integration-card" key={key}>
                  <span className="task-symbol blue">
                    <I size={19} />
                  </span>
                  <Badge
                    color={
                      boot.integrationReady && key !== "whatsapp"
                        ? "green"
                        : "slate"
                    }
                  >
                    {boot.integrationReady && key !== "whatsapp"
                      ? "Endpoint ready"
                      : "Not connected"}
                  </Badge>
                  <h3>{title}</h3>
                  <p>{desc}</p>
                  <button
                    className="text-link"
                    onClick={() => setGuide({ title, key, desc })}
                  >
                    Setup details <ArrowRight size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="padded">
            <div className="section-row">
              <h3>Import batches</h3>
              <Button icon={Upload} onClick={() => open("import")}>
                Import workbook
              </Button>
            </div>
            <DataState state={imports}>
              {(b) =>
                b.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Batch</th>
                          <th>File</th>
                          <th>New / Linked / Flagged</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {b.map((i) => (
                          <tr key={i.id}>
                            <td>{code("IMP", i.id)}</td>
                            <td>{i.filename}</td>
                            <td>
                              {i.imported} / {i.linked} / {i.failures.length}
                            </td>
                            <td>
                              <Badge>{i.status}</Badge>
                            </td>
                            <td>
                              <div className="table-actions">
                                {i.failures.length > 0 && (
                                  <IconButton
                                    icon={Download}
                                    label="Download validation issues"
                                    onClick={() =>
                                      download(
                                        "batch-" + i.id + "-issues.json",
                                        JSON.stringify(i.failures, null, 2),
                                        "application/json",
                                      )
                                    }
                                  />
                                )}{" "}
                                {i.status === "Completed" && (
                                  <button
                                    className="text-link"
                                    onClick={() =>
                                      open("confirm", {
                                        title: "Roll back import?",
                                        text: "Only untouched new leads from this batch will be archived. Existing customers, linked enquiries and audit history are preserved.",
                                        button: "Roll back batch",
                                        action: () =>
                                          api(
                                            "/imports/" + i.id + "/rollback",
                                            "POST",
                                            {},
                                          ),
                                      })
                                    }
                                  >
                                    Roll back
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    title="No import batches yet"
                    text="Upload an Excel workbook or CSV to begin a traceable import."
                  />
                )
              }
            </DataState>
          </div>
        )}
      </section>
      {guide && (
        <Modal title={guide.title} icon={Link2} onClose={() => setGuide(null)}>
          <div className="modal-scroll guide">
            <p>{guide.desc}</p>
            {guide.key === "whatsapp" ? (
              <>
                <h3>Business API setup</h3>
                <p>
                  Connect an approved provider, configure signed callbacks and
                  approved templates, and validate opt-in before enabling
                  automated messages. A live adapter is not installed in this
                  workspace.
                </p>
                <Button
                  icon={MessageCircle}
                  onClick={() => {
                    setGuide(null);
                    navigate("messages");
                  }}
                >
                  Open communications
                </Button>
              </>
            ) : (
              <>
                <h3>Authorized adapter endpoint</h3>
                <code>POST /api/integrations/{guide.key}</code>
                <p>
                  Set <b>CRM_WEBHOOK_SECRET</b> (at least 32 characters) in the
                  server environment. Your trusted provider adapter must
                  authenticate using a Bearer token and supply a unique event
                  ID.
                </p>
                <pre>
                  {JSON.stringify(
                    guide.key === "leads"
                      ? {
                          event_id: "unique-provider-event",
                          name: "Customer name",
                          phone: "Valid Indian mobile",
                          project_id: boot.projects[0]?.id || 1,
                          source: "Meta Ads",
                          campaign: "Campaign name",
                        }
                      : {
                          event_id: "unique-call-event",
                          provider_id: "provider-call-id",
                          lead_id: "CRM lead ID",
                          direction: "Inbound",
                          outcome: "Connected",
                          duration: 120,
                          notes: "Actual call outcome",
                        },
                    null,
                    2,
                  )}
                </pre>
                <p className="fine-print">
                  Verify provider signatures in your adapter. Retries with the
                  same event ID do not duplicate records.
                </p>
              </>
            )}
          </div>
          <div className="modal-footer">
            <Button onClick={() => setGuide(null)}>Close</Button>
          </div>
        </Modal>
      )}
    </>
  );
}
