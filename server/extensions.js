/** Authenticated, record-scoped workspace tools. No attachment or provider secret is served statically. */
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { now, insert, tx, audit, setSetting, sources } from "./db.js";
import {
  scope,
  entityCaps,
  permit,
  clean,
  required,
  number,
  oneOf,
  fail,
  getLead,
  getProject,
  createLead,
  createEntity,
  notify,
} from "./core.js";
const digest = (s) => createHash("sha256").update(s).digest("hex");
const eventFields = [
  "event_id",
  "provider_id",
  "lead_id",
  "name",
  "phone",
  "email",
  "city",
  "project_id",
  "source",
  "campaign",
  "consent",
  "configuration",
  "budget",
  "attribution",
  "requirements",
  "contact_details",
  "timeline",
  "direction",
  "outcome",
  "duration",
  "notes",
  "disposition",
  "recording",
];
export const mappedPayload = (d) =>
  Object.fromEntries(eventFields.filter((k) => k in d).map((k) => [k, d[k]]));
function receive(db, type, data) {
  const d = mappedPayload(data);
  const event = type + ":" + required(d.event_id, "Provider event ID"),
    previous = db
      .prepare("SELECT record_id FROM events WHERE external_id=?")
      .get(event);
  if (previous) return { id: previous.record_id, replayed: true };
  const u = db
    .prepare(
      "SELECT * FROM users WHERE active=1 AND role='Super Admin' ORDER BY id LIMIT 1",
    )
    .get();
  if (!u) fail("An active integration administrator is required.", 503);
  return tx(db, () => {
    let result;
    if (type === "leads") result = createLead(db, u, d);
    else {
      const pid = required(d.provider_id, "Provider call ID"),
        existing = db
          .prepare("SELECT id FROM calls WHERE provider_id=?")
          .get(pid);
      result = existing
        ? { id: existing.id, replayed: true }
        : createEntity(db, u, "calls", {
            ...d,
            _provider: pid,
            _recording: /^https:\/\//.test(d.recording || "")
              ? clean(d.recording)
              : null,
          });
    }
    insert(db, "events", {
      external_id: event,
      kind: type,
      record_id: result.id,
      created_at: now(),
    });
    return result;
  });
}
export function webhook(db, req, res) {
  const secret = process.env.CRM_WEBHOOK_SECRET || "",
    given = String(req.headers.authorization || "").replace(/^Bearer /, "");
  if (
    secret.length < 32 ||
    !timingSafeEqual(Buffer.from(digest(given)), Buffer.from(digest(secret)))
  )
    fail(
      "This integration is not configured or its authorization is invalid.",
      401,
    );
  const type = oneOf(req.params.type, ["leads", "calls"], "integration"),
    d = req.body || {};
  try {
    const r = receive(db, type, d);
    res.status(r.replayed ? 200 : 201).json(r);
  } catch (e) {
    const payload = mappedPayload(d),
      event = clean(d.event_id, 200),
      found =
        event &&
        db
          .prepare(
            "SELECT id FROM integration_failures WHERE kind=? AND event_id=? AND status='Needs review'",
          )
          .get(type, event);
    if (found)
      db.prepare(
        "UPDATE integration_failures SET attempts=attempts+1,reason=?,payload=? WHERE id=?",
      ).run(clean(e.message), JSON.stringify(payload), found.id);
    else {
      const id = insert(db, "integration_failures", {
        kind: type,
        event_id: event,
        reason: clean(e.message),
        payload: JSON.stringify(payload),
        created_at: now(),
      });
      const admin = db
        .prepare(
          "SELECT id FROM users WHERE active=1 AND role='Super Admin' LIMIT 1",
        )
        .get();
      if (admin)
        notify(
          db,
          admin.id,
          "Integration needs review",
          `Inbound ${type} event #${id}: ${clean(e.message)}`,
          null,
          "Integration",
        );
    }
    throw e;
  }
}
export function validateVisitPass(db, u, id, code) {
  permit(u, "visits");
  const v = db.prepare("SELECT * FROM visits WHERE id=?").get(id);
  if (!v) fail("Visit not found.", 404);
  getLead(db, u, v.lead_id);
  const pass = db
    .prepare("SELECT * FROM visit_passes WHERE visit_id=?")
    .get(id);
  if (!pass || pass.expires_at < now() || pass.attempts >= 5)
    fail("Issue a new visitor pass before check-in.");
  if (
    !timingSafeEqual(
      Buffer.from(pass.code_hash),
      Buffer.from(digest(`${id}:${clean(code, 8)}`)),
    )
  ) {
    db.prepare(
      "UPDATE visit_passes SET attempts=attempts+1 WHERE visit_id=?",
    ).run(id);
    fail("The visitor code does not match. Please check the issued pass.");
  }
}
export function extensions(a, db) {
  a.get("/calendar/:type", (req, res) => {
    const type = oneOf(
      req.params.type,
      ["tasks", "visits", "meetings"],
      "calendar type",
    );
    permit(req.user, entityCaps[type]);
    const q = req.query,
      month = clean(q.month, 7);
    if (!/^\d{4}-(0[1-9]|1[012])$/.test(month)) fail("Choose a valid month.");
    let w = scope(req.user) + " AND substr(x.due_at,1,7)=?";
    const args = [month];
    if (q.project) {
      w += " AND l.project_id=?";
      args.push(Number(q.project));
    }
    if (q.mine === "1" && type === "tasks") {
      w += " AND x.owner_id=?";
      args.push(req.user.id);
    }
    if (q.status && q.status !== "All") {
      w += " AND x.status=?";
      args.push(clean(q.status));
    }
    if (q.q) {
      w += " AND (c.name LIKE ? OR p.name LIKE ?)";
      args.push("%" + clean(q.q) + "%", "%" + clean(q.q) + "%");
    }
    res.json(
      db
        .prepare(
          `SELECT date(x.due_at) date,count(*) count FROM ${type} x JOIN leads l ON l.id=x.lead_id JOIN contacts c ON c.id=l.contact_id JOIN projects p ON p.id=l.project_id WHERE ${w} GROUP BY date ORDER BY date`,
        )
        .all(...args),
    );
  });
  a.get("/integration-failures", (req, res) => {
    permit(req.user, "settings");
    res.json(
      db
        .prepare(
          "SELECT * FROM integration_failures ORDER BY id DESC LIMIT 100",
        )
        .all()
        .map((x) => ({ ...x, payload: JSON.parse(x.payload) })),
    );
  });
  a.post("/integration-failures/:id/retry", (req, res) => {
    permit(req.user, "settings");
    const r = db
      .prepare("SELECT * FROM integration_failures WHERE id=?")
      .get(Number(req.params.id));
    if (!r || r.status !== "Needs review")
      fail("This event does not require retry.");
    try {
      const result = receive(db, r.kind, {
        ...JSON.parse(r.payload),
        ...mappedPayload(req.body.payload || {}),
        event_id: r.event_id || req.body.payload?.event_id,
      });
      db.prepare(
        "UPDATE integration_failures SET status='Resolved',attempts=attempts+1 WHERE id=?",
      ).run(r.id);
      audit(
        db,
        req.user.id,
        null,
        "Integration retried",
        `Event ${r.id} · ${r.kind} · Record ${result.id}`,
      );
      res.json({ message: "Event processed successfully.", ...result });
    } catch (e) {
      db.prepare(
        "UPDATE integration_failures SET reason=?,attempts=attempts+1 WHERE id=?",
      ).run(clean(e.message), r.id);
      throw e;
    }
  });
  a.get("/leads/:id/documents", (req, res) => {
    permit(req.user, "readLeads");
    const l = getLead(db, req.user, req.params.id);
    res.json(
      db
        .prepare(
          "SELECT d.id,d.name,d.mime,d.bytes,d.created_at,u.name author FROM documents d LEFT JOIN users u ON u.id=d.user_id WHERE lead_id=? ORDER BY d.id DESC LIMIT 100",
        )
        .all(l.id),
    );
  });
  a.post("/leads/:id/documents", (req, res) => {
    permit(req.user, "activity");
    const l = getLead(db, req.user, req.params.id),
      d = req.body,
      bytes = Buffer.from(String(d.content || ""), "base64");
    if (!bytes.length || bytes.length > 4 * 1024 * 1024)
      fail("Choose a file of up to 4 MB.");
    const mime =
      bytes.subarray(0, 5).toString() === "%PDF-"
        ? "application/pdf"
        : bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          ? "image/png"
          : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
            ? "image/jpeg"
            : null;
    if (!mime) fail("Only PDF, PNG, and JPEG documents are supported.");
    const name = path
      .basename(required(d.name, "File name"))
      .replace(/[\u0000-\u001f"<>]/g, "")
      .slice(0, 150);
    const id = tx(db, () => {
      const id = insert(db, "documents", {
        lead_id: l.id,
        user_id: req.user.id,
        name,
        mime,
        bytes: bytes.length,
        content: bytes,
        created_at: now(),
      });
      audit(
        db,
        req.user.id,
        l.id,
        "Document attached",
        `${name} · ${Math.ceil(bytes.length / 1024)} KB`,
        l.project_id,
      );
      return id;
    });
    res.status(201).json({ id, message: "Document attached to the lead." });
  });
  a.get("/documents/:id/download", (req, res) => {
    permit(req.user, "readLeads");
    const id = Number(req.params.id),
      meta = db
        .prepare("SELECT lead_id,name,mime FROM documents WHERE id=?")
        .get(id);
    if (!meta) fail("Document not found.", 404);
    const l = getLead(db, req.user, meta.lead_id);
    audit(db, req.user.id, l.id, "Document accessed", meta.name, l.project_id);
    res
      .set("Content-Type", meta.mime)
      .set(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(meta.name)}`,
      )
      .send(
        Buffer.from(
          db.prepare("SELECT content FROM documents WHERE id=?").get(id)
            .content,
        ),
      );
  });
  a.post("/visits/:id/pass", (req, res) => {
    permit(req.user, "visits");
    const id = Number(req.params.id),
      v = db.prepare("SELECT * FROM visits WHERE id=?").get(id);
    if (!v) fail("Visit not found.", 404);
    const l = getLead(db, req.user, v.lead_id);
    if (!["Scheduled", "Confirmed", "Rescheduled"].includes(v.status))
      fail("A visitor pass can only be issued for an upcoming visit.");
    const code = String(randomInt(100000, 1000000)),
      expires = new Date(
        Math.max(Date.now() + 3600000, +new Date(v.due_at) + 12 * 3600000),
      ).toISOString();
    db.prepare(
      "INSERT INTO visit_passes(visit_id,code_hash,expires_at) VALUES (?,?,?) ON CONFLICT(visit_id) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at,attempts=0",
    ).run(id, digest(`${id}:${code}`), expires);
    audit(
      db,
      req.user.id,
      l.id,
      "Visitor pass issued",
      `Site visit SV-${id}. Previous pass replaced.`,
      l.project_id,
    );
    res.json({ code, expires_at: expires, message: "Visitor pass issued." });
  });
  a.patch("/projects/:id", (req, res) => {
    permit(req.user, "projects");
    const p = getProject(db, req.user, req.params.id),
      d = req.body;
    db.prepare(
      "UPDATE projects SET name=?,category=?,location=?,city=?,developer=?,rera=?,description=?,start_price=?,status=? WHERE id=?",
    ).run(
      required(d.name, "Project name"),
      oneOf(d.category, ["Residential", "Commercial", "Mixed-use"], "category"),
      required(d.location, "Location"),
      clean(d.city),
      clean(d.developer),
      clean(d.rera),
      clean(d.description),
      number(d.start_price, "Starting price"),
      oneOf(d.status, ["Active", "Upcoming", "Completed"], "project status"),
      p.id,
    );
    audit(
      db,
      req.user.id,
      null,
      "Project updated",
      `${p.name} · Property master and pricing updated.`,
      p.id,
    );
    res.json({ id: p.id, message: "Project details updated." });
  });
  a.patch("/routing-rules", (req, res) => {
    permit(req.user, "settings");
    if (!Array.isArray(req.body.rules) || req.body.rules.length > 30)
      fail("Configure up to 30 routing rules.");
    const rules = req.body.rules.map((r) => {
      const pid = r.project_id
        ? getProject(db, req.user, r.project_id).id
        : null;
      return {
        name: required(r.name, "Rule name"),
        project_id: pid,
        source: r.source ? oneOf(r.source, sources, "lead source") : "",
        location: clean(r.location, 100),
        team: required(r.team, "Destination team"),
      };
    });
    setSetting(db, "routingRules", rules);
    audit(
      db,
      req.user.id,
      null,
      "Routing rules changed",
      `${rules.length} project, source or location matching rules saved.`,
    );
    res.json({ message: "Routing rules saved." });
  });
}
