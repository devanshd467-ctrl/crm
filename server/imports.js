/** Durable, resumable import queue. Each committed chunk advances its cursor atomically. */
import { Worker } from "node:worker_threads";
import { now, insert, tx, audit } from "./db.js";
import {
  permit,
  admin,
  clean,
  fail,
  required,
  normalizePhone,
  getProject,
  ownerId,
  number,
  createLead,
} from "./core.js";
export function inspectRows(db, u, rows) {
  const seen = new Set();
  let linked = 0,
    invalid = 0,
    matched = 0;
  const examples = [];
  rows.forEach((row, i) => {
    let status = "New lead",
      reason = "";
    try {
      required(row.name, "Customer name");
      const phone = normalizePhone(row.phone),
        p = getProject(db, u, row.project_id),
        key = phone + ":" + p.id;
      number(row.budget, "Budget");
      if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(row.email)))
        fail("Invalid email address.");
      if (row.owner_id) {
        permit(u, "assign");
        ownerId(db, p.id, row.owner_id);
      }
      const c = db.prepare("SELECT id FROM contacts WHERE phone=?").get(phone);
      if (
        seen.has(key) ||
        (c &&
          db
            .prepare(
              "SELECT id FROM leads WHERE contact_id=? AND project_id=? AND archived=0 AND stage NOT IN ('Lost','Not Interested','Not Qualified','Booked / Won') LIMIT 1",
            )
            .get(c.id, p.id))
      ) {
        linked++;
        status = "Link enquiry";
      } else if (c) {
        matched++;
        status = "New project interest";
      }
      seen.add(key);
    } catch (e) {
      status = "Flagged";
      reason = e.message;
      invalid++;
    }
    if (examples.length < 8)
      examples.push({ row: i + 2, name: clean(row.name), status, reason });
  });
  return {
    total: rows.length,
    linked,
    invalid,
    matched,
    imported: rows.length - linked - invalid,
    examples,
  };
}
function chunk(db, user, id, rows, start) {
  const results = { imported: 0, linked: 0, failures: [] };
  rows.forEach((row, i) => {
    db.exec("SAVEPOINT import_row");
    try {
      const r = createLead(db, user, row, id);
      db.exec("RELEASE import_row");
      if (r.linked) results.linked++;
      else results.imported++;
    } catch (e) {
      db.exec("ROLLBACK TO import_row; RELEASE import_row");
      results.failures.push({
        row: start + i + 2,
        reason: e.status
          ? e.message
          : "Invalid record; review the source values.",
        original: row,
      });
    }
  });
  return results;
}
function finish(db, id) {
  const b = db.prepare("SELECT * FROM batches WHERE id=?").get(id);
  db.prepare("UPDATE batches SET status='Completed' WHERE id=?").run(id);
  audit(
    db,
    b.user_id,
    null,
    "Leads imported",
    `Batch ${id}: ${b.imported} new, ${b.linked} linked, ${JSON.parse(b.failures).length} flagged.`,
  );
  db.prepare(
    "INSERT OR REPLACE INTO batch_snapshots(batch_id,lead_id,last_activity) SELECT ?,l.id,COALESCE((SELECT max(a.id) FROM activities a WHERE a.lead_id=l.id),0) FROM leads l WHERE l.batch_id=?",
  ).run(id, id);
  db.prepare("DELETE FROM import_jobs WHERE batch_id=?").run(id);
}
export function processChunk(db, id, limit = 80) {
  return tx(db, () => {
    const job = db
      .prepare(
        "SELECT j.*,b.user_id,b.failures FROM import_jobs j JOIN batches b ON b.id=j.batch_id WHERE batch_id=?",
      )
      .get(id);
    if (!job) return true;
    const rows = JSON.parse(job.rows),
      u = db
        .prepare("SELECT * FROM users WHERE id=? AND active=1")
        .get(job.user_id);
    if (!u) fail("Import owner is no longer active.");
    permit(u, "import");
    const end = Math.min(rows.length, job.cursor + limit),
      r = chunk(db, u, id, rows.slice(job.cursor, end), job.cursor);
    db.prepare(
      "UPDATE batches SET imported=imported+?,linked=linked+?,failures=? WHERE id=?",
    ).run(
      r.imported,
      r.linked,
      JSON.stringify([...JSON.parse(job.failures), ...r.failures]),
      id,
    );
    db.prepare("UPDATE import_jobs SET cursor=? WHERE batch_id=?").run(end, id);
    if (end === rows.length) {
      finish(db, id);
      return true;
    }
    return false;
  });
}
const running = new Map();
export function startImportWorker(db) {
  const file = db.prepare("PRAGMA database_list").get().file;
  if (
    !file ||
    running.has(file) ||
    !db
      .prepare(
        "SELECT j.batch_id FROM import_jobs j JOIN batches b ON b.id=j.batch_id WHERE b.status='Processing' LIMIT 1",
      )
      .get()
  )
    return;
  const w = new Worker(new URL("./import-worker.js", import.meta.url), {
    workerData: { file },
  });
  running.set(file, w);
  w.on("error", (e) => console.error("Import worker:", e.message));
  w.on("exit", () => {
    running.delete(file);
  });
}
export function registerImports(a, db) {
  const validated = (req) => {
    permit(req.user, "import");
    const rows = req.body.rows;
    if (!Array.isArray(rows) || rows.length < 1 || rows.length > 5000)
      fail("Import between 1 and 5,000 rows per batch.");
    return rows;
  };
  a.post("/imports/preview", (req, res) => {
    res.json(inspectRows(db, req.user, validated(req)));
  });
  a.post("/imports", (req, res) => {
    const rows = validated(req),
      u = req.user,
      id = tx(db, () => {
        const id = insert(db, "batches", {
          filename: clean(req.body.filename, 200),
          total: rows.length,
          status: "Processing",
          user_id: u.id,
          created_at: now(),
        });
        insert(db, "import_jobs", {
          batch_id: id,
          rows: JSON.stringify(rows),
          cursor: 0,
        });
        return id;
      });
    if (rows.length > 200 && db.prepare("PRAGMA database_list").get().file) {
      startImportWorker(db);
      return res.status(202).json({
        id,
        status: "Processing",
        total: rows.length,
        imported: 0,
        linked: 0,
        failures: [],
      });
    }
    processChunk(db, id, 5000);
    const b = db.prepare("SELECT * FROM batches WHERE id=?").get(id);
    res.status(201).json({ ...b, failures: JSON.parse(b.failures) });
  });
  a.get("/imports/:id", (req, res) => {
    permit(req.user, "import");
    const b = db
      .prepare(
        "SELECT *,COALESCE((SELECT cursor FROM import_jobs WHERE batch_id=batches.id),total) processed FROM batches WHERE id=?",
      )
      .get(Number(req.params.id));
    if (!b || (!admin(req.user) && b.user_id !== req.user.id))
      fail("Batch not available.", 404);
    res.json({ ...b, failures: JSON.parse(b.failures) });
  });
}
