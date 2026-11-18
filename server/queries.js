import { day, dayOffset } from "./db.js";
import { scope, projectScope, leadSelect, can, clean, range } from "./core.js";
export const pageArgs = (q) => ({
  size: Math.min(100, Math.max(1, parseInt(q.size) || 15)),
  page: Math.max(1, parseInt(q.page) || 1),
});
export function filters(u, q) {
  const conditions = [scope(u)],
    params = [];
  for (const [key, column] of [
    ["project", "l.project_id"],
    ["source", "l.source"],
    ["stage", "l.stage"],
    ["owner", "l.owner_id"],
    ["campaign", "l.campaign"],
  ])
    if (q[key] && q[key] !== "all") {
      conditions.push(column + "=?");
      params.push(q[key]);
    }
  for (const key of ["team", "branch"])
    if (q[key]) {
      conditions.push(`l.owner_id IN (SELECT id FROM users WHERE ${key}=?)`);
      params.push(clean(q[key], 100));
    }
  return { conditions, params };
}
export function leadList(db, u, q, exportAll = false) {
  const { conditions, params } = filters(u, q);
  if (q.q) {
    let term = clean(q.q, 120);
    if (/^LD-0*\d+$/i.test(term)) {
      conditions.push("l.id=?");
      params.push(Number(term.slice(3)));
    } else {
      if (/^[+\d\s()-]+$/.test(term)) term = term.replace(/[\s()-]/g, "");
      if (term.length >= 3) {
        conditions.push(
          "(l.contact_id IN (SELECT rowid FROM contact_search WHERE contact_search MATCH ?) OR l.id=?)",
        );
        params.push(
          '"' + term.replaceAll('"', '""') + '"',
          /^\d+$/.test(term) ? Number(term) : -1,
        );
      } else {
        conditions.push("(c.name LIKE ? OR c.email LIKE ? OR l.id=?)");
        params.push(term + "%", term + "%", Number(term) || -1);
      }
    }
  }
  if (q.temperature) {
    conditions.push("l.temperature=?");
    params.push(q.temperature);
  }
  if (q.priority) {
    conditions.push("l.priority=?");
    params.push(q.priority);
  }
  const closed =
    "l.stage NOT IN ('Lost','Not Interested','Not Qualified','Booked / Won','Dormant')";
  const views = {
    "My leads": `l.owner_id=${Number(u.id)}`,
    "New leads": "l.stage='New'",
    Unassigned: `l.owner_id IS NULL AND ${closed}`,
    "Hot leads": `l.temperature='Hot' AND ${closed}`,
    "High priority": `l.priority IN ('High','Critical') AND ${closed}`,
    "Follow-up due":
      "EXISTS (SELECT 1 FROM tasks t WHERE t.lead_id=l.id AND t.status IN ('Open','In Progress') AND date(t.due_at)<=date('now'))",
    "Booked leads": "l.stage='Booked / Won'",
    "Lost leads": "l.stage IN ('Lost','Not Interested','Not Qualified')",
  };
  if (views[q.view]) conditions.push(views[q.view]);
  if (q.period || q.from) {
    const r = range(q.from ? { ...q, period: "Custom range" } : q);
    conditions.push("l.created_at>=? AND l.created_at<?");
    params.push(r.start, dayOffset(1, r.end));
  }
  if (q.partner) {
    conditions.push(
      "EXISTS(SELECT 1 FROM partner_leads pl WHERE pl.lead_id=l.id AND pl.partner_id=?)",
    );
    params.push(Number(q.partner));
  }
  const where = " WHERE " + conditions.join(" AND "),
    sort =
      {
        name: "c.name",
        stage: "l.stage",
        score: "l.score",
        updated: "l.updated_at",
        budget: "l.budget",
        created: "l.created_at",
      }[q.sort] || "l.created_at",
    dir = q.dir === "asc" ? "ASC" : "DESC";
  const { size, page } = pageArgs(q);
  const total = db
    .prepare(
      "SELECT count(*) n FROM leads l JOIN contacts c ON c.id=l.contact_id" +
        where,
    )
    .get(...params).n;
  const items = db
    .prepare(
      leadSelect +
        where +
        ` ORDER BY ${sort} ${dir},l.id DESC LIMIT ? OFFSET ?`,
    )
    .all(
      ...params,
      exportAll ? 50000 : size,
      exportAll ? 0 : (page - 1) * size,
    );
  return { items, total, page, size };
}
export function projectsList(db, u) {
  return db
    .prepare(
      `SELECT p.*, (SELECT count(*) FROM units a WHERE a.project_id=p.id) units,(SELECT count(*) FROM units a WHERE a.project_id=p.id AND a.status='Available') available,(SELECT count(*) FROM leads l WHERE l.project_id=p.id AND ${scope(u)}) leads,(SELECT count(*) FROM bookings b JOIN leads l ON l.id=b.lead_id WHERE l.project_id=p.id AND b.status='Confirmed' AND ${scope(u)}) bookings FROM projects p WHERE ${projectScope(u, "p.id")} ORDER BY p.id`,
    )
    .all();
}
export function dashboard(db, u, q) {
  const r = range(q),
    f = filters(u, q),
    w = f.conditions.join(" AND "),
    pr = f.params;
  const count = (a, b) => {
    const between = (col) => `${col} >= ? AND ${col} < ?`;
    const args = [...pr, a, dayOffset(1, b)];
    const leads = db
      .prepare(
        `SELECT count(*) n FROM leads l WHERE ${w} AND ${between("l.created_at")}`,
      )
      .get(...args).n;
    const visits = db
      .prepare(
        `SELECT count(*) n FROM visits v JOIN leads l ON l.id=v.lead_id WHERE ${w} AND ${between("v.due_at")}`,
      )
      .get(...args).n;
    const bk = db
      .prepare(
        `SELECT count(*) n,COALESCE(sum(b.value),0) value FROM bookings b JOIN leads l ON l.id=b.lead_id WHERE ${w} AND b.status='Confirmed' AND ${between("b.confirmed_at")}`,
      )
      .get(...args);
    return [leads, visits, bk.n, bk.value];
  };
  const current = count(r.start, r.end),
    prev = count(r.ps, r.pe);
  const grouped = (a, b) =>
    Object.fromEntries(
      db
        .prepare(
          `SELECT substr(l.created_at,1,10) date,count(*) n FROM leads l WHERE ${w} AND l.created_at>=? AND l.created_at<? GROUP BY date`,
        )
        .all(...pr, a, dayOffset(1, b))
        .map((x) => [x.date, x.n]),
    );
  const gc = grouped(r.start, r.end),
    gp = grouped(r.ps, r.pe);
  const trend = Array.from({ length: r.length }, (_, i) => ({
    date: dayOffset(i, r.start),
    value: gc[dayOffset(i, r.start)] || 0,
    previous: gp[dayOffset(i, r.ps)] || 0,
  }));
  const currentw = w + " AND l.created_at>=? AND l.created_at<?",
    p = [...pr, r.start, dayOffset(1, r.end)];
  const group = (col) =>
    db
      .prepare(
        `SELECT ${col} name, count(*) value FROM leads l WHERE ${currentw} GROUP BY ${col} ORDER BY value DESC`,
      )
      .all(...p);
  const tasks = db
    .prepare(
      `SELECT t.*, c.name customer,p.name project FROM tasks t JOIN leads l ON l.id=t.lead_id JOIN contacts c ON c.id=l.contact_id JOIN projects p ON p.id=l.project_id WHERE ${w} AND t.owner_id=? AND t.due_at>=? AND t.due_at<? AND t.status IN ('Open','In Progress') ORDER BY t.due_at LIMIT 100`,
    )
    .all(...pr, u.id, day(), dayOffset(1));
  const attention = db
    .prepare(
      `SELECT sum(CASE WHEN l.owner_id IS NULL THEN 1 ELSE 0 END) unassigned,sum(CASE WHEN l.stage='New' THEN 1 ELSE 0 END) fresh,sum(CASE WHEN l.temperature='Hot' AND l.stage NOT IN ('Booked / Won','Lost','Not Qualified','Not Interested','Dormant') THEN 1 ELSE 0 END) hot FROM leads l WHERE ${currentw}`,
    )
    .get(...p);
  const activities = (table, datecol) =>
    db
      .prepare(
        `SELECT ${table === "calls" ? "x.outcome" : "x.status"} name,count(*) value FROM ${table} x JOIN leads l ON l.id=x.lead_id WHERE ${w} AND x.${datecol}>=? AND x.${datecol}<? GROUP BY name`,
      )
      .all(...p);
  const dailyMetric = (table, datecol, agg, extra = "") => {
    const vals = Object.fromEntries(
      db
        .prepare(
          `SELECT substr(x.${datecol},1,10) d,${agg} v FROM ${table} x JOIN leads l ON l.id=x.lead_id WHERE ${w} AND x.${datecol}>=? AND x.${datecol}<? ${extra} GROUP BY d`,
        )
        .all(...p)
        .map((v) => [v.d, v.v]),
    );
    return trend.map((row) => vals[row.date] || 0);
  };
  const sparklines = [
    trend.map((t) => t.value),
    dailyMetric("visits", "due_at", "COUNT(*)"),
    dailyMetric(
      "bookings",
      "confirmed_at",
      "COUNT(*)",
      "AND x.status='Confirmed'",
    ),
    dailyMetric(
      "bookings",
      "confirmed_at",
      "SUM(x.value)",
      "AND x.status='Confirmed'",
    ),
  ];
  const totals = db
    .prepare(
      `SELECT count(*) allLeads, sum(l.created_at>=? AND l.created_at<?) todayLeads, sum(l.created_at>=? AND l.created_at<?) yesterdayLeads, sum(l.created_at>=? AND l.created_at<?) monthLeads FROM leads l WHERE ${w}`,
    )
    .get(
      day(),
      dayOffset(1),
      dayOffset(-1),
      day(),
      day().slice(0, 7) + "-01",
      dayOffset(1),
      ...pr,
    );
  const dueStats = db
    .prepare(
      `SELECT COUNT(*) pending,COALESCE(sum(t.due_at<?),0) overdue FROM tasks t JOIN leads l ON l.id=t.lead_id WHERE ${w} AND t.status IN ('Open','In Progress') AND date(t.due_at) BETWEEN ? AND ?`,
    )
    .get(new Date().toISOString(), ...pr, r.start, r.end);
  const won = db
    .prepare(
      `SELECT count(DISTINCT l.id) n FROM leads l JOIN bookings b ON b.lead_id=l.id AND b.status='Confirmed' WHERE ${currentw} AND b.confirmed_at<?`,
    )
    .get(...p, dayOffset(1, r.end)).n;
  return {
    current,
    previous: prev,
    trend,
    sparklines,
    totals,
    dueStats,
    leadConversion: current[0] ? (won / current[0]) * 100 : 0,
    range: r,
    stages: group("l.stage"),
    sources: group("l.source"),
    tasks,
    attention,
    calls: activities("calls", "created_at"),
    followups: activities("tasks", "due_at"),
    visits: activities("visits", "due_at"),
    meetings: activities("meetings", "due_at"),
    quotations: activities("quotations", "created_at"),
    projects: projectsList(db, u).filter(
      (p) => !q.project || q.project === "all" || p.id === Number(q.project),
    ),
    recent: can(u, "readLeads")
      ? leadList(db, u, { ...q, period: q.period || "This month", size: 5 })
          .items
      : [],
  };
}
export function entityList(db, u, type, q) {
  const f = filters(u, q),
    where = f.conditions,
    p = f.params;
  if (q.lead) {
    where.push("x.lead_id=?");
    p.push(Number(q.lead));
  }
  if (q.mine === "1" && type === "tasks") {
    where.push("x.owner_id=?");
    p.push(u.id);
  }
  if (q.q) {
    where.push("(c.name LIKE ? OR pr.name LIKE ?)");
    const v = "%" + clean(q.q, 120) + "%";
    p.push(v, v);
  }
  const statuscol = type === "calls" ? "outcome" : "status";
  if (q.status && q.status !== "All" && type !== "opportunities") {
    where.push(`x.${statuscol}=?`);
    p.push(q.status);
  }
  if (["tasks", "visits", "meetings"].includes(type) && q.date) {
    where.push("date(x.due_at)=?");
    p.push(clean(q.date, 10));
  }
  if (["tasks", "visits", "meetings"].includes(type) && q.when) {
    if (q.when === "Today") {
      where.push("date(x.due_at)=?");
      p.push(day());
    }
    if (q.when === "Upcoming") {
      where.push("date(x.due_at)>?");
      p.push(day());
    }
    if (q.when === "Overdue") {
      where.push(
        "datetime(x.due_at)<datetime('now') AND x.status IN ('Open','In Progress','Scheduled')",
      );
    }
  }
  if (q.period) {
    const r = range(q),
      col = ["tasks", "visits", "meetings"].includes(type)
        ? "x.due_at"
        : type === "bookings"
          ? "COALESCE(x.confirmed_at,x.created_at)"
          : "x.created_at";
    where.push(`${col}>=? AND ${col}<?`);
    p.push(r.start, dayOffset(1, r.end));
  }
  const units = ["quotations", "bookings"].includes(type),
    joins = ` FROM ${type} x JOIN leads l ON l.id=x.lead_id JOIN contacts c ON c.id=l.contact_id JOIN projects pr ON pr.id=l.project_id LEFT JOIN users u ON u.id=${type === "tasks" ? "x.owner_id" : type === "opportunities" ? "l.owner_id" : "x.user_id"} ${units ? "LEFT JOIN units un ON un.id=x.unit_id" : ""} WHERE ${where.join(" AND ")}`;
  const { page, size } = pageArgs(q),
    total = db.prepare("SELECT count(*) n" + joins).get(...p).n;
  const items = db
    .prepare(
      `SELECT x.*,c.name customer,c.phone,c.consent,l.project_id,pr.name project,u.name owner${type === "quotations" ? ",COALESCE((SELECT version FROM quotation_revisions WHERE quote_id=x.id),1) version,(SELECT parent_id FROM quotation_revisions WHERE quote_id=x.id) parent_id" : ""}${units ? ",un.number unit_number,un.tower,un.area,un.rate" : ""}` +
        joins +
        ` ORDER BY ${type === "tasks" ? "CASE WHEN x.status IN ('Open','In Progress') THEN 0 ELSE 1 END," + (q.mine === "1" ? "CASE x.priority WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END," : "") + "x.due_at ASC" : "x.id DESC"} LIMIT ? OFFSET ?`,
    )
    .all(...p, size, (page - 1) * size);
  return { items, total, page, size };
}
