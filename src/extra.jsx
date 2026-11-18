import { useState, useRef } from "react";
import {
  Plus,
  FileText,
  Upload,
  Download,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Check,
  Trash2,
  RefreshCw,
  Route,
  CheckCircle2,
} from "lucide-react";
import {
  useApp,
  useLoad,
  api,
  qs,
  code,
  fmtN,
  fmtDate,
  stamp,
  Button,
  IconButton,
  Badge,
  Field,
  DataState,
  Empty,
  ErrorBox,
  Modal,
} from "./lib";
export function LeadDocuments({ lead }) {
  const { allowed, refresh, toast } = useApp(),
    state = useLoad("/leads/" + lead.id + "/documents"),
    [err, setErr] = useState(""),
    [busy, setBusy] = useState(false),
    input = useRef(null);
  async function upload(f) {
    if (!f) return;
    setBusy(true);
    setErr("");
    try {
      if (f.size > 4 * 1024 * 1024) throw Error("Choose a file under 4 MB.");
      const base64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1]);
        r.onerror = () => reject(Error("Cannot read this file."));
        r.readAsDataURL(f);
      });
      await api("/leads/" + lead.id + "/documents", "POST", {
        name: f.name,
        content: base64,
      });
      refresh();
      toast("Document attached.");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
      input.current.value = "";
    }
  }
  async function get(d) {
    try {
      const res = await fetch("/api/documents/" + d.id + "/download", {
        headers: {
          Authorization: "Bearer " + sessionStorage.getItem("brg.session"),
        },
      });
      if (!res.ok) throw Error("Document not available for your account.");
      const url = URL.createObjectURL(await res.blob()),
        a = document.createElement("a");
      a.href = url;
      a.download = d.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (e) {
      toast(e.message, "error");
    }
  }
  return (
    <>
      <div className="list-top">
        <div>
          <h3>Protected documents</h3>
          <p className="fine-print" style={{ margin: 0 }}>
            Accessible only to authorized lead viewers · PDF, JPEG, or PNG
          </p>
        </div>
        {allowed("activity") && (
          <>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              ref={input}
              hidden
              onChange={(e) => upload(e.target.files[0])}
            />
            <Button
              icon={Upload}
              disabled={busy}
              onClick={() => input.current.click()}
            >
              {busy ? "Uploading…" : "Attach file"}
            </Button>
          </>
        )}
      </div>
      {err && <ErrorBox error={err} />}
      <DataState state={state}>
        {(rows) =>
          rows.length ? (
            <div className="file-list">
              {rows.map((d) => (
                <div key={d.id}>
                  <span className="task-symbol blue">
                    <FileText size={16} />
                  </span>
                  <span>
                    <b>{d.name}</b>
                    <small>
                      {Math.ceil(d.bytes / 1024)} KB · {d.author} ·{" "}
                      {stamp(d.created_at)}
                    </small>
                  </span>
                  <IconButton
                    icon={Download}
                    label={"Download " + d.name}
                    onClick={() => get(d)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <Empty
              icon={FileText}
              title="No documents attached"
              text="Attach a quotation reference, customer document, or site image. Files are never exposed by public URLs."
            />
          )
        }
      </DataState>
    </>
  );
}
export function RoutingRules() {
  const { boot, toast, refresh } = useApp(),
    [rules, setRules] = useState(boot.settings.routingRules || []),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const update = (i, k, v) =>
    setRules((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/routing-rules", "PATCH", { rules });
      refresh();
      toast("Routing rules saved.");
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="padded" onSubmit={save}>
      <div className="info-banner">
        <Route size={17} />
        <p>
          Rules are evaluated from top to bottom. The first match routes the
          enquiry to an eligible team, then applies round robin or lowest
          workload. If no employee is eligible, the lead remains in the
          unassigned queue.
        </p>
      </div>
      {!rules.length && (
        <Empty
          icon={Route}
          title="Default project routing is active"
          text="Add a rule to route a specific source, project, or location to a sales team."
        />
      )}
      {rules.map((r, i) => (
        <div className="routing-rule" key={i}>
          <div className="section-row">
            <h3>Rule {i + 1}</h3>
            <IconButton
              icon={Trash2}
              label={"Remove rule " + (i + 1)}
              type="button"
              onClick={() => setRules(rules.filter((_, j) => j !== i))}
            />
          </div>
          <div className="form-grid">
            <Field label="Rule name" required>
              <input
                required
                value={r.name}
                onChange={(e) => update(i, "name", e.target.value)}
              />
            </Field>
            <Field label="Destination team" required>
              <select
                value={r.team}
                onChange={(e) => update(i, "team", e.target.value)}
              >
                {[...new Set(boot.users.map((u) => u.team))].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Match project">
              <select
                value={r.project_id || ""}
                onChange={(e) => update(i, "project_id", e.target.value)}
              >
                <option value="">Any project</option>
                {boot.projects.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Match source">
              <select
                value={r.source || ""}
                onChange={(e) => update(i, "source", e.target.value)}
              >
                <option value="">Any source</option>
                {boot.sources.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="City, district, or state" full>
              <input
                placeholder="Any location"
                value={r.location || ""}
                onChange={(e) => update(i, "location", e.target.value)}
              />
            </Field>
          </div>
        </div>
      ))}
      {error && <ErrorBox error={error} />}
      <div className="section-row">
        <Button
          type="button"
          icon={Plus}
          onClick={() =>
            setRules([
              ...rules,
              {
                name: "",
                team: boot.user.team,
                project_id: "",
                source: "",
                location: "",
              },
            ])
          }
        >
          Add routing rule
        </Button>
        <Button kind="primary" type="submit" icon={Check} disabled={busy}>
          Save routing rules
        </Button>
      </div>
    </form>
  );
}
export function IntegrationInbox() {
  const { refresh, toast } = useApp(),
    state = useLoad("/integration-failures"),
    [row, setRow] = useState(null),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function retry() {
    setError("");
    setBusy(true);
    try {
      const payload = JSON.parse(text);
      await api("/integration-failures/" + row.id + "/retry", "POST", {
        payload,
      });
      refresh();
      toast("Provider event processed.");
      setRow(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="padded">
      <h3>Inbound event review</h3>
      <p className="fine-print">
        Failed authorized events are retained for inspection and idempotent
        retry. Invalid credentials are never logged as event data.
      </p>
      <DataState state={state}>
        {(rows) =>
          rows.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Endpoint</th>
                    <th>Reason</th>
                    <th>Attempts</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.event_id || code("EVT", r.id)}</td>
                      <td>{r.kind}</td>
                      <td>{r.reason}</td>
                      <td>{r.attempts}</td>
                      <td>
                        <Badge>{r.status}</Badge>
                      </td>
                      <td>
                        {r.status === "Needs review" && (
                          <button
                            className="text-link"
                            onClick={() => {
                              setRow(r);
                              setText(JSON.stringify(r.payload, null, 2));
                              setError("");
                            }}
                          >
                            Review event <ArrowRight size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              icon={CheckCircle2}
              title="No failed events"
              text="Rejected provider payloads will appear here once a live adapter is configured."
            />
          )
        }
      </DataState>
      {row && (
        <Modal
          title="Review inbound event"
          sub={row.event_id || "Event " + row.id}
          onClose={() => setRow(null)}
        >
          <div className="modal-scroll">
            <ErrorBox error={row.reason} />
            <Field label="Correct mapped payload">
              <textarea
                rows="10"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </Field>
            {error && <ErrorBox error={error} />}
          </div>
          <div className="modal-footer">
            <Button onClick={() => setRow(null)}>Cancel</Button>
            <Button
              kind="primary"
              icon={RefreshCw}
              disabled={busy}
              onClick={retry}
            >
              Retry event
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
export function ManagementMetrics({ d }) {
  const find = (arr, n) => arr.find((x) => x.name === n)?.value || 0;
  const stats = [
    ["All-time leads", d.totals?.allLeads],
    ["Today’s leads", d.totals?.todayLeads],
    ["Yesterday’s leads", d.totals?.yesterdayLeads],
    ["This month’s leads", d.totals?.monthLeads],
    ["New leads", d.attention.fresh],
    ["Unassigned enquiries", d.attention.unassigned],
    ["Contacted leads", find(d.stages, "Contacted")],
    ["Qualified leads", find(d.stages, "Qualified")],
    ["Interested leads", find(d.stages, "Interested")],
    ["Actionable hot leads", d.attention.hot],
    ["Pending follow-ups", d.dueStats?.pending],
    ["Overdue follow-ups", d.dueStats?.overdue],
    ["Scheduled visits", find(d.visits, "Scheduled")],
    ["Completed visits", find(d.visits, "Completed")],
    ["Field meetings", d.meetings.reduce((n, x) => n + x.value, 0)],
    ["Quotations sent", find(d.quotations, "Sent")],
  ];
  return (
    <section className="panel management-metrics">
      <div className="panel-head">
        <div>
          <h2>Management scorecard</h2>
          <p>Workspace totals and selected-period activity</p>
        </div>
      </div>
      <div>
        {stats.map(([k, v]) => (
          <div key={k}>
            <small>{k}</small>
            <b>{fmtN(v)}</b>
          </div>
        ))}
      </div>
    </section>
  );
}
export function CalendarView({ type, project, mine, status, q, onPick }) {
  const { boot } = useApp(),
    [month, setMonth] = useState(boot.today.slice(0, 7)),
    state = useLoad(
      "/calendar/" +
        type +
        qs({ month, project, mine: mine ? "1" : "", status, q }),
    );
  const d = new Date(month + "-01T00:00:00Z"),
    days = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
    ).getUTCDate(),
    offset = (d.getUTCDay() + 6) % 7;
  const shift = (n) =>
    setMonth(
      new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))
        .toISOString()
        .slice(0, 7),
    );
  return (
    <div className="calendar-wrap">
      <div className="section-row">
        <h3>{fmtDate(d, { month: "long", year: "numeric" })}</h3>
        <div className="toolbar-buttons">
          <IconButton
            label="Previous month"
            icon={ChevronLeft}
            onClick={() => shift(-1)}
          />
          <Button onClick={() => setMonth(boot.today.slice(0, 7))}>
            Today
          </Button>
          <IconButton
            label="Next month"
            icon={ChevronRight}
            onClick={() => shift(1)}
          />
        </div>
      </div>
      <DataState state={state}>
        {(rows) => (
          <div className="calendar-grid">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((k) => (
              <b key={k}>{k}</b>
            ))}
            {Array.from(
              { length: Math.ceil((days + offset) / 7) * 7 },
              (_, i) => {
                const num = i - offset + 1;
                if (num < 1 || num > days)
                  return <div className="calendar-blank" key={i} />;
                const key = month + "-" + String(num).padStart(2, "0"),
                  x = rows.find((r) => r.date === key);
                return (
                  <button
                    className={key === boot.today ? "is-today" : ""}
                    key={i}
                    onClick={() => onPick(key)}
                  >
                    <span>{num}</span>
                    {x && (
                      <small>
                        {x.count} {type === "tasks" ? "tasks" : type}
                      </small>
                    )}
                  </button>
                );
              },
            )}
          </div>
        )}
      </DataState>
    </div>
  );
}
export function OpportunityList({ project }) {
  const { open } = useApp(),
    [page, setPage] = useState(1),
    state = useLoad("/opportunities" + qs({ project, page, size: 15 }));
  return (
    <section className="panel">
      <div className="list-top">
        <h2>Sales opportunities</h2>
        <Button
          kind="primary"
          icon={Plus}
          onClick={() => open("opportunities")}
        >
          Create opportunity
        </Button>
      </div>
      <DataState state={state}>
        {(r) => (
          <>
            {r.total ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Opportunity</th>
                      <th>Customer</th>
                      <th>Project</th>
                      <th>Estimated value</th>
                      <th>Probability</th>
                      <th>Expected close</th>
                      <th>Stage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.items.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <button
                            className="cell-title"
                            onClick={() =>
                              open("record", { row: o, type: "opportunities" })
                            }
                          >
                            {o.title}
                          </button>
                        </td>
                        <td>{o.customer}</td>
                        <td>{o.project}</td>
                        <td>₹{fmtN(o.value)}</td>
                        <td>{o.probability}%</td>
                        <td>{fmtDate(o.expected_close)}</td>
                        <td>
                          <Badge>{o.stage}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title="No opportunities yet"
                text="Create a deal from an existing enquiry to track value, probability, and expected close."
              />
            )}
            {r.total > 15 && (
              <div className="pager">
                <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <span>Page {page}</span>
                <Button
                  disabled={page * 15 >= r.total}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </DataState>
    </section>
  );
}
export function PartnerReviews() {
  const { allowed, refresh, toast } = useApp(),
    state = useLoad("/partner-reviews"),
    [row, setRow] = useState(null),
    [winner, setWinner] = useState(""),
    [reason, setReason] = useState(""),
    [err, setErr] = useState("");
  return (
    <section className="panel" style={{ marginTop: 16 }}>
      <div className="list-top">
        <div>
          <h2>Attribution reviews</h2>
          <p className="fine-print" style={{ margin: 0 }}>
            Conflicting partner registrations are preserved for manager review.
          </p>
        </div>
      </div>
      <DataState state={state}>
        {(rows) =>
          rows.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Lead</th>
                    <th>Original partner</th>
                    <th>New registration</th>
                    <th>Status</th>
                    <th>Resolution</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.customer}</td>
                      <td>{r.original_partner}</td>
                      <td>{r.proposed_partner}</td>
                      <td>
                        <Badge>{r.status}</Badge>
                      </td>
                      <td>
                        {r.status === "Pending" && allowed("approve") ? (
                          <button
                            className="text-link"
                            onClick={() => {
                              setRow(r);
                              setWinner(r.original_id);
                              setReason("");
                              setErr("");
                            }}
                          >
                            Review conflict <ArrowRight size={13} />
                          </button>
                        ) : (
                          r.reason || "Awaiting manager approval"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="padded muted">
              No competing partner registrations.
            </div>
          )
        }
      </DataState>
      {row && (
        <Modal
          title="Resolve partner attribution"
          sub={row.customer + " · " + row.project}
          onClose={() => setRow(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api("/partner-reviews/" + row.id + "/resolve", "POST", {
                  partner_id: winner,
                  reason,
                });
                refresh();
                setRow(null);
                toast("Attribution resolved.");
              } catch (e) {
                setErr(e.message);
              }
            }}
          >
            <div className="modal-scroll form-grid">
              <Field label="Confirmed partner" full>
                <select
                  value={winner}
                  onChange={(e) => setWinner(e.target.value)}
                >
                  <option value={row.original_id}>
                    {row.original_partner}
                  </option>
                  <option value={row.proposed_id}>
                    {row.proposed_partner}
                  </option>
                </select>
              </Field>
              <Field label="Resolution reason" required full>
                <textarea
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
              {err && <ErrorBox error={err} />}
            </div>
            <div className="modal-footer">
              <Button type="button" onClick={() => setRow(null)}>
                Cancel
              </Button>
              <Button type="submit" kind="primary">
                Resolve attribution
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
