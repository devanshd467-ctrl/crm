import { LeadDocuments, OpportunityList } from "./extra";
import React, { useState, useEffect } from "react";
import {
  Plus,
  SlidersHorizontal,
  Upload,
  Download,
  Columns3,
  ArrowDownUp,
  ChevronRight,
  ArrowLeft,
  ArrowRight,
  Phone,
  MapPin,
  Building2,
  MessageCircle,
  NotebookPen,
  CalendarPlus,
  CalendarCheck2,
  GitBranch,
  UserRoundCheck,
  Check,
  Bookmark,
  Table2,
  LayoutGrid,
  GripVertical,
  BriefcaseBusiness,
  ChevronDown,
  Pencil,
  Activity,
  X,
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
  Badge,
  Avatar,
  Button,
  IconButton,
  Select,
  SearchBox,
  Pager,
  Empty,
  DataState,
  PageHead,
  Tabs,
  code,
  download,
  csv,
} from "./lib";
export function Leads({ query = {}, embedded = false }) {
  const { boot, open, allowed, toast } = useApp();
  const [q, setQ] = useState(query.q || ""),
    [f, setF] = useState({ ...query }),
    [view, setView] = useState(query.view || "All leads"),
    [page, setPage] = useState(1),
    [checked, setChecked] = useState([]),
    [sort, setSort] = useState("created"),
    [dir, setDir] = useState("desc"),
    [pop, setPop] = useState(""),
    [columns, setColumns] = useState(() =>
      JSON.parse(
        localStorage.getItem("brg.columns") ||
          '["Project","Stage","Temperature","Owner"]',
      ),
    ),
    [saved, setSaved] = useState(() =>
      JSON.parse(localStorage.getItem("brg.views." + boot.user.id) || "[]"),
    );
  const deb = useDebounce(q),
    filters = { ...f, q: deb, view, sort, dir },
    state = useLoad("/leads" + qs({ ...filters, page, size: 15 }));
  useEffect(() => {
    setPage(1);
    setChecked([]);
  }, [deb, view, JSON.stringify(f), sort, dir]);
  const changeSort = (k) => {
    if (sort === k) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSort(k);
      setDir("asc");
    }
  };
  async function exp(format = "csv") {
    try {
      const r = await api("/leads/export" + qs(filters));
      const rows = [
        [
          "Lead ID",
          "Customer name",
          "Phone",
          "Email",
          "Project",
          "Source",
          "Stage",
          "Temperature",
          "Priority",
          "Owner",
          "Budget",
          "Created",
        ],
        ...r.items.map((l) => [
          code("LD", l.id),
          l.name,
          l.phone,
          l.email,
          l.project,
          l.source,
          l.stage,
          l.temperature,
          l.priority,
          l.owner || "Unassigned",
          l.budget,
          l.created_at,
        ]),
      ];
      if (format === "xlsx") {
        const x = await import("xlsx"),
          book = x.utils.book_new();
        x.utils.book_append_sheet(book, x.utils.aoa_to_sheet(rows), "Leads");
        x.writeFile(book, "Bull-Realty-Leads.xlsx");
      } else download("Bull-Realty-Leads.csv", csv(rows));
      toast(`${fmtN(r.total)} filtered leads exported.`);
      setPop("");
    } catch (e) {
      toast(e.message, "error");
    }
  }
  const advanced = () =>
    open("lead-filters", {
      defaults: {
        project: f.project,
        src: f.source,
        stg: f.stage,
        temp: f.temperature,
        priorityFilter: f.priority,
        owner: f.owner,
      },
      onSave: (v) => setF({ ...f, ...v }),
    });
  const active = Object.entries(f).filter(
    ([k, v]) => v && k !== "q" && k !== "view",
  );
  const views = [
    "All leads",
    "My leads",
    "New leads",
    "Hot leads",
    "Unassigned",
    "High priority",
    "Follow-up due",
    "Booked leads",
    "Lost leads",
  ];
  const saveView = () => {
    const name =
      (view !== "All leads" ? view : "Leads") +
      " · " +
      (f.stage ||
        f.source ||
        boot.projects.find((p) => p.id === Number(f.project))?.name ||
        q ||
        "Custom " + (saved.length + 1));
    const all = [...saved, { name, f, q, view }].slice(-10);
    localStorage.setItem("brg.views." + boot.user.id, JSON.stringify(all));
    setSaved(all);
    toast("Filter saved to this browser.");
    setPop("");
  };
  return (
    <>
      {!embedded && (
        <PageHead
          eyebrow="SALES WORKSPACE"
          title="Lead management"
          sub="Manage enquiries, qualify customers, and keep every opportunity moving."
        >
          {allowed("import") && (
            <Button icon={Upload} onClick={() => open("import")}>
              Import
            </Button>
          )}
          {allowed("writeLead") && (
            <Button icon={Plus} kind="primary" onClick={() => open("add-lead")}>
              Add lead
            </Button>
          )}
        </PageHead>
      )}
      <section className="panel list-panel">
        <div className="list-top">
          <div className="heading-inline">
            <h2>Lead directory</h2>
            <span className="neutral-count">
              {fmtN(state.data?.total || 0)}
            </span>
          </div>
          <div className="toolbar-buttons">
            <div className="popover-anchor">
              <IconButton
                icon={Columns3}
                label="Customize columns"
                onClick={() => setPop(pop === "columns" ? "" : "columns")}
              />
              {pop === "columns" && (
                <div className="small-menu">
                  <b>Visible columns</b>
                  {[
                    "Project",
                    "Stage",
                    "Temperature",
                    "Owner",
                    "Source",
                    "Budget",
                    "Score",
                    "Created",
                  ].map((c) => (
                    <label key={c}>
                      <input
                        type="checkbox"
                        checked={columns.includes(c)}
                        onChange={(e) => {
                          const v = e.target.checked
                            ? [...columns, c]
                            : columns.filter((x) => x !== c);
                          setColumns(v);
                          localStorage.setItem(
                            "brg.columns",
                            JSON.stringify(v),
                          );
                        }}
                      />
                      {c}
                    </label>
                  ))}
                  <button onClick={() => setPop("")}>
                    Done <Check size={13} />
                  </button>
                </div>
              )}
            </div>
            {allowed("export") && (
              <div className="popover-anchor">
                <Button
                  icon={Download}
                  onClick={() => setPop(pop === "export" ? "" : "export")}
                >
                  Export
                </Button>
                {pop === "export" && (
                  <div className="small-menu">
                    <button onClick={() => exp("csv")}>CSV spreadsheet</button>
                    <button onClick={() => exp("xlsx")}>Excel workbook</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="list-tools">
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="Search name, phone, email or lead ID…"
          />
          <Select
            label="Lead view"
            value={view}
            options={views}
            onChange={setView}
          />
          <Button icon={SlidersHorizontal} onClick={advanced}>
            Filters{active.length ? " · " + active.length : ""}
          </Button>
          <div className="popover-anchor">
            <IconButton
              icon={Bookmark}
              label="Saved filters"
              onClick={() => setPop(pop === "saved" ? "" : "saved")}
            />
            {pop === "saved" && (
              <div className="small-menu">
                <b>Saved filters</b>
                {saved.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setF(s.f);
                      setQ(s.q);
                      setView(s.view);
                      setPop("");
                    }}
                  >
                    {s.name}
                  </button>
                ))}
                <button onClick={saveView}>
                  <Plus size={13} /> Save current filters
                </button>
              </div>
            )}
          </div>
        </div>
        {active.length > 0 && (
          <div className="active-filters">
            {active.map(([k, v]) => (
              <button key={k} onClick={() => setF((p) => ({ ...p, [k]: "" }))}>
                {k}:{" "}
                {k === "project"
                  ? boot.projects.find((p) => p.id === Number(v))?.name
                  : v}
                <X size={10} />
              </button>
            ))}
            <button onClick={() => setF({})}>Clear all</button>
          </div>
        )}
        {checked.length > 0 && (
          <div className="bulk-bar">
            <b>{checked.length} selected</b>
            {allowed("assign") && (
              <button onClick={() => open("bulk-assign", { ids: checked })}>
                Assign owner
              </button>
            )}
            {allowed("writeLead") && (
              <button onClick={() => open("bulk-stage", { ids: checked })}>
                Change stage
              </button>
            )}
            {allowed("activity") && (
              <button onClick={() => open("bulk-task", { ids: checked })}>
                Add follow-up
              </button>
            )}
            <button onClick={() => setChecked([])}>Clear</button>
          </div>
        )}
        <DataState state={state}>
          {(r) => (
            <>
              <div className="table-scroll">
                <table className="lead-table">
                  <thead>
                    <tr>
                      <th className="check-cell">
                        <input
                          type="checkbox"
                          aria-label="Select all visible leads"
                          checked={
                            !!r.items.length &&
                            r.items.every((l) => checked.includes(l.id))
                          }
                          onChange={(e) =>
                            setChecked(
                              e.target.checked ? r.items.map((l) => l.id) : [],
                            )
                          }
                        />
                      </th>
                      <th>
                        <button
                          className="sort-head"
                          onClick={() => changeSort("name")}
                        >
                          Customer <ArrowDownUp size={11} />
                        </button>
                      </th>
                      {columns.map((c) => (
                        <th key={c}>
                          {["Stage", "Score", "Budget", "Created"].includes(
                            c,
                          ) ? (
                            <button
                              className="sort-head"
                              onClick={() => changeSort(c.toLowerCase())}
                            >
                              {c}
                              <ArrowDownUp size={11} />
                            </button>
                          ) : (
                            c
                          )}
                        </th>
                      ))}
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {r.items.map((l) => (
                      <tr
                        key={l.id}
                        className={checked.includes(l.id) ? "selected" : ""}
                        onClick={() => navigate("leads/" + l.id)}
                      >
                        <td
                          onClick={(e) => e.stopPropagation()}
                          className="check-cell"
                        >
                          <input
                            type="checkbox"
                            aria-label={"Select " + l.name}
                            checked={checked.includes(l.id)}
                            onChange={(e) =>
                              setChecked(
                                e.target.checked
                                  ? [...checked, l.id]
                                  : checked.filter((id) => id !== l.id),
                              )
                            }
                          />
                        </td>
                        <td>
                          <div className="person-cell">
                            <Avatar name={l.name} />
                            <div>
                              <button
                                className="cell-title"
                                onClick={() => navigate("leads/" + l.id)}
                              >
                                {l.name}
                              </button>
                              <small>{l.phone}</small>
                            </div>
                          </div>
                        </td>
                        {columns.map((c) => (
                          <td key={c}>
                            {c === "Project" ? (
                              l.project
                            ) : c === "Stage" ? (
                              <Badge>{l.stage}</Badge>
                            ) : c === "Temperature" ? (
                              <span
                                className={
                                  "temp-text " + l.temperature.toLowerCase()
                                }
                              >
                                <i />
                                {l.temperature}
                              </span>
                            ) : c === "Owner" ? (
                              l.owner || (
                                <span className="muted">Unassigned</span>
                              )
                            ) : c === "Source" ? (
                              l.source
                            ) : c === "Budget" ? (
                              money(l.budget)
                            ) : c === "Score" ? (
                              l.score
                            ) : (
                              fmtDate(l.created_at)
                            )}
                          </td>
                        ))}
                        <td>
                          <ChevronRight size={14} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!r.items.length && (
                  <Empty
                    title="No matching leads"
                    text="Adjust the filters, import a file, or capture a new enquiry."
                  />
                )}
              </div>
              <Pager page={page} set={setPage} total={r.total} size={r.size} />
            </>
          )}
        </DataState>
      </section>
    </>
  );
}
export function Timeline({ lead, search = "", kind = "", compact = false }) {
  const [page, setPage] = useState(1),
    state = useLoad(
      "/activities" +
        qs({ lead, q: search, kind, page, size: compact ? 6 : 16 }),
    );
  return (
    <DataState state={state}>
      {(r) => (
        <>
          {r.items.length ? (
            <div className="timeline">
              {r.items.map((a) => {
                const [Icon, theme] = a.kind.includes("Call")
                  ? [Phone, "green"]
                  : a.kind.includes("assigned") || a.kind.includes("Owner")
                    ? [UserRoundCheck, "purple"]
                    : a.kind.includes("Note")
                      ? [NotebookPen, "amber"]
                      : a.kind.includes("Stage")
                        ? [GitBranch, "purple"]
                        : a.kind.includes("ask")
                          ? [CalendarCheck2, "blue"]
                          : [Activity, "blue"];
                return (
                  <div className="timeline-row" key={a.id}>
                    <span className={"timeline-symbol " + theme}>
                      <Icon size={14} />
                    </span>
                    <div>
                      <div className="timeline-heading">
                        <b>{a.kind}</b>
                        <time>{stamp(a.created_at)}</time>
                      </div>
                      <p>{a.description}</p>
                      <small>{a.author || "Workspace automation"}</small>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty
              title="No matching activity"
              text="New actions and notes will appear here."
            />
          )}
          {!compact && (
            <Pager total={r.total} size={r.size} page={page} set={setPage} />
          )}
        </>
      )}
    </DataState>
  );
}
export function LeadDetail({ id }) {
  const { open, allowed } = useApp(),
    [tab, setTab] = useState("Overview"),
    state = useLoad("/leads/" + id);
  return (
    <DataState state={state}>
      {(l) => (
        <>
          <button className="back-link" onClick={() => navigate("leads")}>
            <ArrowLeft size={14} />
            Back to lead management
          </button>
          <div className="detail-hero panel">
            <Avatar size={58} name={l.name} />
            <div className="detail-identity">
              <div className="eyebrow">
                {code("LD", l.id)} · CUSTOMER PROFILE
              </div>
              <h1>{l.name}</h1>
              <p>
                <MapPin size={13} />
                {l.city || "City not set"}
                <i /> <Building2 size={13} />
                {l.project}
              </p>
            </div>
            <div className="detail-hero-right">
              <Badge dot>{l.stage}</Badge>
              {allowed("writeLead") && (
                <Button
                  icon={Pencil}
                  onClick={() => open("edit-lead", { lead: l })}
                >
                  Edit lead
                </Button>
              )}
            </div>
          </div>
          <div className="quick-actions">
            {allowed("activity") && (
              <>
                <Button icon={Phone} onClick={() => open("calls", { lead: l })}>
                  Log call
                </Button>
                <Button
                  icon={MessageCircle}
                  onClick={() => open("messages", { lead: l })}
                >
                  WhatsApp
                </Button>
                <Button
                  icon={NotebookPen}
                  onClick={() => open("note", { lead: l })}
                >
                  Add note
                </Button>
                <Button
                  icon={CalendarPlus}
                  onClick={() => open("tasks", { lead: l })}
                >
                  Follow-up
                </Button>
              </>
            )}
            {allowed("visits") && (
              <Button icon={MapPin} onClick={() => open("visits", { lead: l })}>
                Site visit
              </Button>
            )}
            <Select
              label="More lead actions"
              value=""
              placeholder="More actions"
              options={[
                ...(allowed("writeLead")
                  ? [
                      { value: "stage", label: "Change stage" },
                      { value: "opportunities", label: "Create opportunity" },
                    ]
                  : []),
                ...(allowed("assign")
                  ? [{ value: "assign", label: "Reassign lead" }]
                  : []),
                ...(allowed("activity")
                  ? [{ value: "meetings", label: "Schedule OBM" }]
                  : []),
                ...(allowed("quote")
                  ? [
                      { value: "quotations", label: "Create quotation" },
                      { value: "bookings", label: "Request booking" },
                    ]
                  : []),
              ]}
              onChange={(k) => k && open(k, { lead: l })}
            />
          </div>
          <section className="panel">
            <Tabs
              value={tab}
              onChange={setTab}
              items={[
                "Overview",
                "Timeline",
                ...(allowed("activity")
                  ? ["Calls", "Follow-ups", "Messages", "Field meetings"]
                  : []),
                ...(allowed("visits") ? ["Visits"] : []),
                ...(allowed("quote") ? ["Quotations", "Bookings"] : []),
                "Enquiries",
                "Documents",
                ...(allowed("writeLead") ? ["Opportunities"] : []),
              ]}
            />
            {tab === "Overview" ? (
              <div className="lead-overview">
                <div className="overview-facts">
                  <h3>Customer information</h3>
                  <dl>
                    {[
                      [
                        "Mobile",
                        l.consent ? (
                          <a href={"tel:" + l.phone}>{l.phone}</a>
                        ) : (
                          l.phone
                        ),
                      ],
                      ["Email", l.email || "Not provided"],
                      ["City", l.city || "Not provided"],
                      ["Consent", l.consent ? "Opted in" : "Do not contact"],
                      ["Owner", l.owner || "Unassigned"],
                      ["Source", l.source],
                      ["Campaign", l.campaign || "—"],
                      ["Enquiry date", fmtDate(l.created_at)],
                      ...Object.entries(l.contact_details || {})
                        .filter(([, v]) => v)
                        .map(([k, v]) => [k.replaceAll("_", " "), String(v)]),
                    ].map(([k, v]) => (
                      <React.Fragment key={k}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </React.Fragment>
                    ))}
                  </dl>
                  <h3>Property requirements</h3>
                  <dl>
                    {[
                      ["Project", l.project],
                      ["Configuration", l.configuration || "Not specified"],
                      ["Budget", money(l.budget)],
                      ["Temperature", <Badge>{l.temperature}</Badge>],
                      ["Priority", <Badge>{l.priority}</Badge>],
                      ["Lead score", `${l.score} / 100`],
                      ["Next action", l.next_action || "Not set"],
                      ...Object.entries(l.details || {})
                        .filter(([, v]) => v)
                        .map(([k, v]) => [k.replaceAll("_", " "), String(v)]),
                    ].map(([k, v]) => (
                      <React.Fragment key={k}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </React.Fragment>
                    ))}
                  </dl>
                </div>
                <div className="summary-timeline">
                  <div className="section-row">
                    <h3>Recent activity</h3>
                    <button
                      className="text-link"
                      onClick={() => setTab("Timeline")}
                    >
                      Full timeline <ArrowRight size={13} />
                    </button>
                  </div>
                  <Timeline lead={id} compact />
                </div>
              </div>
            ) : tab === "Timeline" ? (
              <Timeline lead={id} />
            ) : tab === "Documents" ? (
              <LeadDocuments lead={l} />
            ) : tab === "Enquiries" ? (
              <div className="padded">
                <h3>Project interests</h3>
                <div className="interests">
                  {l.interests.map((i) => (
                    <button
                      onClick={() => navigate("leads/" + i.id)}
                      key={i.id}
                    >
                      <Building2 size={16} />
                      {i.project}
                      <Badge>{i.stage}</Badge>
                    </button>
                  ))}
                </div>
                <h3>Original and repeat enquiries</h3>
                {l.enquiries.map((e) => (
                  <details className="enquiry-record" key={e.id}>
                    <summary className="enquiry-row">
                      <b>{e.original_source || e.source}</b>
                      <span>{e.campaign || "Direct enquiry"}</span>
                      <small>{stamp(e.created_at)}</small>
                      <ChevronDown size={12} />
                    </summary>
                    <div className="detail-facts">
                      {Object.entries(JSON.parse(e.metadata || "{}")).map(
                        ([k, v]) => (
                          <div key={k}>
                            <small>{k.replaceAll("_", " ")}</small>
                            <strong>{String(v)}</strong>
                          </div>
                        ),
                      )}
                      {Object.keys(JSON.parse(e.metadata || "{}")).length ===
                        0 && (
                        <p className="fine-print">
                          No additional attribution fields supplied.
                        </p>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            ) : (
              <Related
                type={
                  {
                    Calls: "calls",
                    "Follow-ups": "tasks",
                    Messages: "messages",
                    "Field meetings": "meetings",
                    Visits: "visits",
                    Quotations: "quotations",
                    Bookings: "bookings",
                    Opportunities: "opportunities",
                  }[tab]
                }
                lead={l}
              />
            )}
          </section>
        </>
      )}
    </DataState>
  );
}
function Related({ type, lead }) {
  const { open } = useApp();
  const [page, setPage] = useState(1),
    state = useLoad("/" + type + qs({ lead: lead.id, page }));
  return (
    <>
      <div className="list-top">
        <h3>Linked records</h3>
        <Button icon={Plus} onClick={() => open(type, { lead })}>
          Add{" "}
          {
            {
              tasks: "follow-up",
              calls: "call",
              visits: "visit",
              meetings: "meeting",
              messages: "message",
              quotations: "quotation",
              bookings: "booking",
              opportunities: "opportunity",
            }[type]
          }
        </Button>
      </div>
      <DataState state={state}>
        {(r) => (
          <>
            {r.items.length ? (
              <div className="related-list">
                {r.items.map((x) => (
                  <button
                    key={x.id}
                    onClick={() => open("record", { type, row: x })}
                  >
                    <span>
                      <b>
                        {x.subject ||
                          x.title ||
                          x.purpose ||
                          x.outcome ||
                          x.type ||
                          code(type.slice(0, 2).toUpperCase(), x.id)}
                      </b>
                      <small>
                        {stamp(x.due_at || x.created_at)} ·{" "}
                        {x.owner || lead.owner}
                      </small>
                    </span>
                    <Badge>{x.status || x.outcome || x.stage}</Badge>
                    <ChevronRight size={15} />
                  </button>
                ))}
              </div>
            ) : (
              <Empty
                title="No linked records yet"
                text="Add the first record to keep this lead’s history complete."
              />
            )}
            <Pager page={page} set={setPage} total={r.total} size={r.size} />
          </>
        )}
      </DataState>
    </>
  );
}
export function Pipeline() {
  const { boot, allowed, open, refresh, toast } = useApp(),
    [view, setView] = useState("Board"),
    [project, setProject] = useState(""),
    [over, setOver] = useState("");
  const state = useLoad("/pipeline" + qs({ project }));
  async function drop(e, stage) {
    e.preventDefault();
    setOver("");
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    try {
      await api("/leads/" + Number(id), "PATCH", { stage });
      refresh();
      toast("Pipeline stage updated.");
    } catch (e) {
      toast(e.message, "error");
    }
  }
  return (
    <>
      <PageHead
        eyebrow="SALES WORKSPACE"
        title="Sales pipeline"
        sub="Follow every enquiry from its first conversation to a confirmed booking."
      >
        {allowed("writeLead") && (
          <Button kind="primary" icon={Plus} onClick={() => open("add-lead")}>
            Add lead
          </Button>
        )}
      </PageHead>
      <div className="section-row">
        <div className="segmented">
          {[
            ["Board", LayoutGrid],
            ["Table", Table2],
            ...(allowed("writeLead")
              ? [["Opportunities", BriefcaseBusiness]]
              : []),
          ].map(([n, I]) => (
            <button
              className={n === view ? "active" : ""}
              key={n}
              onClick={() => setView(n)}
            >
              <I size={14} />
              {n}
            </button>
          ))}
        </div>
        <Select
          value={project}
          icon={Building2}
          label="Pipeline project"
          options={[
            { value: "", label: "All projects" },
            ...boot.projects.map((p) => ({ value: p.id, label: p.name })),
          ]}
          onChange={setProject}
        />
      </div>
      {view === "Opportunities" ? (
        <OpportunityList project={project} />
      ) : view === "Table" ? (
        <Leads key={project} embedded query={{ project }} />
      ) : (
        <DataState state={state}>
          {(cols) => (
            <div className="kanban">
              {cols.map((c, i) => (
                <section
                  className={
                    "kanban-col " + (over === c.stage ? "drag-over" : "")
                  }
                  key={c.stage}
                  onDragOver={(e) => {
                    if (allowed("writeLead")) {
                      e.preventDefault();
                      setOver(c.stage);
                    }
                  }}
                  onDrop={(e) => drop(e, c.stage)}
                >
                  <div className="kanban-head">
                    <i
                      style={{
                        background: [
                          "#5494f5",
                          "#6e8ad9",
                          "#8a79dc",
                          "#ad81cf",
                          "#e2a457",
                          "#db9255",
                          "#3d9da2",
                          "#4ca1c5",
                          "#5b83cb",
                          "#61a38b",
                          "#3caa83",
                        ][i],
                      }}
                    />
                    <b>{c.stage}</b>
                    <span>{fmtN(c.n)}</span>
                  </div>
                  <div className="kanban-sum">{money(c.value)} estimated</div>
                  {c.leads.map((l) => (
                    <button
                      key={l.id}
                      className="deal-card"
                      draggable={allowed("writeLead")}
                      onDragStart={(e) =>
                        e.dataTransfer.setData("text/plain", String(l.id))
                      }
                      onDragEnd={() => setOver("")}
                      onClick={() => navigate("leads/" + l.id)}
                    >
                      <div>
                        <small>{code("LD", l.id)}</small>
                        <GripVertical size={13} />
                      </div>
                      <h3>{l.name}</h3>
                      <p>
                        <Building2 size={12} />
                        {l.project}
                      </p>
                      <b>{money(l.budget)}</b>
                      <footer>
                        <Badge>{l.temperature}</Badge>
                        <Avatar name={l.owner || "Unassigned"} size={23} />
                      </footer>
                    </button>
                  ))}
                  {!c.leads.length && (
                    <div className="col-empty">No leads at this stage</div>
                  )}
                  {c.n > 5 && (
                    <button
                      className="text-link"
                      onClick={() =>
                        navigate("leads", { stage: c.stage, project })
                      }
                    >
                      View all {fmtN(c.n)} <ArrowRight size={12} />
                    </button>
                  )}
                </section>
              ))}
            </div>
          )}
        </DataState>
      )}
    </>
  );
}
