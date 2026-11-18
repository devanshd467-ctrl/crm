import {
  stages,
  outcomes,
  sources,
  now,
  day,
  dayOffset,
  insert,
  audit,
  settings,
} from "./db.js";
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const fail = (msg, status = 400) => {
  throw new HttpError(status, msg);
};
export const clean = (v, max = 1500) =>
  String(v ?? "")
    .trim()
    .slice(0, max);
export function required(v, label) {
  const s = clean(v);
  if (!s) fail(`${label} is required.`);
  return s;
}
export function number(v, label, min = 0, max = 1e12) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n < min || n > max)
    fail(`${label} must be between ${min} and ${max}.`);
  return n;
}
export function oneOf(v, values, label) {
  if (!values.includes(v)) fail(`Choose a valid ${label.toLowerCase()}.`);
  return v;
}
export function dateTime(v) {
  const t = new Date(v);
  if (!v || !Number.isFinite(+t)) fail("Enter a valid date and time.");
  return t.toISOString();
}
export const admin = (u) => ["Super Admin", "CRM Admin"].includes(u.role);
const rules = {
  assign: ["Sales Head", "Sales Manager"],
  approve: ["Sales Head", "Sales Manager"],
  export: ["Sales Head", "Sales Manager", "Marketing Manager"],
  manageUsers: [],
  settings: [],
  readLeads: [
    "Sales Head",
    "Sales Manager",
    "Sales Executive",
    "Marketing Manager",
    "Telecaller",
    "Channel Partner",
    "Visit Coordinator",
  ],
  writeLead: [
    "Sales Head",
    "Sales Manager",
    "Sales Executive",
    "Marketing Manager",
    "Telecaller",
    "Channel Partner",
  ],
  activity: [
    "Sales Head",
    "Sales Manager",
    "Sales Executive",
    "Telecaller",
    "Visit Coordinator",
    "Channel Partner",
  ],
  visits: [
    "Sales Head",
    "Sales Manager",
    "Sales Executive",
    "Visit Coordinator",
  ],
  inventory: [
    "Inventory Controller",
    "Sales Head",
    "Sales Manager",
    "Sales Executive",
  ],
  pricing: ["Inventory Controller", "Sales Head"],
  quote: ["Sales Head", "Sales Manager", "Sales Executive"],
  marketing: ["Marketing Manager", "Sales Head", "Sales Manager"],
  team: ["Sales Head", "Sales Manager"],
  reports: [
    "Sales Head",
    "Sales Manager",
    "Marketing Manager",
    "Inventory Controller",
  ],
  import: ["Marketing Manager", "Sales Head"],
  projects: ["Inventory Controller", "Sales Head"],
  partners: ["Marketing Manager", "Sales Head", "Sales Manager"],
  audit: ["Sales Head", "Sales Manager"],
};
export const can = (u, action) =>
  admin(u) || rules[action]?.includes(u.role) || false;
