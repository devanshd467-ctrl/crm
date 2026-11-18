import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { randomBytes } from "node:crypto";
import {
  database,
  initialize,
  dayOffset,
  now,
  setSetting,
} from "../server/db.js";
import { api, runReminders } from "../server/api.js";
import { normalizePhone } from "../server/core.js";
let db, server, url, admin, agent, manager, lead, quote, unit, visit;
let seq = 0;
const originalSecret = process.env.CRM_WEBHOOK_SECRET;
async function req(path, method = "GET", body, token = admin) {
  const res = await fetch(url + "/api" + path, {
    method,
    headers: {
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, data: await res.json() };
}
async function ok(path, method = "GET", body, token = admin) {
  const r = await req(path, method, body, token);
  assert.ok(
    r.status < 300,
    `${method} ${path}: ${r.status}: ${JSON.stringify(r.data)}`,
  );
  return r.data;
}
async function newLead(fields = {}) {
  return ok("/leads", "POST", {
    name: "QA Customer " + ++seq,
    phone: "98" + String(seq).padStart(8, "0"),
    project_id: 1,
    source: "Referral",
    budget: 8300000,
    configuration: "2 BHK",
    consent: true,
    ...fields,
  });
}
before(async () => {
  db = database(":memory:");
  initialize(db, true);
  process.env.CRM_WEBHOOK_SECRET = randomBytes(32).toString("hex");
  const app = express();
  app.use("/api", api(db, true));
  server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  url = "http://127.0.0.1:" + server.address().port;
  admin = (await ok("/auth/demo", "POST", { user_id: 1 }, null)).token;
  agent = (await ok("/auth/demo", "POST", { user_id: 3 }, null)).token;
  manager = (await ok("/auth/demo", "POST", { user_id: 2 }, null)).token;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  if (originalSecret === undefined) delete process.env.CRM_WEBHOOK_SECRET;
  else process.env.CRM_WEBHOOK_SECRET = originalSecret;
});
test("authentication is required; private mode does not offer demo login", async () => {
  assert.equal((await req("/bootstrap", "GET", null, null)).status, 401);
  const app = express();
  app.use("/api", api(db, false));
  const s = await new Promise((resolve) => {
    const srv = app.listen(0, "127.0.0.1", () => resolve(srv));
  });
  try {
    const r = await fetch(
      "http://127.0.0.1:" + s.address().port + "/api/auth/demo",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    );
    assert.equal(r.status, 403);
  } finally {
    await new Promise((res) => s.close(res));
  }
});
test("current-period KPIs reconcile to filtered leads, visits, bookings and booking value", async () => {
  for (const q of [
    "period=This%20month",
    "period=Last%20month&project=1",
    "period=Today&source=Meta%20Ads",
    "period=Last%207%20days&team=North%20Sales",
  ]) {
    const [d, l, v, b] = await Promise.all([
      ok("/dashboard?" + q),
      ok("/leads?" + q),
      ok("/visits?" + q),
      ok("/bookings?status=Confirmed&size=100&" + q),
    ]);
    assert.equal(d.current[0], l.total);
    assert.equal(d.current[1], v.total);
    assert.equal(d.current[2], b.total);
    assert.equal(
      d.current[3],
      b.items.reduce((n, b) => n + b.value, 0),
    );
    assert.equal(
      d.current[0],
      d.trend.reduce((a, r) => a + r.value, 0),
    );
    assert.equal(
      d.current[3],
      d.sparklines[3].reduce((a, v) => a + v, 0),
    );
  }
});
test("normalized phone creates one contact, separate project interests and preserved attribution", async () => {
  assert.equal(normalizePhone("0091 98765-43210"), "+919876543210");
  const phone = "9876543210";
  const first = await newLead({
    phone,
    name: "Integration Customer",
    source: "Google Ads",
    owner_id: 3,
    attribution: { utm_campaign: "first" },
  });
  lead = first.id;
  const second = await newLead({
    phone: "+91 98765 43210",
    source: "Meta Ads",
  });
  assert.equal(second.linked, true);
  assert.equal(first.id, second.id);
  const other = await newLead({ phone: "0" + phone, project_id: 2 });
  assert.notEqual(other.id, first.id);
  let l = await ok("/leads/" + lead);
  assert.equal(l.source, "Google Ads");
  assert.equal(l.owner_id, 3);
  assert.equal(l.interests.length, 2);
  assert.equal(l.enquiries.length, 2);
  assert.deepEqual(
    l.enquiries.map((e) => e.source),
    ["Meta Ads", "Google Ads"],
  );
  assert.equal(
    db
      .prepare("SELECT count(*) n FROM contacts WHERE phone=?")
      .get("+91" + phone).n,
    1,
  );
  assert.equal((await ok("/tasks?lead=" + lead)).total, 1);
  assert.ok(
    (await ok("/activities?lead=" + lead)).items.some(
      (a) => a.kind === "Lead assigned",
    ),
  );
  assert.equal(
    (
      await req("/leads", "POST", {
        name: "Invalid",
        phone: "123",
        project_id: 1,
      })
    ).status,
    400,
  );
});
test("record ownership, project scope, assignments and export are checked by the server", async () => {
  const privateLead = await newLead({ owner_id: 4 });
  assert.equal(
    (await req("/leads/" + privateLead.id, "GET", null, agent)).status,
    404,
  );
  assert.equal(
    (
      await req(
        "/leads/" + privateLead.id + "/notes",
        "POST",
        { note: "Out of scope" },
        agent,
      )
    ).status,
    404,
  );
  assert.equal((await req("/leads/export", "GET", null, agent)).status, 403);
  assert.equal(
    (
      await req(
        "/leads/" + lead,
        "PATCH",
        { owner_id: 4, reason: "Coverage" },
        agent,
      )
    ).status,
    403,
  );
  assert.equal((await req("/reports/export", "GET", null, agent)).status, 403);
  const west = (await ok("/auth/demo", "POST", { user_id: 5 })).token;
  assert.equal(
    (
      await req(
        "/leads",
        "POST",
        { name: "Wrong project", phone: "9899990001", project_id: 1 },
        west,
      )
    ).status,
    404,
  );
  assert.ok(
    (await ok("/leads?size=100", "GET", null, agent)).items.every(
      (l) => l.owner_id === 3,
    ),
  );
});
test("routing rules respect location, source, project access and available capacity", async () => {
  await ok("/routing-rules", "PATCH", {
    rules: [
      {
        name: "West business leads",
        project_id: 2,
        source: "Meta Ads",
        location: "Gurugram",
        team: "West Sales",
      },
    ],
  });
  let r = await newLead({
    project_id: 2,
    source: "Meta Ads",
    city: "Gurugram",
  });
  assert.equal((await ok("/leads/" + r.id)).owner_id, 5);
  setSetting(db, "workload", 1);
  r = await newLead({ project_id: 2, source: "Meta Ads", city: "Gurugram" });
  assert.equal((await ok("/leads/" + r.id)).owner_id, null);
  setSetting(db, "workload", 5000);
  await ok("/routing-rules", "PATCH", { rules: [] });
});
test("stage changes require loss reasons, preserve their history and cannot bypass booking approval", async () => {
  assert.equal(
    (await req("/leads/" + lead, "PATCH", { stage: "Lost" })).status,
    400,
  );
  await ok("/leads/" + lead, "PATCH", {
    stage: "Lost",
    reason: "Purchase postponed",
  });
  await ok("/leads/" + lead, "PATCH", {
    stage: "Qualified",
    reason: "Reopened by customer",
  });
  assert.equal(
    (await req("/leads/" + lead, "PATCH", { stage: "Booked / Won" })).status,
    400,
  );
  const trail = await ok("/activities?lead=" + lead + "&kind=Stage%20changed");
  assert.ok(
    trail.items.some((a) => a.description.includes("Purchase postponed")),
  );
  assert.throws(
    () =>
      db.prepare("DELETE FROM activities WHERE id=?").run(trail.items[0].id),
    /immutable/,
  );
  assert.throws(
    () =>
      db
        .prepare("UPDATE activities SET description='replacement' WHERE id=?")
        .run(trail.items[0].id),
    /immutable/,
  );
});
test("tasks require a meaningful completion outcome; callback creation and opt-out are enforced", async () => {
  const task = await ok("/tasks", "POST", {
    lead_id: lead,
    subject: "Confirm shortlist",
    type: "Call",
    due_at: now(),
  });
  assert.equal(
    (
      await req("/tasks/" + task.id, "PATCH", {
        status: "Completed",
        outcome: "Done",
      })
    ).status,
    400,
  );
  await ok("/tasks/" + task.id, "PATCH", {
    status: "Completed",
    outcome: "Customer shortlisted unit A-403; visit requested.",
  });
  const before = (await ok("/tasks?lead=" + lead)).total;
  await ok("/calls", "POST", {
    lead_id: lead,
    outcome: "No Answer",
    notes: "Attempted the scheduled call.",
    direction: "Outbound",
  });
  assert.equal((await ok("/tasks?lead=" + lead)).total, before + 1);
  const optOut = await newLead({ consent: false });
  assert.equal(
    (
      await req("/messages", "POST", {
        lead_id: optOut.id,
        body: "Project overview",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await req("/calls", "POST", {
        lead_id: optOut.id,
        outcome: "Connected",
        notes: "Call",
        direction: "Outbound",
      })
    ).status,
    400,
  );
});
test("provider events are idempotent; failed mapped data is retained and can be corrected", async () => {
  const secret = process.env.CRM_WEBHOOK_SECRET;
  const payload = {
    event_id: "meta-test",
    phone: "9870001212",
    name: "Webhook Customer",
    project_id: 1,
    source: "Meta Ads",
    campaign: "Verified test campaign",
    attribution: { ad_id: "sample-ad" },
  };
  const first = await ok("/integrations/leads", "POST", payload, secret),
    again = await ok("/integrations/leads", "POST", payload, secret);
  assert.equal(again.replayed, true);
  assert.equal(first.id, again.id);
  assert.equal((await ok("/leads/" + first.id)).campaign, payload.campaign);
  const call = {
    event_id: "call-completed",
    provider_id: "test-provider-call",
    lead_id: lead,
    outcome: "Connected",
    direction: "Inbound",
    duration: 125,
    notes: "Customer requested a visit.",
    recording: "https://provider.example/call-recording",
  };
  const c1 = await ok("/integrations/calls", "POST", call, secret),
    c2 = await ok(
      "/integrations/calls",
      "POST",
      { ...call, event_id: "second-event" },
      secret,
    );
  assert.equal(c1.id, c2.id);
  assert.equal(
    db
      .prepare("SELECT count(*) n FROM calls WHERE provider_id=?")
      .get(call.provider_id).n,
    1,
  );
  assert.equal(
    (
      await req(
        "/integrations/leads",
        "POST",
        { ...payload, event_id: "bad-phone", phone: "invalid" },
        secret,
      )
    ).status,
    400,
  );
  const failed = (await ok("/integration-failures")).find(
    (x) => x.event_id === "bad-phone",
  );
  assert.ok(failed);
  await ok("/integration-failures/" + failed.id + "/retry", "POST", {
    payload: { phone: "9812345601" },
  });
  assert.equal(
    (await ok("/integration-failures")).find((x) => x.id === failed.id).status,
    "Resolved",
  );
});
test("site visit requires visitor pass at check-in and feedback at completion; OBM stays linked", async () => {
  const v = await ok("/visits", "POST", {
    lead_id: lead,
    due_at: now(),
    type: "First visit",
    visitors: 2,
  });
  visit = v.id;
  assert.equal(
    (await req("/visits/" + visit, "PATCH", { status: "Checked in" })).status,
    400,
  );
  const pass = await ok("/visits/" + visit + "/pass", "POST", {});
  await ok("/visits/" + visit, "PATCH", {
    status: "Checked in",
    code: pass.code,
  });
  assert.equal(
    (await req("/visits/" + visit, "PATCH", { status: "Completed" })).status,
    400,
  );
  await ok("/visits/" + visit, "PATCH", {
    status: "Completed",
    outcome: "Customer shortlisted a corner unit; quotation requested.",
  });
  let row = db.prepare("SELECT * FROM visits WHERE id=?").get(visit);
  assert.equal(row.status, "Completed");
  assert.ok(row.check_in && row.check_out);
  assert.ok(
    (await ok("/tasks?lead=" + lead)).items.some((t) =>
      t.subject.startsWith("Post-visit"),
    ),
  );
  const m = await ok("/meetings", "POST", {
    lead_id: lead,
    due_at: now(),
    location: "Customer office",
    purpose: "Discuss investment objective",
  });
  await ok("/meetings/" + m.id, "PATCH", {
    status: "Completed",
    outcome: "Requested commercial office pricing.",
  });
  assert.equal((await ok("/meetings?lead=" + lead)).items[0].lead_id, lead);
});
test("unit hold requires a matching lead, has expiry and is auditable", async () => {
  const eligible = await ok("/units?status=Available&project=1");
  unit = eligible.items[0];
  assert.equal(
    (
      await req("/units/" + unit.id, "PATCH", {
        action: "hold",
        reason: "Customer reviewing",
      })
    ).status,
    404,
  );
  await ok("/units/" + unit.id, "PATCH", {
    action: "hold",
    lead_id: lead,
    reason: "Customer is reviewing this unit",
  });
  assert.equal(
    db.prepare("SELECT status FROM units WHERE id=?").get(unit.id).status,
    "On Hold",
  );
  db.prepare("UPDATE units SET hold_until=? WHERE id=?").run(
    dayOffset(-1),
    unit.id,
  );
  runReminders(db);
  assert.equal(
    db.prepare("SELECT status FROM units WHERE id=?").get(unit.id).status,
    "Available",
  );
  assert.ok(
    (await ok("/activities?lead=" + lead)).items.some(
      (a) => a.kind === "Hold expired",
    ),
  );
});
test("server calculates the cost sheet, requires discount approval, and prevents double booking", async () => {
  const q = await ok("/quotations", "POST", {
    lead_id: lead,
    unit_id: unit.id,
    charges: 15000,
    discount: 30000,
    tax_rate: 5,
    valid_until: dayOffset(14),
    total: 1,
  });
  quote = q.id;
  let row = db.prepare("SELECT * FROM quotations WHERE id=?").get(q.id);
  assert.equal(row.status, "Pending approval");
  assert.equal(
    row.total,
    Math.round((unit.area * unit.rate + 15000 - 30000) * 1.05),
  );
  assert.equal(
    (await req("/bookings", "POST", { lead_id: lead, quotation_id: q.id }))
      .status,
    400,
  );
  assert.equal(
    (await req("/quotations/" + q.id, "PATCH", { status: "Approved" }, agent))
      .status,
    403,
  );
  await ok("/quotations/" + q.id, "PATCH", { status: "Approved" }, manager);
  await ok("/quotations/" + q.id, "PATCH", { status: "Sent" });
  const b = await ok("/bookings", "POST", {
    lead_id: lead,
    quotation_id: q.id,
  });
  assert.equal(
    (await req("/bookings", "POST", { lead_id: lead, quotation_id: q.id }))
      .status,
    409,
  );
  assert.equal(
    (await req("/bookings/" + b.id, "PATCH", { status: "Confirmed" }, agent))
      .status,
    403,
  );
  const res = await Promise.all([
    req("/bookings/" + b.id, "PATCH", { status: "Confirmed" }, manager),
    req("/bookings/" + b.id, "PATCH", { status: "Confirmed" }, manager),
  ]);
  assert.deepEqual(res.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    db.prepare("SELECT status FROM units WHERE id=?").get(unit.id).status,
    "Booked",
  );
  assert.equal((await ok("/leads/" + lead)).stage, "Booked / Won");
  assert.equal(
    db
      .prepare(
        "SELECT count(*) n FROM bookings WHERE unit_id=? AND status='Confirmed'",
      )
      .get(unit.id).n,
    1,
  );
  assert.equal(
    (await req("/bookings", "POST", { lead_id: lead, quotation_id: q.id }))
      .status,
    409,
  );
});
test("CSV/Excel mapped rows reconcile: new + linked + invalid = input; rollback keeps history", async () => {
  const rows = [
    {
      name: "Import Fixture",
      phone: "9812312333",
      project_id: 2,
      source: "Exhibition",
    },
    {
      name: "Import Fixture",
      phone: "+919812312333",
      project_id: 2,
      source: "Referral",
    },
    { name: "Needs review", phone: "invalid", project_id: 1 },
  ];
  const r = await ok("/imports", "POST", { filename: "fixture.csv", rows });
  assert.equal(r.total, 3);
  assert.equal(r.imported, 1);
  assert.equal(r.linked, 1);
  assert.equal(r.failures.length, 1);
  assert.equal(r.failures[0].original.phone, "invalid");
  const id = db.prepare("SELECT id FROM leads WHERE batch_id=?").get(r.id).id;
  await ok("/imports/" + r.id + "/rollback", "POST", {});
  assert.equal((await req("/leads/" + id)).status, 404);
  assert.equal(
    db.prepare("SELECT archived FROM leads WHERE id=?").get(id).archived,
    1,
  );
  assert.ok(
    db.prepare("SELECT count(*) n FROM activities WHERE lead_id=?").get(id).n,
  );
});
test("protected attachments require authorized lead access and indexed contact search updates", async () => {
  const l = await newLead({ owner_id: 4, name: "Attachment Customer" });
  const file = await ok("/leads/" + l.id + "/documents", "POST", {
    name: "brochure.pdf",
    content: Buffer.from("%PDF-1.4\nExample test document\n%%EOF").toString(
      "base64",
    ),
  });
  assert.equal(
    (await req("/leads/" + l.id + "/documents", "GET", null, agent)).status,
    404,
  );
  assert.equal(
    (await req("/documents/" + file.id + "/download", "GET", null, agent))
      .status,
    404,
  );
  assert.equal((await ok("/leads/" + l.id + "/documents")).length, 1);
  assert.ok((await ok("/leads?q=ttachmen")).items.some((r) => r.id === l.id));
  await ok("/leads/" + l.id, "PATCH", { name: "Renamed Customer" });
  assert.ok((await ok("/leads?q=Renamed")).items.some((r) => r.id === l.id));
});
test("reminders deduplicate and user deactivation invalidates active sessions", async () => {
  const l = await newLead({ owner_id: 4 }),
    t = await ok("/tasks", "POST", {
      lead_id: l.id,
      subject: "Callback deadline test",
      type: "Call",
      due_at: dayOffset(-2) + "T10:00:00Z",
    });
  runReminders(db);
  runReminders(db);
  assert.equal(
    db
      .prepare("SELECT count(*) n FROM events WHERE external_id=?")
      .get("task-due:" + t.id).n,
    1,
  );
  const auth = (await ok("/auth/demo", "POST", { user_id: 8 })).token;
  await ok("/users/8", "PATCH", { active: false });
  assert.equal((await req("/bootstrap", "GET", null, auth)).status, 401);
  assert.equal((await req("/users/1", "PATCH", { active: false })).status, 400);
});
test("partner registration conflicts preserve attribution until a recorded manager decision", async () => {
  const l = await newLead({
      source: "Channel Partner",
      partner_id: 1,
      owner_id: 3,
    }),
    profile = await ok("/leads/" + l.id);
  await newLead({
    name: profile.name,
    phone: profile.phone,
    source: "Channel Partner",
    partner_id: 2,
  });
  assert.equal(
    db.prepare("SELECT partner_id FROM partner_leads WHERE lead_id=?").get(l.id)
      .partner_id,
    1,
  );
  const review = (await ok("/partner-reviews")).find((r) => r.lead_id === l.id);
  assert.ok(review);
  await ok(
    "/partner-reviews/" + review.id + "/resolve",
    "POST",
    { partner_id: 2, reason: "Verified the signed partner registration." },
    manager,
  );
  assert.equal(
    db.prepare("SELECT partner_id FROM partner_leads WHERE lead_id=?").get(l.id)
      .partner_id,
    2,
  );
  assert.ok(
    (await ok("/activities?lead=" + l.id)).items.some(
      (a) => a.kind === "Partner attribution resolved",
    ),
  );
});
test("revisions preserve old pricing and multiple opportunities remain distinct from contacts", async () => {
  const l = await newLead({ owner_id: 3 }),
    unit = (await ok("/units?project=1&status=Available")).items[0],
    q = {
      lead_id: l.id,
      unit_id: unit.id,
      charges: 10000,
      discount: 0,
      tax_rate: 5,
      valid_until: dayOffset(10),
    },
    first = await ok("/quotations", "POST", q),
    old = db.prepare("SELECT * FROM quotations WHERE id=?").get(first.id);
  const revised = await ok("/quotations", "POST", {
    ...q,
    charges: 15000,
    parent_id: first.id,
  });
  const rows = (await ok("/quotations?lead=" + l.id)).items;
  assert.equal(rows.find((r) => r.id === first.id).total, old.total);
  assert.equal(rows.find((r) => r.id === first.id).status, "Superseded");
  assert.equal(rows.find((r) => r.id === revised.id).version, 2);
  assert.equal(
    (await req("/bookings", "POST", { lead_id: l.id, quotation_id: first.id }))
      .status,
    400,
  );
  const data = {
    lead_id: l.id,
    title: "Apartment shortlist",
    value: 8000000,
    probability: 45,
    expected_close: dayOffset(30),
  };
  const op = await ok("/opportunities", "POST", data);
  await ok("/opportunities", "POST", { ...data, title: "Second apartment" });
  await ok("/opportunities/" + op.id, "PATCH", {
    stage: "Negotiation",
    probability: 75,
    next_step: "Agree cost sheet",
  });
  const deals = await ok("/opportunities?lead=" + l.id);
  assert.equal(deals.total, 2);
  assert.equal(deals.items.find((r) => r.id === op.id).probability, 75);
});
