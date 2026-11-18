import { salesTools } from "./sales.js";
import { registerImports } from "./imports.js";
import { webhook, extensions, validateVisitPass } from "./extensions.js";
import express from "express";
import { randomBytes, createHash } from "node:crypto";
import {
  stages,
  outcomes,
  sources,
  roles,
  now,
  day,
  insert,
  tx,
  audit,
  hashPassword,
  verifyPassword,
  settings,
  setSetting,
} from "./db.js";
import {
  fail,
  clean,
  required,
  number,
  oneOf,
  dateTime,
  admin,
  can,
  permissions,
  permit,
  scope,
  projectScope,
  getProject,
  getLead,
  entityCaps,
  createLead,
  updateLead,
  createEntity,
  updateEntity,
  normalizePhone,
  task,
  notify,
} from "./core.js";
import {
  pageArgs,
  leadList,
  projectsList,
  dashboard,
  entityList,
  filters,
} from "./queries.js";
const hash = (v) => createHash("sha256").update(v).digest("hex");
const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  team: u.team,
  branch: u.branch,
  active: u.active,
  projects: JSON.parse(u.projects || "[]"),
  last_login: u.last_login,
});
export function api(db, demo) {
  const a = express.Router();
  a.use(express.json({ limit: "6mb" }));
  a.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");
    next();
  });
  const sendSession = (u, res) => {
    const token = randomBytes(32).toString("hex");
    db.prepare("DELETE FROM sessions WHERE expires_at<?").run(now());
    insert(db, "sessions", {
      token: hash(token),
      user_id: u.id,
      expires_at: new Date(Date.now() + 8 * 3600000).toISOString(),
    });
    db.prepare("UPDATE users SET last_login=? WHERE id=?").run(now(), u.id);
    res.json({ token, user: publicUser(u) });
  };
  a.get("/config", (req, res) => res.json({ demo }));
  a.post("/auth/demo", (req, res) => {
    if (!demo) fail("Demo access is disabled.", 403);
    const u = db
      .prepare("SELECT * FROM users WHERE id=? AND active=1")
      .get(Number(req.body?.user_id) || 1);
    if (!u) fail("This user is not active.", 403);
    sendSession(u, res);
  });
  const attempts = new Map();
  a.post("/auth/login", (req, res) => {
    const key = req.ip,
      window = attempts.get(key);
    if (window && window.until > Date.now() && window.count > 8)
      fail("Too many attempts. Please try again in a few minutes.", 429);
    const d = req.body || {},
      u = db
        .prepare("SELECT * FROM users WHERE email=? AND active=1")
        .get(clean(d.email, 200).toLowerCase());
    if (!u || !verifyPassword(clean(d.password, 256), u.password)) {
      attempts.set(key, {
        count: window?.until > Date.now() ? window.count + 1 : 1,
        until: Date.now() + 300000,
      });
      fail("The email or password is incorrect.", 401);
    }
    attempts.delete(key);
    sendSession(u, res);
  });
  a.post("/integrations/:type", (req, res) => webhook(db, req, res));
  a.use((req, res, next) => {
    const t = String(req.headers.authorization || "").replace(/^Bearer /, "");
    const u =
      t &&
      db
        .prepare(
          "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>? AND u.active=1",
        )
        .get(hash(t), now());
    if (!u) fail("Please sign in to your workspace.", 401);
    req.user = u;
    next();
  });
  extensions(a, db);
  salesTools(a, db);
  a.post("/auth/logout", (req, res) => {
    db.prepare("DELETE FROM sessions WHERE token=?").run(
      hash(req.headers.authorization.slice(7)),
    );
    res.json({ ok: true });
  });
  a.get("/bootstrap", (req, res) => {
    const u = req.user;
    res.json({
      demo,
      demoUsers: demo
        ? db
            .prepare("SELECT id,name,role,active FROM users WHERE active=1")
            .all()
        : undefined,
      integrationReady: (process.env.CRM_WEBHOOK_SECRET || "").length >= 32,
      user: publicUser(u),
      permissions: permissions(u),
      projects: projectsList(db, u),
      users: db
        .prepare(
          "SELECT id,name,role,team,branch,projects,active FROM users WHERE active=1 ORDER BY id",
        )
        .all()
        .filter(
          (x) =>
            admin(u) ||
            (can(u, "assign") && u.team === x.team) ||
            x.id === u.id,
        )
        .map((x) => ({ ...x, projects: JSON.parse(x.projects) })),
      stages,
      outcomes,
      sources,
      roles,
      settings: settings(db),
      today: day(),
      unread: db
        .prepare(
          "SELECT count(*) n FROM notifications WHERE user_id=? AND is_read=0",
        )
        .get(u.id).n,
      workCount: db
        .prepare(
          `SELECT count(*) n FROM tasks t JOIN leads l ON l.id=t.lead_id WHERE t.owner_id=? AND ${scope(u)} AND date(t.due_at)=? AND t.status IN ('Open','In Progress')`,
        )
        .get(u.id, day()).n,
    });
  });
  a.get("/dashboard", (req, res) =>
    res.json(dashboard(db, req.user, req.query)),
  );
  a.get("/reports/export", (req, res) => {
    permit(req.user, "reports");
    permit(req.user, "export");
    const d = dashboard(db, req.user, req.query);
    audit(
      db,
      req.user.id,
      null,
      "Report exported",
      `Sales report · ${d.range.start} to ${d.range.end}`,
    );
    res.json(d);
  });
  a.get("/leads", (req, res) => {
    permit(req.user, "readLeads");
    res.json(leadList(db, req.user, req.query));
  });
  a.post("/leads", (req, res) =>
    res.status(201).json(tx(db, () => createLead(db, req.user, req.body))),
  );
  a.get("/lead-options", (req, res) => {
    permit(req.user, "inventory");
    const r = leadList(db, req.user, req.query);
    res.json({
      ...r,
      items: r.items.map((l) => ({
        id: l.id,
        name: l.name,
        project: l.project,
        project_id: l.project_id,
      })),
    });
  });
  a.get("/leads/export", (req, res) => {
    permit(req.user, "export");
    const rows = leadList(db, req.user, req.query, true);
    if (rows.total > 50000)
      fail("Use a smaller date range for exports above 50,000 rows.");
    audit(
      db,
      req.user.id,
      null,
      "Lead export",
      `${rows.total} filtered records exported.`,
    );
    res.json(rows);
  });
  a.post("/leads/bulk", (req, res) => {
    const d = req.body;
    if (!Array.isArray(d.ids) || d.ids.length > 200 || !d.ids.length)
      fail("Select between 1 and 200 leads.");
    const ids = [...new Set(d.ids.map(Number))];
    tx(db, () =>
      ids.forEach((id) => {
        if (d.action === "task") {
          permit(req.user, "activity");
          task(db, req.user, getLead(db, req.user, id), d);
        } else if (d.action === "stage")
          updateLead(db, req.user, id, {
            stage: required(d.stage, "Stage"),
            reason: d.reason,
          });
        else if (d.action === "assign")
          updateLead(db, req.user, id, {
            owner_id: d.owner_id,
            reason: d.reason,
          });
        else fail("Unknown bulk action.");
      }),
    );
    res.json({ message: `${ids.length} leads updated.` });
  });
  a.get("/leads/:id", (req, res) => {
    permit(req.user, "readLeads");
    const l = getLead(db, req.user, req.params.id);
    l.details = JSON.parse(l.details);
    res.json({
      ...l,
      contact_details: JSON.parse(
        db.prepare("SELECT details FROM contacts WHERE id=?").get(l.contact_id)
          .details,
      ),
      enquiries: db
        .prepare(
          "SELECT * FROM enquiries WHERE lead_id=? ORDER BY id DESC LIMIT 50",
        )
        .all(l.id),
      interests: db
        .prepare(
          `SELECT l.id,p.name project,l.stage FROM leads l JOIN projects p ON p.id=l.project_id WHERE l.contact_id=? AND ${scope(req.user)}`,
        )
        .all(l.contact_id),
    });
  });
  a.patch("/leads/:id", (req, res) =>
    res.json(
      tx(db, () => updateLead(db, req.user, Number(req.params.id), req.body)),
    ),
  );
  a.post("/leads/:id/notes", (req, res) => {
    permit(req.user, "activity");
    const l = getLead(db, req.user, req.params.id);
    audit(
      db,
      req.user.id,
      l.id,
      "Note added",
      required(req.body.note, "Note"),
      l.project_id,
    );
    db.prepare("UPDATE leads SET updated_at=? WHERE id=?").run(now(), l.id);
    res.status(201).json({ message: "Note added to the activity timeline." });
  });
  a.get("/activities", (req, res) => {
    const u = req.user,
      q = req.query;
    if (q.lead) {
      permit(u, "readLeads");
      getLead(db, u, q.lead);
    } else permit(u, "audit");
    let w =
      " WHERE " +
      (admin(u)
        ? "1=1"
        : `(a.lead_id IN (SELECT l.id FROM leads l WHERE ${scope(u)}) OR (a.lead_id IS NULL AND a.user_id=${Number(u.id)}))`);
    const args = [];
    if (q.lead) {
      w += " AND a.lead_id=?";
      args.push(Number(q.lead));
    }
    if (q.q) {
      w += " AND (a.description LIKE ? OR a.kind LIKE ?)";
      args.push("%" + clean(q.q) + "%", "%" + clean(q.q) + "%");
    }
    if (q.kind) {
      w += " AND a.kind=?";
      args.push(clean(q.kind));
    }
    const { size, page } = pageArgs(q);
    res.json({
      items: db
        .prepare(
          "SELECT a.*,u.name author FROM activities a LEFT JOIN users u ON u.id=a.user_id" +
            w +
            " ORDER BY a.created_at DESC,a.id DESC LIMIT ? OFFSET ?",
        )
        .all(...args, size, (page - 1) * size),
      total: db.prepare("SELECT count(*) n FROM activities a" + w).get(...args)
        .n,
      page,
      size,
    });
  });
  a.get("/pipeline", (req, res) => {
    permit(req.user, "readLeads");
    const f = filters(req.user, req.query);
    res.json(
      stages.map((stage) => {
        const stats = db
          .prepare(
            `SELECT count(*) n,COALESCE(sum(budget),0) value FROM leads l WHERE ${f.conditions.join(" AND ")} AND l.stage=?`,
          )
          .get(...f.params, stage);
        return {
          stage,
          ...stats,
          leads: leadList(db, req.user, { ...req.query, stage, size: 5 }).items,
        };
      }),
    );
  });
  for (const type of Object.keys(entityCaps)) {
    a.get("/" + type, (req, res) => {
      permit(req.user, entityCaps[type]);
      res.json(entityList(db, req.user, type, req.query));
    });
    a.post("/" + type, (req, res) =>
      res.status(201).json(
        tx(db, () =>
          createEntity(db, req.user, type, {
            ...req.body,
            _provider: null,
            _recording: null,
          }),
        ),
      ),
    );
    if (
      [
        "tasks",
        "visits",
        "meetings",
        "quotations",
        "bookings",
        "opportunities",
      ].includes(type)
    )
      a.patch("/" + type + "/:id", (req, res) => {
        const id = Number(req.params.id),
          checking = type === "visits" && req.body.status === "Checked in";
        if (checking) validateVisitPass(db, req.user, id, req.body.code);
        res.json(
          tx(db, () => {
            const result = updateEntity(db, req.user, type, id, {
              ...req.body,
              _verified: checking,
            });
            if (checking)
              db.prepare("DELETE FROM visit_passes WHERE visit_id=?").run(id);
            return result;
          }),
        );
      });
  }
  a.get("/projects", (req, res) => res.json(projectsList(db, req.user)));
  a.post("/projects", (req, res) => {
    permit(req.user, "projects");
    const d = req.body,
      id = insert(db, "projects", {
        name: required(d.name, "Project name"),
        category: oneOf(
          d.category,
          ["Residential", "Commercial", "Mixed-use"],
          "category",
        ),
        location: required(d.location, "Location"),
        city: clean(d.city),
        developer: clean(d.developer),
        rera: clean(d.rera),
        description: clean(d.description),
        start_price: number(d.start_price, "Starting price"),
        status: oneOf(
          d.status || "Active",
          ["Active", "Upcoming", "Completed"],
          "project status",
        ),
        created_at: now(),
      });
    audit(db, req.user.id, null, "Project created", clean(d.name), id);
    res.status(201).json({ id, message: "Project added to your portfolio." });
  });
  a.get("/units", (req, res) => {
    permit(req.user, "inventory");
    let w = ` WHERE ${projectScope(req.user, "x.project_id")}`,
      args = [];
    for (const [k, col] of [
      ["project", "project_id"],
      ["status", "status"],
      ["tower", "tower"],
      ["floor", "floor"],
    ])
      if (req.query[k] && req.query[k] !== "all") {
        w += ` AND x.${col}=?`;
        args.push(req.query[k]);
      }
    if (req.query.q) {
      w += " AND (x.tower||'-'||x.number LIKE ? OR x.category LIKE ?)";
      args.push("%" + clean(req.query.q) + "%", "%" + clean(req.query.q) + "%");
    }
    if (req.query.eligible) {
      const lead = getLead(db, req.user, req.query.eligible);
      w +=
        " AND x.project_id=? AND (x.status='Available' OR (x.status='On Hold' AND x.lead_id=?))";
      args.push(lead.project_id, lead.id);
    }
    const { page, size } = pageArgs(req.query);
    res.json({
      items: db
        .prepare(
          "SELECT x.*,p.name project,round(x.area*x.rate) price FROM units x JOIN projects p ON p.id=x.project_id" +
            w +
            " ORDER BY x.project_id,x.floor,x.id LIMIT ? OFFSET ?",
        )
        .all(...args, size, (page - 1) * size),
      total: db.prepare("SELECT count(*) n FROM units x" + w).get(...args).n,
      size,
      page,
    });
  });
  a.post("/units", (req, res) => {
    permit(req.user, "pricing");
    const d = req.body,
      p = getProject(db, req.user, d.project_id);
    const id = insert(db, "units", {
      project_id: p.id,
      number: required(d.number, "Unit number"),
      tower: clean(d.tower, 40) || "A",
      floor: number(d.floor, "Floor", -5, 250),
      category: required(d.category, "Unit type"),
      area: number(d.area, "Saleable area", 1),
      rate: number(d.rate, "Rate per sq. ft.", 1),
      created_at: now(),
    });
    audit(
      db,
      req.user.id,
      null,
      "Unit created",
      `Unit ${d.number} · ${p.name}`,
      p.id,
    );
    res.status(201).json({ id, message: "Inventory unit created." });
  });
  a.patch("/units/:id", (req, res) => {
    permit(req.user, "inventory");
    const d = req.body,
      unit = db
        .prepare(
          `SELECT * FROM units WHERE id=? AND ${projectScope(req.user, "project_id")}`,
        )
        .get(Number(req.params.id));
    if (!unit) fail("Unit not found.", 404);
    res.json(
      tx(db, () => {
        if (d.action === "hold") {
          if (unit.status !== "Available")
            fail("Only available units can be held.", 409);
          const l = getLead(db, req.user, d.lead_id);
          if (l.project_id !== unit.project_id)
            fail("Lead and unit must belong to the same project.");
          const reason = required(d.reason, "Hold reason"),
            until = new Date(
              Date.now() + settings(db).holdHours * 3600000,
            ).toISOString();
          db.prepare(
            "UPDATE units SET status='On Hold',lead_id=?,reason=?,hold_until=? WHERE id=?",
          ).run(l.id, reason, until, unit.id);
          audit(
            db,
            req.user.id,
            l.id,
            "Unit held",
            `${unit.tower}-${unit.number} until ${until.slice(0, 16)} · ${reason}`,
            l.project_id,
          );
        } else if (d.action === "release") {
          if (unit.status !== "On Hold") fail("The unit is not on hold.");
          if (!can(req.user, "pricing")) getLead(db, req.user, unit.lead_id);
          db.prepare(
            "UPDATE units SET status='Available',lead_id=NULL,reason=NULL,hold_until=NULL WHERE id=?",
          ).run(unit.id);
          audit(
            db,
            req.user.id,
            unit.lead_id,
            "Hold released",
            `Unit ${unit.tower}-${unit.number} · ${required(d.reason, "Release reason")}`,
            unit.project_id,
          );
        } else if (d.action === "price") {
          permit(req.user, "pricing");
          if (!["Available", "On Hold"].includes(unit.status))
            fail("Booked or blocked unit prices are locked.");
          const rate = number(d.rate, "New rate", 1);
          db.prepare("UPDATE units SET rate=? WHERE id=?").run(rate, unit.id);
          audit(
            db,
            req.user.id,
            null,
            "Unit price updated",
            `${unit.tower}-${unit.number}: ₹${unit.rate} → ₹${rate} / sq ft`,
            unit.project_id,
          );
        } else fail("Unknown inventory action.");
        return { message: "Inventory updated." };
      }),
    );
  });
  a.get("/campaigns", (req, res) => {
    permit(req.user, "marketing");
    res.json(
      db
        .prepare(
          `SELECT c.*,p.name project,(SELECT count(*) FROM leads l WHERE l.campaign=c.name AND ${scope(req.user)}) leads,(SELECT count(*) FROM leads l WHERE l.campaign=c.name AND l.stage IN ('Qualified','Interested','Visit Scheduled','Visit Completed','Negotiation','Quotation Sent','Booking In Progress','Booked / Won') AND ${scope(req.user)}) qualified FROM campaigns c JOIN projects p ON p.id=c.project_id WHERE ${projectScope(req.user, "c.project_id")} ORDER BY c.id DESC`,
        )
        .all(),
    );
  });
  a.post("/campaigns", (req, res) => {
    permit(req.user, "marketing");
    const d = req.body,
      p = getProject(db, req.user, d.project_id),
      start = dateTime(d.start_date).slice(0, 10),
      end = dateTime(d.end_date).slice(0, 10);
    if (end < start) fail("End date cannot be before the start date.");
    const id = insert(db, "campaigns", {
      name: required(d.name, "Campaign name"),
      source: oneOf(d.source, sources, "source"),
      project_id: p.id,
      budget: number(d.budget, "Budget"),
      spend:
        d.spend === "" || d.spend == null ? null : number(d.spend, "Spend"),
      start_date: start,
      end_date: end,
      status: oneOf(
        d.status || "Active",
        ["Active", "Planned", "Paused", "Completed"],
        "status",
      ),
      created_at: now(),
    });
    audit(db, req.user.id, null, "Campaign created", clean(d.name), p.id);
    res.status(201).json({ id, message: "Campaign created." });
  });
  a.get("/partners", (req, res) => {
    permit(req.user, "partners");
    res.json(
      db
        .prepare(
          `SELECT p.*,(SELECT count(*) FROM partner_leads pl JOIN leads l ON l.id=pl.lead_id WHERE pl.partner_id=p.id AND ${scope(req.user)}) leads FROM partners p ORDER BY id DESC`,
        )
        .all(),
    );
  });
  a.post("/partners", (req, res) => {
    permit(req.user, "partners");
    const d = req.body,
      id = insert(db, "partners", {
        name: required(d.name, "Partner name"),
        company: required(d.company, "Company"),
        email: clean(d.email),
        phone: normalizePhone(d.phone),
        status: oneOf(
          d.status || "Active",
          ["Active", "Pending", "Inactive"],
          "status",
        ),
        created_at: now(),
      });
    audit(db, req.user.id, null, "Partner registered", clean(d.company));
    res.status(201).json({ id, message: "Channel partner registered." });
  });
  a.get("/team", (req, res) => {
    permit(req.user, "team");
    const u = req.user;
    res.json(
      db
        .prepare("SELECT * FROM users ORDER BY id")
        .all()
        .filter(
          (x) =>
            admin(u) ||
            u.role === "Sales Head" ||
            (x.team === u.team && x.branch === u.branch),
        )
        .map((x) => ({
          ...publicUser(x),
          leads: db
            .prepare(
              `SELECT count(*) n FROM leads l WHERE l.owner_id=? AND ${scope(u)}`,
            )
            .get(x.id).n,
          calls: db
            .prepare(
              `SELECT count(*) n FROM calls c JOIN leads l ON l.id=c.lead_id WHERE c.user_id=? AND ${scope(u)}`,
            )
            .get(x.id).n,
          bookings: db
            .prepare(
              `SELECT count(*) n FROM bookings b JOIN leads l ON l.id=b.lead_id WHERE b.user_id=? AND b.status='Confirmed' AND ${scope(u)}`,
            )
            .get(x.id).n,
        })),
    );
  });
  a.post("/users", (req, res) => {
    permit(req.user, "manageUsers");
    const d = req.body;
    if ((d.password || "").length < 12)
      fail("Choose a password with at least 12 characters.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email || ""))
      fail("Enter a valid official email.");
    const proj = (d.projects || []).map(Number);
    proj.forEach((id) => getProject(db, req.user, id));
    const id = insert(db, "users", {
      name: required(d.name, "User name"),
      email: clean(d.email).toLowerCase(),
      role: oneOf(d.role, roles, "role"),
      team: required(d.team, "Team"),
      branch: required(d.branch, "Branch"),
      projects: JSON.stringify(proj),
      password: hashPassword(clean(d.password, 256)),
      created_at: now(),
    });
    audit(db, req.user.id, null, "User created", `${d.name} · ${d.role}`);
    res.status(201).json({ id, message: "CRM user created." });
  });
  a.patch("/users/:id", (req, res) => {
    permit(req.user, "manageUsers");
    const id = Number(req.params.id);
    if (req.user.id === id) fail("You cannot deactivate your own account.");
    const user = db.prepare("SELECT * FROM users WHERE id=?").get(id);
    if (!user) fail("User not found.", 404);
    const active = req.body.active ? 1 : 0;
    db.prepare("UPDATE users SET active=? WHERE id=?").run(active, id);
    if (!active) db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
    audit(
      db,
      req.user.id,
      null,
      "User access changed",
      `${user.name}: ${active ? "Active" : "Inactive"}`,
    );
    res.json({ message: "Access updated." });
  });
  a.get("/notifications", (req, res) =>
    res.json(
      db
        .prepare(
          "SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 100",
        )
        .all(req.user.id),
    ),
  );
  a.post("/notifications/read", (req, res) => {
    if (req.body.id)
      db.prepare(
        "UPDATE notifications SET is_read=1 WHERE user_id=? AND id=?",
      ).run(req.user.id, Number(req.body.id));
    else
      db.prepare("UPDATE notifications SET is_read=1 WHERE user_id=?").run(
        req.user.id,
      );
    res.json({ message: "Notifications marked as read." });
  });
  a.patch("/settings", (req, res) => {
    permit(req.user, "settings");
    const d = req.body,
      s = {
        assignment: oneOf(
          d.assignment,
          ["Round robin", "Lowest workload", "Manual"],
          "assignment method",
        ),
        workload: number(d.workload, "Workload limit", 1, 100000),
        firstContactMinutes: number(
          d.firstContactMinutes,
          "First response SLA",
          1,
          1440,
        ),
        holdHours: number(d.holdHours, "Hold duration", 1, 720),
        hotThreshold: number(d.hotThreshold, "Hot threshold", 1, 100),
        warmThreshold: number(d.warmThreshold, "Warm threshold", 0, 99),
        callbackTasks: !!d.callbackTasks,
      };
    if (s.hotThreshold <= s.warmThreshold)
      fail("Hot threshold must be higher than warm threshold.");
    tx(db, () => {
      Object.entries(s).forEach(([k, v]) => setSetting(db, k, v));
      audit(
        db,
        req.user.id,
        null,
        "Settings updated",
        "Assignment, scoring and reminder rules updated.",
      );
    });
    res.json({ message: "Workspace rules saved." });
  });
  a.get("/imports", (req, res) => {
    permit(req.user, "import");
    res.json(
      db
        .prepare("SELECT * FROM batches ORDER BY id DESC LIMIT 100")
        .all()
        .filter((b) => admin(req.user) || b.user_id === req.user.id)
        .map((b) => ({ ...b, failures: JSON.parse(b.failures) })),
    );
  });
  registerImports(a, db);
  a.post("/imports/:id/rollback", (req, res) => {
    permit(req.user, "settings");
    const id = Number(req.params.id),
      batch = db.prepare("SELECT * FROM batches WHERE id=?").get(id);
    if (!batch || batch.status !== "Completed")
      fail("This batch is not available for rollback.");
    res.json(
      tx(db, () => {
        const changed = db
          .prepare(
            "SELECT count(*) n FROM leads l WHERE l.batch_id=? AND (l.updated_at<>l.created_at OR EXISTS (SELECT 1 FROM enquiries e WHERE e.lead_id=l.id AND (e.batch_id IS NULL OR e.batch_id<>?)) OR EXISTS (SELECT 1 FROM activities a WHERE a.lead_id=l.id AND a.id>COALESCE((SELECT b.last_activity FROM batch_snapshots b WHERE b.batch_id=l.batch_id AND b.lead_id=l.id),0))) ",
          )
          .get(id, id).n;
        if (changed)
          fail(
            "This batch contains active sales work. Review it manually before rollback.",
            409,
          );
        db.prepare("UPDATE leads SET archived=1 WHERE batch_id=?").run(id);
        db.prepare("UPDATE batches SET status='Rolled back' WHERE id=?").run(
          id,
        );
        audit(
          db,
          req.user.id,
          null,
          "Import rolled back",
          `Batch ${id} archived; contacts, linked enquiries and audit history retained.`,
        );
        return {
          message: "Imported leads archived. Historical records preserved.",
        };
      }),
    );
  });
  a.use((req, res) => res.status(404).json({ error: "Endpoint not found." }));
  a.use((error, req, res, next) => {
    const conflict = error.message?.includes("UNIQUE constraint");
    if (!error.status && !conflict)
      console.error("API error:", req.method, req.path, error.message);
    res.status(error.status || (conflict ? 409 : 500)).json({
      error: conflict
        ? "A record with these details already exists."
        : error.status
          ? error.message
          : "Unable to save or load this record. Please check the values and try again.",
    });
  });
  return a;
}
export function runReminders(db) {
  const at = now();
  tx(db, () => {
    for (const t of db
      .prepare(
        "SELECT t.*,l.project_id FROM tasks t JOIN leads l ON l.id=t.lead_id WHERE l.archived=0 AND t.status IN ('Open','In Progress') AND t.due_at<=? AND (NOT EXISTS (SELECT 1 FROM events e WHERE e.external_id='task-due:'||t.id) OR (t.due_at<? AND NOT EXISTS (SELECT 1 FROM events e WHERE e.external_id='escalate:'||t.id))) ORDER BY t.due_at LIMIT 1000",
      )
      .all(at, new Date(Date.now() - 86400000).toISOString())) {
      if (!t.owner_id) continue;
      const id = "task-due:" + t.id;
      if (!db.prepare("SELECT 1 FROM events WHERE external_id=?").get(id)) {
        notify(
          db,
          t.owner_id,
          "Follow-up due",
          t.subject,
          t.lead_id,
          "Reminder",
        );
        insert(db, "events", {
          external_id: id,
          kind: "reminder",
          record_id: t.id,
          created_at: at,
        });
      }
      if (
        +new Date(t.due_at) < Date.now() - 86400000 &&
        !db
          .prepare("SELECT 1 FROM events WHERE external_id=?")
          .get("escalate:" + t.id)
      ) {
        const manager = db
          .prepare(
            "SELECT id FROM users WHERE role='Sales Manager' AND active=1 AND team=(SELECT team FROM users WHERE id=?) LIMIT 1",
          )
          .get(t.owner_id);
        if (manager)
          notify(
            db,
            manager.id,
            "Overdue follow-up",
            t.subject,
            t.lead_id,
            "Escalation",
          );
        insert(db, "events", {
          external_id: "escalate:" + t.id,
          kind: "escalation",
          record_id: t.id,
          created_at: at,
        });
      }
    }
    for (const un of db
      .prepare(
        "SELECT * FROM units WHERE status='On Hold' AND hold_until<? AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.unit_id=units.id AND b.status IN ('Pending approval','Confirmed'))",
      )
      .all(at)) {
      db.prepare(
        "UPDATE units SET status='Available',lead_id=NULL,hold_until=NULL WHERE id=?",
      ).run(un.id);
      audit(
        db,
        null,
        un.lead_id,
        "Hold expired",
        `Unit ${un.tower}-${un.number} returned to available inventory.`,
        un.project_id,
      );
    }
  });
}
