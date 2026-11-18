import { DatabaseSync } from "node:sqlite";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const stages = [
  "New",
  "Contact Attempted",
  "Contacted",
  "Qualified",
  "Interested",
  "Visit Scheduled",
  "Visit Completed",
  "Negotiation",
  "Quotation Sent",
  "Booking In Progress",
  "Booked / Won",
];
export const outcomes = [
  "Not Interested",
  "Not Qualified",
  "Lost",
  "No Response",
  "Dormant",
];
export const sources = [
  "Meta Ads",
  "Google Ads",
  "WhatsApp",
  "Project Website",
  "Property Portal",
  "Walk-in",
  "Referral",
  "Channel Partner",
  "Exhibition",
  "Import",
];
export const roles = [
  "Super Admin",
  "CRM Admin",
  "Sales Head",
  "Sales Manager",
  "Sales Executive",
  "Telecaller",
  "Marketing Manager",
  "Inventory Controller",
  "Visit Coordinator",
  "Channel Partner",
];
export const now = () => new Date().toISOString();
export const day = (d = new Date()) => new Date(d).toISOString().slice(0, 10);
export const dayOffset = (n, d = new Date()) => {
  const t = new Date(d);
  t.setUTCDate(t.getUTCDate() + n);
  return day(t);
};
export const hashPassword = (value) => {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(value, salt, 64).toString("hex");
};
export const verifyPassword = (value, stored) => {
  if (!stored) return false;
  const [salt, key] = stored.split(":");
  return timingSafeEqual(Buffer.from(key, "hex"), scryptSync(value, salt, 64));
};
export function database(
  file = process.env.CRM_DB || ".crm-data/workspace.sqlite",
) {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(
    "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
  );
  const hasSearch = !!db
    .prepare("SELECT 1 FROM sqlite_master WHERE name='contact_search'")
    .get();
  db.exec(`
  CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT, role TEXT NOT NULL, team TEXT DEFAULT 'North Sales', branch TEXT DEFAULT 'Head office', projects TEXT DEFAULT '[]', active INTEGER DEFAULT 1, last_login TEXT, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, category TEXT NOT NULL, location TEXT NOT NULL, city TEXT DEFAULT '', developer TEXT DEFAULT '', rera TEXT DEFAULT '', description TEXT DEFAULT '', status TEXT DEFAULT 'Active', image TEXT, start_price INTEGER DEFAULT 0, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS contacts (id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT UNIQUE NOT NULL, email TEXT DEFAULT '', city TEXT DEFAULT '', consent INTEGER DEFAULT 0, details TEXT DEFAULT '{}', created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS batches (id INTEGER PRIMARY KEY, filename TEXT, total INTEGER, imported INTEGER DEFAULT 0, linked INTEGER DEFAULT 0, failures TEXT DEFAULT '[]', status TEXT DEFAULT 'Completed', user_id INTEGER REFERENCES users(id), created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS leads (id INTEGER PRIMARY KEY, contact_id INTEGER NOT NULL REFERENCES contacts(id), project_id INTEGER NOT NULL REFERENCES projects(id), owner_id INTEGER REFERENCES users(id), source TEXT NOT NULL, campaign TEXT DEFAULT '', stage TEXT NOT NULL DEFAULT 'New', temperature TEXT DEFAULT 'Warm', priority TEXT DEFAULT 'Medium', score INTEGER DEFAULT 50, budget INTEGER DEFAULT 0, configuration TEXT DEFAULT '', next_action TEXT DEFAULT '', loss_reason TEXT DEFAULT '', details TEXT DEFAULT '{}', batch_id INTEGER REFERENCES batches(id), archived INTEGER DEFAULT 0, created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS enquiries (id INTEGER PRIMARY KEY, lead_id INTEGER NOT NULL REFERENCES leads(id), source TEXT, original_source TEXT, campaign TEXT, metadata TEXT, batch_id INTEGER REFERENCES batches(id), created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS activities (id INTEGER PRIMARY KEY, lead_id INTEGER REFERENCES leads(id), project_id INTEGER REFERENCES projects(id), user_id INTEGER REFERENCES users(id), kind TEXT NOT NULL, description TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY, lead_id INTEGER NOT NULL REFERENCES leads(id), subject TEXT NOT NULL, type TEXT NOT NULL, due_at TEXT NOT NULL, owner_id INTEGER REFERENCES users(id), priority TEXT DEFAULT 'Medium', status TEXT DEFAULT 'Open', outcome TEXT DEFAULT '', created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS calls (id INTEGER PRIMARY KEY, lead_id INTEGER NOT NULL REFERENCES leads(id), user_id INTEGER REFERENCES users(id), direction TEXT DEFAULT 'Outbound', outcome TEXT NOT NULL, duration INTEGER DEFAULT 0, disposition TEXT DEFAULT '', notes TEXT, provider_id TEXT UNIQUE, recording TEXT, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY, lead_id INTEGER NOT NULL REFERENCES leads(id), user_id INTEGER REFERENCES users(id), type TEXT DEFAULT 'First visit', due_at TEXT NOT NULL, status TEXT DEFAULT 'Scheduled', location TEXT, visitors INTEGER DEFAULT 1, notes TEXT, check_in TEXT, check_out TEXT, feedback TEXT, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS meetings (id INTEGER PRIMARY KEY, lead_id INTEGER NOT NULL REFERENCES leads(id), user_id INTEGER REFERENCES users(id), party TEXT, type TEXT, purpose TEXT, location TEXT NOT NULL, due_at TEXT NOT NULL, status TEXT DEFAULT 'Scheduled', outcome TEXT, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, lead_id INTEGER NOT NULL REFERENCES leads(id), user_id INTEGER REFERENCES users(id), body TEXT NOT NULL, channel TEXT DEFAULT 'WhatsApp', status TEXT DEFAULT 'Chat opened', created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS units (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id), number TEXT NOT NULL, tower TEXT DEFAULT 'A', floor INTEGER DEFAULT 1, category TEXT NOT NULL, area REAL NOT NULL, rate REAL NOT NULL, status TEXT DEFAULT 'Available', lead_id INTEGER REFERENCES leads(id), hold_until TEXT, reason TEXT, created_at TEXT NOT NULL, UNIQUE(project_id,tower,number));
  CREATE TABLE IF NOT EXISTS quotations (id INTEGER PRIMARY KEY, lead_id INTEGER NOT NULL REFERENCES leads(id), unit_id INTEGER NOT NULL REFERENCES units(id), user_id INTEGER REFERENCES users(id), base INTEGER NOT NULL, charges INTEGER NOT NULL, discount INTEGER NOT NULL, tax_rate REAL NOT NULL, tax INTEGER NOT NULL, total INTEGER NOT NULL, status TEXT DEFAULT 'Draft', valid_until TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS bookings (id INTEGER PRIMARY KEY, lead_id INTEGER NOT NULL REFERENCES leads(id), unit_id INTEGER NOT NULL REFERENCES units(id), quotation_id INTEGER NOT NULL REFERENCES quotations(id), user_id INTEGER REFERENCES users(id), approver_id INTEGER REFERENCES users(id), value INTEGER NOT NULL, status TEXT DEFAULT 'Pending approval', confirmed_at TEXT, created_at TEXT NOT NULL);
  CREATE UNIQUE INDEX IF NOT EXISTS booked_unit ON bookings(unit_id) WHERE status='Confirmed';
  CREATE TABLE IF NOT EXISTS opportunities (id INTEGER PRIMARY KEY, lead_id INTEGER NOT NULL REFERENCES leads(id), title TEXT NOT NULL, value INTEGER, probability INTEGER, expected_close TEXT, stage TEXT, next_step TEXT, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS partners (id INTEGER PRIMARY KEY, name TEXT NOT NULL, company TEXT, email TEXT, phone TEXT, status TEXT DEFAULT 'Active', created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS partner_leads (lead_id INTEGER PRIMARY KEY REFERENCES leads(id), partner_id INTEGER REFERENCES partners(id));
  CREATE TABLE IF NOT EXISTS partner_reviews (id INTEGER PRIMARY KEY,lead_id INTEGER NOT NULL REFERENCES leads(id),original_id INTEGER NOT NULL REFERENCES partners(id),proposed_id INTEGER NOT NULL REFERENCES partners(id),status TEXT DEFAULT 'Pending',winner_id INTEGER REFERENCES partners(id),reason TEXT,reviewer_id INTEGER REFERENCES users(id),resolved_at TEXT,created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS quotation_revisions (quote_id INTEGER PRIMARY KEY REFERENCES quotations(id),parent_id INTEGER REFERENCES quotations(id),root_id INTEGER NOT NULL REFERENCES quotations(id),version INTEGER NOT NULL,UNIQUE(root_id,version));
  CREATE TABLE IF NOT EXISTS campaigns (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, project_id INTEGER REFERENCES projects(id), source TEXT, budget INTEGER DEFAULT 0, spend INTEGER, start_date TEXT, end_date TEXT, status TEXT DEFAULT 'Active', created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), title TEXT NOT NULL, body TEXT, lead_id INTEGER REFERENCES leads(id), kind TEXT DEFAULT 'Assignment', is_read INTEGER DEFAULT 0, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS import_jobs (batch_id INTEGER PRIMARY KEY REFERENCES batches(id),rows TEXT NOT NULL,cursor INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS batch_snapshots (batch_id INTEGER REFERENCES batches(id),lead_id INTEGER REFERENCES leads(id),last_activity INTEGER NOT NULL,PRIMARY KEY(batch_id,lead_id));
  CREATE TABLE IF NOT EXISTS documents (id INTEGER PRIMARY KEY,lead_id INTEGER NOT NULL REFERENCES leads(id),user_id INTEGER REFERENCES users(id),name TEXT NOT NULL,mime TEXT NOT NULL,bytes INTEGER NOT NULL,content BLOB NOT NULL,created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS visit_passes (visit_id INTEGER PRIMARY KEY REFERENCES visits(id),code_hash TEXT NOT NULL,expires_at TEXT NOT NULL,attempts INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS integration_failures (id INTEGER PRIMARY KEY,kind TEXT NOT NULL,event_id TEXT,reason TEXT NOT NULL,payload TEXT NOT NULL,status TEXT DEFAULT 'Needs review',attempts INTEGER DEFAULT 1,created_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_documents_lead ON documents(lead_id,id);
  CREATE TABLE IF NOT EXISTS events (external_id TEXT PRIMARY KEY, kind TEXT, record_id INTEGER, created_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_leads_date ON leads(created_at,project_id);
  CREATE INDEX IF NOT EXISTS idx_leads_owner ON leads(owner_id,archived,stage);
  CREATE INDEX IF NOT EXISTS idx_leads_contact ON leads(contact_id,project_id);
  CREATE INDEX IF NOT EXISTS idx_leads_project ON leads(project_id,stage,created_at);
  CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_activities_lead ON activities(lead_id,id DESC);
  CREATE INDEX IF NOT EXISTS idx_activities_time ON activities(created_at);
  CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(owner_id,status,due_at);
  CREATE INDEX IF NOT EXISTS idx_calls_lead ON calls(lead_id,created_at);
  CREATE INDEX IF NOT EXISTS idx_visits_due ON visits(due_at,lead_id);
  CREATE INDEX IF NOT EXISTS idx_units_project ON units(project_id,status);
  CREATE INDEX IF NOT EXISTS idx_notification_user ON notifications(user_id,is_read);
  CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON activities BEGIN SELECT RAISE(ABORT,'Audit records are immutable'); END;
  CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON activities BEGIN SELECT RAISE(ABORT,'Audit records are immutable'); END;
  `);
  db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS contact_search USING fts5(name,phone,email,content='contacts',content_rowid='id',tokenize='trigram');
    CREATE TRIGGER IF NOT EXISTS search_contact_new AFTER INSERT ON contacts BEGIN INSERT INTO contact_search(rowid,name,phone,email) VALUES(new.id,new.name,new.phone,new.email); END;
    CREATE TRIGGER IF NOT EXISTS search_contact_edit AFTER UPDATE OF name,phone,email ON contacts BEGIN INSERT INTO contact_search(contact_search,rowid,name,phone,email) VALUES('delete',old.id,old.name,old.phone,old.email); INSERT INTO contact_search(rowid,name,phone,email) VALUES(new.id,new.name,new.phone,new.email); END;`);
  if (!hasSearch)
    db.exec("INSERT INTO contact_search(contact_search) VALUES ('rebuild')");
  return db;
}
export function insert(db, table, obj) {
  const keys = Object.keys(obj);
  return Number(
    db
      .prepare(
        `INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
      )
      .run(...keys.map((k) => obj[k] ?? null)).lastInsertRowid,
  );
}
export function tx(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export function audit(
  db,
  user,
  lead,
  kind,
  description,
  project = null,
  at = now(),
) {
  return insert(db, "activities", {
    user_id: user,
    lead_id: lead,
    project_id: project,
    kind,
    description,
    created_at: at,
  });
}
export function settings(db) {
  return Object.fromEntries(
    db
      .prepare("SELECT * FROM settings")
      .all()
      .map((r) => [r.key, JSON.parse(r.value)]),
  );
}
export function setSetting(db, key, value) {
  db.prepare(
    "INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
  ).run(key, JSON.stringify(value));
}
export function initialize(db, demo) {
  if (db.prepare("SELECT count(*) n FROM users").get().n) {
    const mode = settings(db).workspaceMode;
    if (mode !== (demo ? "demo" : "private"))
      throw Error(
        "Workspace mode does not match the database. Use a separate, correctly initialized database for demo and private accounts.",
      );
    return;
  }
  tx(db, () => {
    for (const [key, v] of Object.entries({
      workspaceMode: demo ? "demo" : "private",
      assignment: "Round robin",
      workload: demo ? 1500 : 500,
      firstContactMinutes: 30,
      holdHours: 48,
      hotThreshold: 80,
      warmThreshold: 50,
      callbackTasks: true,
      company: "Bull Realty Global",
    }))
      setSetting(db, key, v);
    if (!demo) {
      if (
        !process.env.CRM_ADMIN_EMAIL ||
        (process.env.CRM_ADMIN_PASSWORD || "").length < 12
      )
        throw Error(
          "Set CRM_ADMIN_EMAIL and a CRM_ADMIN_PASSWORD of at least 12 characters for the first administrator.",
        );
      insert(db, "users", {
        name: "Workspace Admin",
        email: process.env.CRM_ADMIN_EMAIL.toLowerCase(),
        role: "Super Admin",
        password: hashPassword(process.env.CRM_ADMIN_PASSWORD),
        created_at: now(),
      });
      return;
    }
    seed(db);
  });
}
function seed(db) {
  const today = day(),
    stamp = now(),
    date = new Date();
  const y = date.getUTCFullYear(),
    m = date.getUTCMonth(),
    dd = date.getUTCDate();
  const users = [
    ["Arjun Mehta", "Super Admin"],
    ["Neha Kapoor", "Sales Manager"],
    ["Rohan Verma", "Sales Executive"],
    ["Priya Singh", "Sales Executive"],
    ["Kabir Shah", "Sales Executive"],
    ["Ishita Rao", "Telecaller"],
    ["Ananya Sharma", "Marketing Manager"],
    ["Dev Malhotra", "Inventory Controller"],
    ["Mira Sethi", "Visit Coordinator"],
  ];
  users.forEach(([name, role], i) =>
    insert(db, "users", {
      name,
      email: name.split(" ")[0].toLowerCase() + "@bullrealty.example",
      role,
      team: i === 4 ? "West Sales" : "North Sales",
      branch: "Head office",
      projects: JSON.stringify(i === 4 ? [2, 3] : [1, 2, 3]),
      created_at: stamp,
    }),
  );
  const projects = [
    [
      "Skyline Residences",
      "Residential",
      "Sector 150, Noida",
      "Noida",
      "park-residences",
      7200000,
      "Thoughtfully designed two and three bedroom residences set around landscaped courtyards.",
    ],
    [
      "One Commerce Park",
      "Commercial",
      "Golf Course Road, Gurugram",
      "Gurugram",
      "one-commerce",
      9500000,
      "A contemporary business address with premium offices, retail spaces and connected amenities.",
    ],
    [
      "Palm Grove Villas",
      "Residential",
      "Sohna Road, Gurugram",
      "Gurugram",
      "palm-estate",
      14500000,
      "Garden villas, palm-lined avenues and private outdoor spaces in a low-density community.",
    ],
  ];
  projects.forEach(
    ([name, category, location, city, img, start_price, description]) =>
      insert(db, "projects", {
        name,
        category,
        location,
        city,
        image: "/images/" + img + ".webp",
        developer: "Bull Realty Global",
        start_price,
        description,
        created_at: stamp,
      }),
  );
  [
    ["Skyline Launch", "Meta Ads", 1],
    ["Business Address", "Google Ads", 2],
    ["Palm Grove Open House", "Exhibition", 3],
  ].forEach(([name, source, project_id], i) =>
    insert(db, "campaigns", {
      name,
      source,
      project_id,
      budget: [250000, 180000, 120000][i],
      spend: [104000, 92000, 56000][i],
      start_date: day(new Date(Date.UTC(y, m, 1))),
      end_date: day(new Date(Date.UTC(y, m + 1, 0))),
      created_at: stamp,
    }),
  );
  [
    ["Ritika Jain", "Horizon Properties"],
    ["Aman Gupta", "Urban Keys Realty"],
    ["Sanjay Desai", "Northstar Estates"],
  ].forEach(([name, company], i) =>
    insert(db, "partners", {
      name,
      company,
      email: `partner${i + 1}@example.com`,
      phone: `+91900001000${i}`,
      created_at: stamp,
    }),
  );
  for (let p = 1; p <= 3; p++)
    for (let i = 0; i < [144, 96, 60][p - 1]; i++) {
      const floor = Math.floor(i / 8) + 1;
      insert(db, "units", {
        project_id: p,
        number: `${floor}${String((i % 8) + 1).padStart(2, "0")}`,
        tower: p === 3 ? "V" : "A",
        floor,
        category:
          p === 2
            ? i % 4
              ? "Office"
              : "Shop"
            : p === 3
              ? "Villa"
              : i % 3
                ? "2 BHK"
                : "3 BHK",
        area: (p === 2 ? 650 : p === 3 ? 1850 : 950) + (i % 6) * 90,
        rate: 6500 + p * 550,
        status: i % 37 === 0 ? "Blocked" : "Available",
        created_at: stamp,
      });
    }
  const fn = [
    "Aarav",
    "Riya",
    "Vikram",
    "Ananya",
    "Aditya",
    "Isha",
    "Rahul",
    "Meera",
    "Vivaan",
    "Kavya",
    "Siddharth",
    "Aditi",
    "Rohan",
    "Naina",
    "Dhruv",
    "Sara",
    "Yash",
    "Sneha",
    "Armaan",
    "Tara",
    "Manav",
    "Tanvi",
    "Dev",
    "Ishita",
    "Kunal",
    "Anika",
    "Rajat",
    "Sanya",
    "Rehan",
    "Diya",
    "Arnav",
    "Sonal",
    "Ansh",
    "Kiran",
    "Vaibhav",
    "Pooja",
    "Nikhil",
    "Palak",
    "Krish",
    "Shreya",
  ];
  const ln = [
    "Sharma",
    "Kapoor",
    "Verma",
    "Mehta",
    "Singh",
    "Malhotra",
    "Agarwal",
    "Joshi",
    "Khanna",
    "Shah",
    "Bansal",
    "Gupta",
    "Rao",
    "Patel",
    "Arora",
    "Iyer",
    "Jain",
    "Saxena",
    "Sethi",
    "Mishra",
    "Chopra",
    "Garg",
    "Suri",
    "Chawla",
    "Bhatia",
    "Das",
    "Dubey",
    "Puri",
    "Dutta",
    "Sehgal",
    "Roy",
    "Trivedi",
    "Sinha",
    "Tandon",
    "Nair",
    "Kulkarni",
    "Desai",
    "Goyal",
    "Shetty",
    "Sood",
  ];
  const items = [];
  let idx = 0;
  for (let mo = -1; mo <= 0; mo++) {
    const days = mo ? new Date(Date.UTC(y, m, 0)).getUTCDate() : dd;
    for (let d = 1; d <= days; d++) {
      const shape = [
        36, 42, 68, 60, 56, 72, 70, 62, 80, 74, 64, 77, 92, 81, 70, 84, 98, 98,
      ];
      const n = mo
        ? Math.round(
            45 + 0.7 * d + 7 * Math.sin(d * 0.83) + 6 * Math.cos(d * 1.37),
          )
        : (shape[d - 1] ?? Math.round(67 + d * 0.8 + 12 * Math.sin(d * 0.94)));
      for (let j = 0; j < n; j++) {
        idx++;
        const pid = idx % 10 < 5 ? 1 : idx % 10 < 8 ? 2 : 3,
          name =
            fn[(idx * 7) % fn.length] +
            " " +
            ln[(Math.floor(idx / fn.length) * 3 + idx) % ln.length];
        const created = new Date(
          Date.UTC(y, m + mo, d, 8 + (j % 10), idx % 59),
        ).toISOString();
        const cid = insert(db, "contacts", {
          name,
          phone: "+9191" + String(idx).padStart(8, "0"),
          email: `enquiry.${idx}@example.com`,
          city: ["Noida", "New Delhi", "Gurugram", "Varanasi"][idx % 4],
          consent: idx % 5 ? 1 : 0,
          created_at: created,
        });
        const stageIndex = [
          0, 0, 1, 2, 2, 3, 3, 4, 4, 4, 5, 6, 7, 8, 2, 3, 1, 0, 7, 6,
        ][idx % 20];
        const owner =
          idx % 23 === 0
            ? null
            : pid === 1
              ? [3, 4, 6][idx % 3]
              : [3, 4, 5, 6][idx % 4];
        const source = sources[[0, 1, 0, 3, 0, 6, 7, 4, 2, 1, 0, 5][idx % 12]];
        const lid = insert(db, "leads", {
          contact_id: cid,
          project_id: pid,
          owner_id: owner,
          source,
          campaign: [
            "Skyline Launch",
            "Business Address",
            "Palm Grove Open House",
          ][pid - 1],
          stage: idx % 29 === 0 ? "Lost" : stages[stageIndex],
          temperature: ["Warm", "Warm", "Hot", "Cold"][idx % 4],
          priority: ["Medium", "High", "Low", "Medium"][idx % 4],
          score: 35 + ((idx * 7) % 65),
          budget: projects[pid - 1][5] + (idx % 9) * 100000,
          configuration: pid === 2 ? "Office" : pid === 3 ? "Villa" : "2 BHK",
          loss_reason: idx % 29 === 0 ? "Budget mismatch" : "",
          created_by: 1,
          created_at: created,
          updated_at: created,
        });
        insert(db, "enquiries", {
          lead_id: lid,
          source,
          original_source: source,
          campaign: [
            "Skyline Launch",
            "Business Address",
            "Palm Grove Open House",
          ][pid - 1],
          metadata: "{}",
          created_at: created,
        });
        audit(
          db,
          1,
          lid,
          "Lead created",
          `New enquiry received from ${source}.`,
          pid,
          created,
        );
        if (owner)
          audit(
            db,
            1,
            lid,
            "Lead assigned",
            `Assigned to ${users[owner - 1][0]} by round robin.`,
            pid,
            created,
          );
        if (idx % 3 === 0) {
          insert(db, "calls", {
            lead_id: lid,
            user_id: owner || 3,
            outcome: idx % 9 ? "Connected" : "No Answer",
            duration: idx % 9 ? 70 + (idx % 230) : 0,
            notes: "Discussed project requirements and the next step.",
            created_at: created,
          });
          audit(
            db,
            owner || 3,
            lid,
            "Call logged",
            idx % 9
              ? "Connected · Project information shared."
              : "No answer · Callback requested.",
            pid,
            created,
          );
        }
        if (idx % (mo ? 10 : 8) === 0)
          insert(db, "visits", {
            lead_id: lid,
            user_id: owner || 3,
            due_at: created,
            status: "Completed",
            type: "First visit",
            location: projects[pid - 1][2],
            feedback: "Interested in the project. Cost sheet requested.",
            created_at: created,
          });
        if (idx % (mo ? 39 : 31) === 0) {
          const unit = db
            .prepare(
              "SELECT * FROM units WHERE project_id=? AND status='Available' LIMIT 1",
            )
            .get(pid);
          if (unit) {
            const base = Math.round(unit.area * unit.rate),
              total = Math.round(base * 1.05);
            const q = insert(db, "quotations", {
              lead_id: lid,
              unit_id: unit.id,
              user_id: owner || 3,
              base,
              charges: 0,
              discount: 0,
              tax_rate: 5,
              tax: total - base,
              total,
              status: "Approved",
              valid_until: dayOffset(7, created),
              created_at: created,
            });
            insert(db, "bookings", {
              lead_id: lid,
              unit_id: unit.id,
              quotation_id: q,
              user_id: owner || 3,
              approver_id: 1,
              value: total,
              status: "Confirmed",
              created_at: created,
              confirmed_at: created,
            });
            db.prepare(
              "UPDATE units SET status='Booked',lead_id=? WHERE id=?",
            ).run(lid, unit.id);
            db.prepare("UPDATE leads SET stage='Booked / Won' WHERE id=?").run(
              lid,
            );
            audit(
              db,
              1,
              lid,
              "Booking confirmed",
              `Unit ${unit.tower}-${unit.number} confirmed.`,
              pid,
              created,
            );
          }
        }
        if (source === "Channel Partner")
          insert(db, "partner_leads", {
            lead_id: lid,
            partner_id: 1 + (idx % 3),
          });
        if (items.length < 70 || (mo === 0 && j === 0))
          items.push({ lid, pid, name });
      }
    }
  }
  const taskData = [
    ["Follow up with Riya Sharma", "Call", "10:30", 1],
    ["Skyline site visit", "Site visit", "11:45", 1],
    ["Share cost sheet", "Quotation", "14:00", 2],
    ["Call back Vikram Kapoor", "Call", "15:30", 3],
    ["Review villa requirements", "Meeting", "16:30", 3],
  ];
  taskData.forEach(([subject, type, time, p], i) => {
    const item = items.filter((it) => it.pid === p)[i];
    if (i === 0 || i === 3)
      db.prepare(
        "UPDATE contacts SET name=? WHERE id=(SELECT contact_id FROM leads WHERE id=?)",
      ).run(i === 0 ? "Riya Sharma" : "Vikram Kapoor", item.lid);
    insert(db, "tasks", {
      lead_id: item.lid,
      subject,
      type,
      owner_id: 1,
      priority: i < 2 ? "High" : "Medium",
      due_at: `${today}T${time}:00.000Z`,
      created_at: stamp,
    });
  });
  for (let i = 0; i < 22; i++) {
    const item = items[i];
    insert(db, "tasks", {
      lead_id: item.lid,
      subject: [
        "First contact",
        "Share project details",
        "Pricing discussion",
        "Follow up on visit",
      ][i % 4],
      type: ["Call", "WhatsApp", "Negotiation", "Call"][i % 4],
      owner_id: 3 + (i % 4),
      priority: i % 3 ? "Medium" : "High",
      status: i % 5 ? "Open" : "Completed",
      outcome: i % 5 ? "" : "Customer requested project details.",
      due_at:
        dayOffset((i % 8) - 3) +
        `T${String(10 + (i % 8)).padStart(2, "0")}:30:00.000Z`,
      created_at: stamp,
    });
  }
  for (let i = 0; i < 7; i++) {
    const it = items[i * 3];
    insert(db, "visits", {
      lead_id: it.lid,
      user_id: 3 + (i % 3),
      due_at: dayOffset(i % 4) + "T11:30:00.000Z",
      location: projects[it.pid - 1][2],
      notes: "Walkthrough of the shortlisted property.",
      created_at: stamp,
    });
  }
  for (let i = 0; i < 4; i++)
    insert(db, "meetings", {
      lead_id: items[i].lid,
      user_id: 3 + (i % 3),
      party: items[i].name,
      type: "Direct Customer",
      purpose: ["Investment consultation", "Project presentation"][i % 2],
      location: ["Noida sales office", "Client office, New Delhi"][i % 2],
      due_at: dayOffset(i) + "T14:30:00.000Z",
      created_at: stamp,
    });
  for (const [title, body, kind] of [
    [
      "Your daily briefing is ready",
      "Review lead generation and activity in Reports & analytics.",
      "Report",
    ],
    [
      "Five activities on your schedule",
      "Open My work to plan your day.",
      "Reminder",
    ],
    [
      "New project enquiries",
      "Your sales workspace has been updated.",
      "Assignment",
    ],
  ])
    insert(db, "notifications", {
      user_id: 1,
      title,
      body,
      kind,
      created_at: stamp,
    });
}