export const permit = (u, action) => {
  if (!can(u, action))
    fail("Your role does not have permission for this action.", 403);
};
export const permissions = (u) => Object.keys(rules).filter((k) => can(u, k));
export function projectScope(u, column) {
  if (admin(u)) return "1=1";
  const ids = JSON.parse(u.projects || "[]").filter(Number.isSafeInteger);
  return ids.length ? `${column} IN (${ids.join(",")})` : "0=1";
}
export function scope(u, a = "l") {
  let r = projectScope(u, a + ".project_id");
  if (["Sales Executive", "Telecaller", "Channel Partner"].includes(u.role))
    r += ` AND ${a}.owner_id=${Number(u.id)}`;
  if (u.role === "Sales Manager")
    r += ` AND ${a}.owner_id IN (SELECT id FROM users WHERE team=(SELECT team FROM users WHERE id=${Number(u.id)}) AND branch=(SELECT branch FROM users WHERE id=${Number(u.id)}))`;
  return `${a}.archived=0 AND ${r}`;
}
export function getProject(db, u, id) {
  const p = db
    .prepare(`SELECT * FROM projects WHERE id=? AND ${projectScope(u, "id")}`)
    .get(Number(id));
  if (!p) fail("Project not found or outside your workspace.", 404);
  return p;
}
export const leadSelect = `SELECT l.*, c.name,c.phone,c.email,c.city,c.consent,p.name project,p.location, u.name owner, u.team FROM leads l JOIN contacts c ON c.id=l.contact_id JOIN projects p ON p.id=l.project_id LEFT JOIN users u ON u.id=l.owner_id`;
export function getLead(db, u, id) {
  const l = db
    .prepare(leadSelect + ` WHERE l.id=? AND ${scope(u)}`)
    .get(Number(id));
  if (!l) fail("Lead not found in your authorized workspace.", 404);
  return l;
}
export function normalizePhone(value) {
  let n = clean(value, 50).replace(/[\s()\-+.]/g, "");
  if (n.startsWith("0091") && n.length === 14) n = n.slice(4);
  if (n.length === 12 && n.startsWith("91")) n = n.slice(2);
  if (n.length === 11 && n[0] === "0") n = n.slice(1);
  if (!/^[6-9]\d{9}$/.test(n))
    fail("Enter a valid 10-digit Indian mobile number.");
  return "+91" + n;
}
export function ownerId(db, project, id) {
  if (!id) return null;
  const user = db
    .prepare("SELECT * FROM users WHERE active=1 AND id=?")
    .get(Number(id));
  if (
    !user ||
    ![
      "Sales Executive",
      "Telecaller",
      "Sales Manager",
      "Sales Head",
      "Super Admin",
      "CRM Admin",
      "Channel Partner",
    ].includes(user.role) ||
    (!admin(user) && !JSON.parse(user.projects).includes(Number(project)))
  )
    fail("Choose an active, project-authorized sales owner.");
  return user.id;
}
function assignment(db, u, pid, data) {
  if (["Sales Executive", "Telecaller", "Channel Partner"].includes(u.role))
    return u.id;
  const s = settings(db);
  if (data.owner_id === "none") {
    permit(u, "assign");
    return null;
  }
  if (data.owner_id) {
    permit(u, "assign");
    return ownerId(db, pid, data.owner_id);
  }
  if (s.assignment === "Manual") return null;
  let eligible = db
    .prepare(
      `SELECT u.*, (SELECT count(*) FROM leads l WHERE l.archived=0 AND l.owner_id=u.id AND stage NOT IN ('Booked / Won','Lost','Not Interested','Not Qualified','Dormant')) load FROM users u WHERE u.active=1 AND u.role IN ('Sales Executive','Telecaller')`,
    )
    .all()
    .filter((x) => JSON.parse(x.projects).includes(pid) && x.load < s.workload);
  if (u.role === "Sales Manager")
    eligible = eligible.filter(
      (x) => x.team === u.team && x.branch === u.branch,
    );
  const rule = (s.routingRules || []).find(
    (r) =>
      (!r.project_id || r.project_id === pid) &&
      (!r.source || r.source === data.source) &&
      (!r.location ||
        [
          data.city,
          data.contact_details?.district,
          data.contact_details?.state,
        ].some((v) => clean(v).toLowerCase() === r.location.toLowerCase())),
  );
  if (rule) eligible = eligible.filter((x) => x.team === rule.team);
  if (!eligible.length) return null;
  if (s.assignment === "Lowest workload")
    return eligible.sort((a, b) => a.load - b.load)[0].id;
  const last =
    db
      .prepare(
        "SELECT owner_id FROM leads WHERE project_id=? AND owner_id IS NOT NULL ORDER BY id DESC LIMIT 1",
      )
      .get(pid)?.owner_id || 0;
  return (eligible.find((e) => e.id > last) || eligible[0]).id;
}
export function notify(db, user_id, title, body, lead_id, kind = "Assignment") {
  if (user_id && lead_id) {
    const user = db
      .prepare("SELECT * FROM users WHERE id=? AND active=1")
      .get(user_id);
    if (
      !user ||
      !db
        .prepare(`SELECT id FROM leads l WHERE l.id=? AND ${scope(user)}`)
        .get(lead_id)
    )
      return;
  }
  if (user_id)
    insert(db, "notifications", {
      user_id,
      title,
      body,
      lead_id,
      kind,
      created_at: now(),
    });
}
export function task(db, u, l, data) {
  const subject = required(data.subject, "Task subject"),
    due = dateTime(data.due_at),
    owner =
      !l.owner_id &&
      !data.owner_id &&
      ["Visit Coordinator", "Marketing Manager"].includes(u.role)
        ? u.id
        : ownerId(
            db,
            l.project_id,
            (can(u, "assign") ? data.owner_id : null) || l.owner_id || u.id,
          );
  const id = insert(db, "tasks", {
    lead_id: l.id,
    subject,
    type: oneOf(
      data.type || "Call",
      [
        "Call",
        "WhatsApp",
        "Meeting",
        "Site visit",
        "Quotation",
        "Project details",
        "Callback",
        "Negotiation",
        "Documents",
        "General",
      ],
      "task type",
    ),
    owner_id: owner,
    priority: oneOf(
      data.priority || "Medium",
      ["Critical", "High", "Medium", "Low"],
      "priority",
    ),
    due_at: due,
    created_at: now(),
  });
  audit(
    db,
    u.id,
    l.id,
    "Task created",
    `${subject} · Due ${due.slice(0, 16).replace("T", " ")}.`,
    l.project_id,
  );
  notify(db, owner, "Follow-up scheduled", subject, l.id, "Reminder");
  return id;
}
export function createLead(db, u, d, batch = null) {
  permit(u, "writeLead");
  const name = required(d.name, "Customer name"),
    phone = normalizePhone(d.phone),
    project = getProject(db, u, d.project_id),
    email = clean(d.email, 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    fail("Enter a valid email address.");
  const raw = clean(d.source, 100) || "Walk-in",
    src =
      sources.find((s) => s.toLowerCase() === raw.toLowerCase()) ||
      (/facebook|instagram|meta/i.test(raw)
        ? "Meta Ads"
        : /google/i.test(raw)
          ? "Google Ads"
          : "Import");
  const extraContact = { ...(d.contact_details || {}) };
  for (const k of ["alternate_mobile", "whatsapp_number"])
    if (extraContact[k]) extraContact[k] = normalizePhone(extraContact[k]);
  if (extraContact.pin && !/^\d{6}$/.test(String(extraContact.pin)))
    fail("PIN code must have six digits.");
  if (
    d.requirements?.min_budget &&
    d.budget &&
    number(d.requirements.min_budget, "Minimum budget") >
      number(d.budget, "Budget")
  )
    fail("Minimum budget cannot exceed the budget.");
  const contact = db.prepare("SELECT * FROM contacts WHERE phone=?").get(phone);
  const at = now();
  const cid =
    contact?.id ||
    insert(db, "contacts", {
      name,
      phone,
      email,
      city: clean(d.city, 100),
      consent: d.consent === true || d.consent === "yes" ? 1 : 0,
      details: JSON.stringify(extraContact),
      created_at: at,
    });
  const existing = db
    .prepare(
      "SELECT * FROM leads WHERE contact_id=? AND project_id=? AND archived=0 AND stage NOT IN ('Lost','Not Interested','Not Qualified','Booked / Won') ORDER BY id DESC LIMIT 1",
    )
    .get(cid, project.id);
  const campaign = clean(d.campaign, 180),
    meta = JSON.stringify({
      ...d.attribution,
      original_phone: clean(d.phone, 50),
    });
  if (existing) {
    insert(db, "enquiries", {
      lead_id: existing.id,
      source: src,
      original_source: raw,
      campaign,
      metadata: meta,
      batch_id: batch,
      created_at: at,
    });
    audit(
      db,
      u.id,
      existing.id,
      "Enquiry linked",
      `Repeat ${raw} enquiry linked to the existing contact. Original source preserved.`,
      project.id,
    );
    if (d.partner_id) {
      const old = db
        .prepare("SELECT partner_id FROM partner_leads WHERE lead_id=?")
        .get(existing.id);
      const partner = db
        .prepare("SELECT id FROM partners WHERE id=? AND status='Active'")
        .get(Number(d.partner_id));
      if (!partner) fail("Choose an active channel partner.");
      if (old && old.partner_id !== partner.id) {
        if (
          !db
            .prepare(
              "SELECT id FROM partner_reviews WHERE lead_id=? AND proposed_id=? AND status='Pending'",
            )
            .get(existing.id, partner.id)
        )
          insert(db, "partner_reviews", {
            lead_id: existing.id,
            original_id: old.partner_id,
            proposed_id: partner.id,
            created_at: at,
          });
        audit(
          db,
          u.id,
          existing.id,
          "Partner conflict",
          "New partner attribution requires manager review; original partner retained.",
          project.id,
        );
        notify(
          db,
          1,
          "Partner attribution review",
          name + " has competing partner registrations.",
          existing.id,
          "Partner",
        );
      } else if (!old) {
        insert(db, "partner_leads", {
          lead_id: existing.id,
          partner_id: partner.id,
        });
        audit(
          db,
          u.id,
          existing.id,
          "Partner registered",
          `Partner ${partner.id} linked; original source retained.`,
          project.id,
        );
      }
    }
    notify(
      db,
      existing.owner_id,
      "Repeat project enquiry",
      `${name} enquired again.`,
      existing.id,
    );
    const visible = db
      .prepare(`SELECT id FROM leads l WHERE id=? AND ${scope(u)}`)
      .get(existing.id);
    return {
      id: visible ? existing.id : null,
      linked: true,
      message:
        "Existing enquiry linked. Original ownership and source were preserved.",
    };
  }
  const owner = assignment(db, u, project.id, d),
    budget = number(d.budget, "Budget");
  const score = Math.min(
    100,
    25 +
      (budget >= project.start_price && budget > 0 ? 30 : 0) +
      (d.configuration ? 15 : 0) +
      (d.timeline === "Within 3 months" ? 20 : 0) +
      (src === "Referral" ? 10 : 0),
  );
  const s = settings(db);
  const id = insert(db, "leads", {
    contact_id: cid,
    project_id: project.id,
    owner_id: owner,
    source: src,
    campaign,
    temperature: oneOf(
      d.temperature ||
        (score >= s.hotThreshold
          ? "Hot"
          : score >= s.warmThreshold
            ? "Warm"
            : "Cold"),
      ["Hot", "Warm", "Cold"],
      "temperature",
    ),
    priority: oneOf(
      d.priority || "Medium",
      ["Critical", "High", "Medium", "Low"],
      "priority",
    ),
    score,
    budget,
    configuration: clean(d.configuration, 100),
    next_action: clean(d.next_action),
    details: JSON.stringify({
      timeline: clean(d.timeline),
      purpose: clean(d.purpose),
      notes: clean(d.notes),
      ...d.requirements,
    }),
    created_by: u.id,
    batch_id: batch,
    created_at: at,
    updated_at: at,
  });
  insert(db, "enquiries", {
    lead_id: id,
    source: src,
    original_source: raw,
    campaign,
    metadata: meta,
    batch_id: batch,
    created_at: at,
  });
  audit(
    db,
    u.id,
    id,
    "Lead created",
    `Enquiry received from ${raw}${contact ? " · Existing contact matched" : ""}.`,
    project.id,
  );
  if (d.partner_id) {
    if (
      !db
        .prepare("SELECT id FROM partners WHERE id=? AND status='Active'")
        .get(Number(d.partner_id))
    )
      fail("Choose an active channel partner.");
    insert(db, "partner_leads", {
      lead_id: id,
      partner_id: Number(d.partner_id),
    });
  }
  if (owner) {
    audit(
      db,
      u.id,
      id,
      "Lead assigned",
      `Assigned to ${db.prepare("SELECT name FROM users WHERE id=?").get(owner).name} · ${d.owner_id ? "Manual" : s.assignment}.`,
      project.id,
    );
    task(
      db,
      u,
      { id, project_id: project.id, owner_id: owner },
      {
        subject: "First contact with " + name,
        type: "Call",
        due_at: new Date(
          Date.now() + s.firstContactMinutes * 60000,
        ).toISOString(),
        priority: "High",
      },
    );
    notify(db, owner, "New lead assigned", name + " · " + project.name, id);
  } else
    notify(
      db,
      1,
      "Assignment needed",
      name + " is in the unassigned queue.",
      id,
    );
  if (d.notes) audit(db, u.id, id, "Note added", clean(d.notes), project.id);
  return {
    id,
    linked: false,
    message: contact
      ? "New project enquiry linked to the existing customer."
      : "Lead created successfully.",
  };
}
export function changeStage(db, u, l, stage, reason, internal = false) {
  oneOf(stage, [...stages, ...outcomes], "stage");
  if (l.stage === stage) return;
  if (!internal && ["Booked / Won", "Booking In Progress"].includes(stage))
    fail("Use Booking management to request and approve a booking.");
  if (l.stage === "Booked / Won")
    fail("A confirmed booking cannot be changed from the pipeline.");
  if (["Lost", "Not Interested", "Not Qualified"].includes(stage))
    required(reason, "Loss reason");
  db.prepare(
    "UPDATE leads SET stage=?,loss_reason=?,updated_at=? WHERE id=?",
  ).run(stage, clean(reason), now(), l.id);
  audit(
    db,
    u.id,
    l.id,
    "Stage changed",
    `${l.stage} → ${stage}${reason ? " · " + clean(reason) : ""}`,
    l.project_id,
  );
}
export function updateLead(db, u, id, d) {
  const l = getLead(db, u, id);
  if (d.stage) {
    permit(u, "writeLead");
    changeStage(db, u, l, d.stage, d.reason);
  }
  if ("owner_id" in d) {
    permit(u, "assign");
    const owner = ownerId(db, l.project_id, d.owner_id);
    const dest = owner
      ? db.prepare("SELECT * FROM users WHERE id=?").get(owner)
      : null;
    if (
      u.role === "Sales Manager" &&
      dest &&
      (u.team !== dest.team || u.branch !== dest.branch)
    )
      fail("Choose a member of your team.", 403);
    const reason = required(d.reason, "Reassignment reason");
    db.prepare("UPDATE leads SET owner_id=?,updated_at=? WHERE id=?").run(
      owner,
      now(),
      id,
    );
    audit(
      db,
      u.id,
      id,
      "Owner changed",
      `${l.owner || "Unassigned"} → ${dest?.name || "Unassigned"} · ${reason}`,
      l.project_id,
    );
    if (owner) {
      notify(db, owner, "Lead reassigned to you", l.name, id);
      task(
        db,
        u,
        { ...l, owner_id: owner },
        {
          subject: "Contact " + l.name,
          type: "Call",
          due_at: new Date(
            Date.now() + settings(db).firstContactMinutes * 60000,
          ).toISOString(),
        },
      );
    }
  }
  if (
    "priority" in d ||
    "temperature" in d ||
    "consent" in d ||
    "budget" in d ||
    "name" in d
  ) {
    permit(u, "writeLead");
    const priority = oneOf(
        d.priority || l.priority,
        ["Critical", "High", "Medium", "Low"],
        "priority",
      ),
      temperature = oneOf(
        d.temperature || l.temperature,
        ["Hot", "Warm", "Cold"],
        "temperature",
      );
    db.prepare(
      "UPDATE leads SET priority=?,temperature=?,budget=?,configuration=?,next_action=?,updated_at=? WHERE id=?",
    ).run(
      priority,
      temperature,
      number(d.budget ?? l.budget, "Budget"),
      clean(d.configuration ?? l.configuration),
      clean(d.next_action ?? l.next_action),
      now(),
      id,
    );
    db.prepare(
      "UPDATE contacts SET name=?,email=?,city=?,consent=? WHERE id=?",
    ).run(
      required(d.name ?? l.name, "Customer name"),
      clean(d.email ?? l.email, 200),
      clean(d.city ?? l.city, 100),
      d.consent == null
        ? l.consent
        : d.consent === true || d.consent === "yes"
          ? 1
          : 0,
      l.contact_id,
    );
    if (d.contact_details) {
      const extra = { ...d.contact_details };
      for (const k of ["alternate_mobile", "whatsapp_number"])
        if (extra[k]) extra[k] = normalizePhone(extra[k]);
      if (extra.pin && !/^\d{6}$/.test(String(extra.pin)))
        fail("PIN code must have six digits.");
      db.prepare("UPDATE contacts SET details=? WHERE id=?").run(
        JSON.stringify(extra),
        l.contact_id,
      );
    }
    if (d.requirements)
      db.prepare("UPDATE leads SET details=? WHERE id=?").run(
        JSON.stringify({ ...JSON.parse(l.details), ...d.requirements }),
        id,
      );
    audit(
      db,
      u.id,
      id,
      "Lead updated",
      "Customer information, qualification or contact preferences updated.",
      l.project_id,
    );
  }
  return { id, message: "Lead updated." };
}
export const entityCaps = {
  tasks: "activity",
  calls: "activity",
  visits: "visits",
  meetings: "activity",
  messages: "activity",
  quotations: "quote",
  bookings: "quote",
  opportunities: "writeLead",
};
export function createEntity(db, u, type, d) {
  permit(u, entityCaps[type]);
  const l = getLead(db, u, d.lead_id),
    at = now();
  let id;
  const base = { lead_id: l.id, user_id: u.id, created_at: at };
  if (type === "tasks") id = task(db, u, l, d);
  if (type === "calls") {
    const outcome = oneOf(
      d.outcome,
      [
        "Connected",
        "No Answer",
        "Busy",
        "Switched Off",
        "Wrong Number",
        "Voicemail",
        "Call Failed",
        "Callback Requested",
      ],
      "call outcome",
    );
    if (!l.consent && d.direction !== "Inbound")
      fail("Contact consent is required for an outbound call.");
    id = insert(db, "calls", {
      ...base,
      direction: oneOf(
        d.direction || "Outbound",
        ["Inbound", "Outbound"],
        "direction",
      ),
      outcome,
      duration: number(d.duration, "Duration", 0, 86400),
      disposition: clean(d.disposition),
      notes: required(d.notes, "Call notes"),
      provider_id: d._provider || null,
      recording: d._recording || null,
    });
    audit(
      db,
      u.id,
      l.id,
      "Call logged",
      `${outcome} · ${clean(d.notes)}`,
      l.project_id,
    );
    if (
      outcome === "Connected" &&
      ["New", "Contact Attempted"].includes(l.stage)
    )
      changeStage(db, u, l, "Contacted");
    if (
      ["No Answer", "Callback Requested"].includes(outcome) &&
      settings(db).callbackTasks
    )
      task(db, u, l, {
        subject: "Call back " + l.name,
        type: "Callback",
        due_at: d.due_at || dayOffset(1) + "T10:00:00Z",
      });
  }
  if (type === "visits" || type === "meetings") {
    const due = dateTime(d.due_at);
    if (type === "visits") {
      id = insert(db, type, {
        ...base,
        due_at: due,
        type: oneOf(
          d.type || "First visit",
          ["First visit", "Repeat visit", "Closing visit"],
          "visit type",
        ),
        location: clean(d.location) || l.location,
        visitors: number(d.visitors || 1, "Visitors", 1, 100),
        notes: clean(d.notes),
      });
      if (stages.indexOf(l.stage) < 5 && stages.includes(l.stage))
        changeStage(db, u, l, "Visit Scheduled");
    } else
      id = insert(db, type, {
        ...base,
        due_at: due,
        type: clean(d.type || "Direct Customer"),
        party: clean(d.party) || l.name,
        purpose: required(d.purpose, "Meeting purpose"),
        location: required(d.location, "Meeting location"),
      });
    audit(
      db,
      u.id,
      l.id,
      type === "visits" ? "Site visit scheduled" : "OBM scheduled",
      `${due.slice(0, 16).replace("T", " ")} · ${clean(d.location) || l.location}`,
      l.project_id,
    );
    task(db, u, l, {
      subject:
        type === "visits" ? `Site visit with ${l.name}` : clean(d.purpose),
      type: type === "visits" ? "Site visit" : "Meeting",
      due_at: due,
    });
  }
  if (type === "messages") {
    if (!l.consent)
      fail("WhatsApp opt-in is required. Update communication consent first.");
    id = insert(db, type, { ...base, body: required(d.body, "Message") });
    audit(
      db,
      u.id,
      l.id,
      "WhatsApp chat opened",
      "Prepared a WhatsApp message. Delivery is not tracked without a provider.",
      l.project_id,
    );
  }
  if (type === "opportunities") {
    id = insert(db, type, {
      lead_id: l.id,
      title: required(d.title, "Opportunity title"),
      value: number(d.value, "Estimated value"),
      probability: number(d.probability, "Probability", 0, 100),
      expected_close: dateTime(d.expected_close).slice(0, 10),
      stage: l.stage,
      next_step: clean(d.next_step),
      created_at: at,
    });
    audit(db, u.id, l.id, "Opportunity created", clean(d.title), l.project_id);
  }
  if (type === "quotations") {
    const unit = db
      .prepare("SELECT * FROM units WHERE id=? AND project_id=?")
      .get(Number(d.unit_id), l.project_id);
    if (
      !unit ||
      !(
        unit.status === "Available" ||
        (unit.status === "On Hold" && unit.lead_id === l.id)
      )
    )
      fail("Select an available unit in this project.");
    const basePrice = Math.round(unit.area * unit.rate),
      charges = Math.round(number(d.charges, "Charges")),
      discount = Math.round(
        number(d.discount, "Discount", 0, basePrice + charges),
      ),
      taxRate = number(d.tax_rate ?? 5, "Tax rate", 0, 100),
      tax = Math.round(((basePrice + charges - discount) * taxRate) / 100),
      valid = dateTime(d.valid_until).slice(0, 10);
    if (valid < day()) fail("Quotation validity must be today or later.");
    id = insert(db, type, {
      ...base,
      unit_id: unit.id,
      base: basePrice,
      charges,
      discount,
      tax_rate: taxRate,
      tax,
      total: basePrice + charges - discount + tax,
      status: discount ? "Pending approval" : "Approved",
      valid_until: valid,
    });
    if (d.parent_id) {
      const parent = db
        .prepare("SELECT * FROM quotations WHERE id=? AND lead_id=?")
        .get(Number(d.parent_id), l.id);
      if (!parent || parent.status === "Superseded")
        fail("Select the current quotation revision.");
      if (
        db
          .prepare(
            "SELECT id FROM bookings WHERE quotation_id=? AND status IN ('Pending approval','Confirmed')",
          )
          .get(parent.id)
      )
        fail("A quotation in an active booking request is locked.");
      const ref = db
          .prepare("SELECT * FROM quotation_revisions WHERE quote_id=?")
          .get(parent.id),
        root = ref?.root_id || parent.id;
      insert(db, "quotation_revisions", {
        quote_id: id,
        parent_id: parent.id,
        root_id: root,
        version: (ref?.version || 1) + 1,
      });
      db.prepare("UPDATE quotations SET status='Superseded' WHERE id=?").run(
        parent.id,
      );
      audit(
        db,
        u.id,
        l.id,
        "Quotation revised",
        `QT-${id} replaces QT-${parent.id}; original financial snapshot preserved.`,
        l.project_id,
      );
    }
    audit(
      db,
      u.id,
      l.id,
      "Quotation created",
      `Cost sheet QT-${id} · Unit ${unit.tower}-${unit.number}`,
      l.project_id,
    );
  }
  if (type === "bookings") {
    const q = db
      .prepare("SELECT * FROM quotations WHERE id=? AND lead_id=?")
      .get(Number(d.quotation_id), l.id);
    if (!q || !["Approved", "Sent"].includes(q.status) || q.valid_until < day())
      fail("A valid, approved quotation for this lead is required.");
    const unit = db.prepare("SELECT * FROM units WHERE id=?").get(q.unit_id);
    if (
      !(
        unit.status === "Available" ||
        (unit.status === "On Hold" && unit.lead_id === l.id)
      )
    )
      fail("This unit is not available for booking.", 409);
    if (
      db
        .prepare(
          "SELECT id FROM bookings WHERE unit_id=? AND status='Pending approval'",
        )
        .get(unit.id)
    )
      fail("This unit already has a pending booking request.", 409);
    id = insert(db, type, {
      ...base,
      unit_id: unit.id,
      quotation_id: q.id,
      value: q.total,
    });
    changeStage(db, u, l, "Booking In Progress", "", true);
    audit(
      db,
      u.id,
      l.id,
      "Booking requested",
      `Manager approval requested for unit ${unit.tower}-${unit.number}.`,
      l.project_id,
    );
    notify(
      db,
      1,
      "Booking approval requested",
      l.name + " · " + l.project,
      l.id,
      "Booking",
    );
  }
  db.prepare("UPDATE leads SET updated_at=? WHERE id=?").run(at, l.id);
  return {
    id,
    message: "Record saved.",
    ...(type === "messages"
      ? {
          phone:
            JSON.parse(
              db
                .prepare("SELECT details FROM contacts WHERE id=?")
                .get(l.contact_id).details,
            ).whatsapp_number || l.phone,
        }
      : {}),
  };
}
export function updateEntity(db, u, type, id, d) {
  permit(u, entityCaps[type]);
  const r = db.prepare(`SELECT * FROM ${type} WHERE id=?`).get(id);
  if (!r) fail("Record not found.", 404);
  const l = getLead(db, u, r.lead_id);
  let label = "";
  if (type === "tasks") {
    const status = oneOf(
      d.status,
      ["Completed", "In Progress", "Cancelled", "Open"],
      "task status",
    );
    if (
      status === "Completed" &&
      (!clean(d.outcome) || /^(done|completed|ok)$/i.test(clean(d.outcome)))
    )
      fail("Record the actual outcome, not just “Done”.");
    db.prepare("UPDATE tasks SET status=?,outcome=?,due_at=? WHERE id=?").run(
      status,
      clean(d.outcome),
      d.due_at ? dateTime(d.due_at) : r.due_at,
      id,
    );
    label = "Task " + status.toLowerCase();
  } else if (type === "visits") {
    if (["Completed", "Cancelled"].includes(r.status))
      fail("This visit is already closed.");
    const status = oneOf(
      d.status,
      [
        "Confirmed",
        "Checked in",
        "Completed",
        "Cancelled",
        "No Show",
        "Rescheduled",
      ],
      "visit status",
    );
    if (status === "Checked in" && !d._verified)
      fail("A verified visitor pass is required.");
    if (status === "Completed" && !r.check_in)
      fail("Check in the visitor before completing this visit.");
    if (status === "Completed") required(d.outcome, "Visit feedback");
    db.prepare(
      "UPDATE visits SET status=?,check_in=?,check_out=?,feedback=?,due_at=? WHERE id=?",
    ).run(
      status,
      status === "Checked in" ? now() : r.check_in,
      status === "Completed" ? now() : r.check_out,
      clean(d.outcome),
      d.due_at ? dateTime(d.due_at) : r.due_at,
      id,
    );
    if (status === "Completed") {
      if (stages.indexOf(l.stage) <= 5 && stages.includes(l.stage))
        changeStage(db, u, l, "Visit Completed");
      task(db, u, l, {
        subject: "Post-visit follow-up: " + l.name,
        type: "Call",
        due_at: d.next_followup || dayOffset(1) + "T10:00:00Z",
      });
    }
    label = "Site visit " + status.toLowerCase();
  } else if (type === "meetings") {
    const status = oneOf(
      d.status,
      ["Confirmed", "Completed", "Cancelled", "Rescheduled"],
      "meeting status",
    );
    if (status === "Completed") required(d.outcome, "Meeting outcome");
    db.prepare(
      "UPDATE meetings SET status=?,outcome=?,due_at=? WHERE id=?",
    ).run(
      status,
      clean(d.outcome),
      d.due_at ? dateTime(d.due_at) : r.due_at,
      id,
    );
    label = "OBM " + status.toLowerCase();
  } else if (type === "quotations") {
    if (r.status === "Superseded")
      fail("This quotation was superseded by a later revision.");
    const status = oneOf(d.status, ["Approved", "Sent"], "quotation status");
    if (status === "Approved") permit(u, "approve");
    if (status === "Sent" && r.status !== "Approved")
      fail("Approve this quotation before marking it sent.");
    if (r.valid_until < day())
      fail("This quotation has expired. Create a new cost sheet.");
    db.prepare("UPDATE quotations SET status=? WHERE id=?").run(status, id);
    if (status === "Sent") {
      if (stages.indexOf(l.stage) < 8 && stages.includes(l.stage))
        changeStage(db, u, l, "Quotation Sent");
      task(db, u, l, {
        type: "Quotation",
        subject: "Follow up on quotation QT-" + id,
        due_at: dayOffset(1) + "T11:00:00Z",
      });
    }
    label = "Quotation " + status.toLowerCase();
  } else if (type === "bookings") {
    permit(u, "approve");
    if (r.status !== "Pending approval")
      fail("This request has already been reviewed.", 409);
    const status = oneOf(d.status, ["Confirmed", "Rejected"], "booking status");
    if (status === "Confirmed") {
      const quotation = db
        .prepare("SELECT status,valid_until FROM quotations WHERE id=?")
        .get(r.quotation_id);
      if (
        !quotation ||
        !["Approved", "Sent"].includes(quotation.status) ||
        quotation.valid_until < day()
      )
        fail(
          "The cost sheet is no longer valid. Reject this request and issue a new quotation.",
        );
      const unit = db.prepare("SELECT * FROM units WHERE id=?").get(r.unit_id);
      if (
        !(
          unit.status === "Available" ||
          (unit.status === "On Hold" && unit.lead_id === l.id)
        )
      )
        fail("The unit is no longer available.", 409);
      db.prepare(
        "UPDATE units SET status='Booked',lead_id=?,hold_until=NULL WHERE id=?",
      ).run(l.id, unit.id);
      changeStage(db, u, l, "Booked / Won", "", true);
    } else {
      required(d.outcome, "Rejection reason");
      changeStage(db, u, l, "Negotiation", d.outcome, true);
    }
    db.prepare(
      "UPDATE bookings SET status=?,approver_id=?,confirmed_at=? WHERE id=?",
    ).run(status, u.id, status === "Confirmed" ? now() : null, id);
    label = "Booking " + status.toLowerCase();
  } else if (type === "opportunities") {
    const stage = oneOf(
      d.stage || r.stage,
      [...stages, ...outcomes],
      "opportunity stage",
    );
    if (["Lost", "Not Interested", "Not Qualified"].includes(stage))
      required(d.outcome, "Loss reason");
    if (
      ["Booked / Won", "Booking In Progress"].includes(stage) &&
      l.stage !== stage
    )
      fail("Complete the booking workflow before updating this opportunity.");
    db.prepare(
      "UPDATE opportunities SET title=?,value=?,probability=?,expected_close=?,stage=?,next_step=? WHERE id=?",
    ).run(
      required(d.title || r.title, "Opportunity name"),
      number(d.value ?? r.value, "Estimated value"),
      number(d.probability ?? r.probability, "Probability", 0, 100),
      dateTime(d.expected_close || r.expected_close).slice(0, 10),
      stage,
      clean(d.next_step ?? r.next_step),
      id,
    );
    label = "Opportunity updated";
  } else fail("This record cannot be modified.", 405);
  audit(
    db,
    u.id,
    l.id,
    label,
    `${type.slice(0, -1)} #${id}${d.outcome ? " · " + clean(d.outcome) : ""}`,
    l.project_id,
  );
  return { id, message: label + "." };
}
export function range(q = {}) {
  const today = day(),
    t = new Date(today + "T00:00:00Z");
  let start,
    end = today;
  switch (q.period) {
    case "Today":
      start = today;
      break;
    case "Yesterday":
      start = end = dayOffset(-1);
      break;
    case "Last 7 days":
      start = dayOffset(-6);
      break;
    case "Last month":
      start = day(
        new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1)),
      );
      end = dayOffset(
        -1,
        day(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1))),
      );
      break;
    case "Custom range":
      start = dateTime(q.from).slice(0, 10);
      end = dateTime(q.to).slice(0, 10);
      if (start > end || +new Date(end) - +new Date(start) > 366 * 86400000)
        fail("Choose a date range of at most one year.");
      break;
    default:
      start = day(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1)));
  }
  const length = (+new Date(end) - +new Date(start)) / 86400000 + 1;
  let ps = dayOffset(-length, start),
    pe = dayOffset(-1, start);
  if (!q.period || ["This month", "Last month"].includes(q.period)) {
    const d = new Date(start);
    ps = day(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)));
    pe = dayOffset(
      Math.min(
        length,
        new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)).getUTCDate(),
      ) - 1,
      ps,
    );
  }
  return { start, end, ps, pe, length };
}
