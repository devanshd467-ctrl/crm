import { useState, useEffect, useRef } from "react";
import {
  Plus,
  UserRoundPlus,
  NotebookPen,
  CalendarCheck2,
  Phone,
  FileText,
  MapPin,
  Building2,
  UsersRound,
  ChevronDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  LoaderCircle,
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  MessageCircle,
  Handshake,
  Megaphone,
  Layers3,
  Search,
  X,
  CalendarDays,
  Printer,
  BookmarkCheck,
  ClipboardList,
  GitBranch,
  SlidersHorizontal,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import {
  useApp,
  useLoad,
  useDebounce,
  api,
  qs,
  navigate,
  fmtN,
  money,
  fmtDate,
  stamp,
  Badge,
  Avatar,
  Button,
  ErrorBox,
  Modal,
  Field,
  code,
  download,
  csv,
} from "./lib";
const datePlus = (n = 0) =>
    new Date(Date.now() + n * 86400000).toISOString().slice(0, 10),
  timeInput = () => new Date(Date.now() + 3600000).toISOString().slice(0, 16);
const opts = (items, key = "id", label = "name") =>
  items.map((r) => ({ value: r[key], label: r[label] }));
const selectOpts = (items) =>
  items.map((x) =>
    typeof x === "object" ? (
      <option key={x.value} value={x.value}>
        {x.label}
      </option>
    ) : (
      <option key={x} value={x}>
        {x}
      </option>
    ),
  );
function LeadPicker({ value, onChange, initial, project }) {
  const { allowed } = useApp();
  const [q, setQ] = useState(""),
    [active, setActive] = useState(false),
    [picked, setPicked] = useState(initial || null),
    debounce = useDebounce(q),
    ref = useRef(null);
  const state = useLoad(
    active
      ? (allowed("readLeads") ? "/leads" : "/lead-options") +
          qs({ q: debounce, project, size: 8 })
      : null,
  );
  useEffect(() => {
    const click = (e) => {
      if (!ref.current?.contains(e.target)) setActive(false);
    };
    document.addEventListener("mousedown", click);
    return () => document.removeEventListener("mousedown", click);
  }, []);
  return (
    <div className="lead-picker" ref={ref}>
      {value && picked ? (
        <div className="picked-lead">
          <Avatar name={picked.name || picked.customer} size={26} />
          <span>
            <b>{picked.name || picked.customer}</b> · {code("LD", value)}
          </span>
          <button
            type="button"
            aria-label="Choose another lead"
            onClick={() => {
              setPicked(null);
              onChange("", null);
              setActive(true);
            }}
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="picker-input">
          <Search size={15} />
          <input
            required
            placeholder="Search customer name, mobile or lead ID…"
            autoComplete="off"
            value={q}
            onFocus={() => setActive(true)}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(true);
            }}
          />
        </div>
      )}
      {active && (
        <div className="picker-results">
          {state.data?.items?.map((l) => (
            <button
              type="button"
              key={l.id}
              onClick={() => {
                onChange(l.id, l);
                setPicked(l);
                setActive(false);
                setQ("");
              }}
            >
              <Avatar name={l.name} size={27} />
              <span>
                <b>{l.name}</b>
                <small>
                  {code("LD", l.id)} · {l.project}
                </small>
              </span>
              <ChevronDown size={13} />
            </button>
          ))}
          {state.loading && !state.data && <p>Searching…</p>}
          {!state.loading && !state.data?.items?.length && (
            <p>No matching leads. Try another name.</p>
          )}
        </div>
      )}
    </div>
  );
}
const spec = (key, label, type = "text", required = false, extra = {}) => ({
  key,
  label,
  type,
  required,
  ...extra,
});
export function FormModal({ kind, obj = {} }) {
  const { boot, close, open, allowed, refresh, toast } = useApp();
  const lead = obj.lead;
  const base = {
    ...obj,
    ...(kind === "edit-lead"
      ? { ...lead, ...lead.contact_details, ...lead.details }
      : {}),
    lead_id: lead?.id || obj.lead_id || "",
    project_id:
      lead?.project_id || obj.project_id || boot.projects[0]?.id || "",
    source: "Walk-in",
    owner_id: "",
    priority: "Medium",
    temperature: kind === "add-lead" ? "" : "Warm",
    consent: kind === "edit-lead" ? (lead.consent ? "yes" : "no") : "no",
    type:
      kind === "visits"
        ? "First visit"
        : kind === "meetings"
          ? "Direct Customer"
          : "Call",
    due_at: timeInput(),
    direction: "Outbound",
    outcome: "Connected",
    duration: 0,
    visitors: 1,
    status: "Active",
    category: "Residential",
    tax_rate: 5,
    charges: 0,
    discount: 0,
    valid_until: datePlus(14),
    start_date: datePlus(),
    end_date: datePlus(30),
    expected_close: datePlus(30),
    probability: 50,
    team: "North Sales",
    branch: "Head office",
    role: "Sales Executive",
    projects: boot.projects.map((p) => p.id),
    stage: lead?.stage || "New",
    from: obj.f?.from || datePlus(-6),
    to: obj.f?.to || datePlus(),
    ...obj.defaults,
  };
  if (kind === "edit-lead")
    Object.assign(base, {
      name: lead.name,
      email: lead.email,
      city: lead.city,
      budget: lead.budget,
      configuration: lead.configuration,
      priority: lead.priority,
      temperature: lead.temperature,
      next_action: lead.next_action,
    });
  const [d, setD] = useState(base),
    [busy, setBusy] = useState(false),
    [err, setErr] = useState(""),
    [more, setMore] = useState(false),
    [picked, setPicked] = useState(lead || null),
    [unitQ, setUnitQ] = useState("");
  const set = (k, v) => setD((p) => ({ ...p, [k]: v }));
  const debouncedUnitQ = useDebounce(unitQ);
  const unitState = useLoad(
    kind === "quotations" && d.lead_id
      ? "/units" + qs({ eligible: d.lead_id, size: 100, q: debouncedUnitQ })
      : null,
  );
  const quoteState = useLoad(
    kind === "bookings" && d.lead_id
      ? "/quotations" + qs({ lead: d.lead_id, size: 100 })
      : null,
  );
  const partnerState = useLoad(
    kind === "add-lead" && d.source === "Channel Partner" && allowed("partners")
      ? "/partners"
      : null,
  );
  const projectOpt = opts(boot.projects),
    userOpt = opts(
      boot.users.filter(
        (u) =>
          [
            "Sales Manager",
            "Super Admin",
            "CRM Admin",
            "Sales Head",
            "Sales Executive",
            "Telecaller",
            "Channel Partner",
          ].includes(u.role) &&
          (u.role.endsWith("Admin") ||
            u.projects.includes(Number(d.project_id))),
      ),
    );
  const stageOptions = [
    ...boot.stages.filter(
      (s) => !["Booked / Won", "Booking In Progress"].includes(s),
    ),
    ...boot.outcomes,
  ];
  let title = "",
    sub = "",
    icon = Plus,
    button = "Save record",
    url = "/" + kind,
    method = "POST",
    fields = [],
    extras = [],
    body = d;
  const leadField = spec("lead_id", "Related lead", "lead", true, {
      full: true,
    }),
    projectField = spec("project_id", "Project", "select", true, {
      options: projectOpt,
    }),
    dueField = spec("due_at", "Date & time", "datetime-local", true),
    notes = spec("notes", "Notes", "textarea", false, { full: true }),
    sourceField = spec("source", "Lead source", "select", true, {
      options: boot.sources,
    }),
    priorityField = spec("priority", "Priority", "select", false, {
      options: ["Critical", "High", "Medium", "Low"],
    }),
    tempField = spec("temperature", "Lead temperature", "select", false, {
      options: [
        ...(kind === "add-lead"
          ? [{ value: "", label: "Automatic from score" }]
          : []),
        "Hot",
        "Warm",
        "Cold",
      ],
    }),
    consentField = spec("consent", "Communication consent", "select", false, {
      options: [
        { value: "no", label: "Not opted in / do not call" },
        { value: "yes", label: "Opted in to calls & WhatsApp" },
      ],
      full: true,
    });
  switch (kind) {
    case "add-lead":
      title = "Add a new lead";
      sub = "Capture an enquiry and assign the next step.";
      icon = UserRoundPlus;
      button = "Create lead";
      url = "/leads";
      fields = [
        spec("_customer", "Customer information", "heading"),
        spec("name", "Customer name", "text", true, {
          placeholder: "e.g. Riya Sharma",
        }),
        spec("phone", "Mobile number", "tel", true, {
          placeholder: "+91 98765 43210",
        }),
        spec("email", "Email address", "email", false, {
          placeholder: "name@example.com",
        }),
        spec("city", "City", "text", false, { placeholder: "Enter city" }),
        spec("_lead", "Enquiry details", "heading"),
        projectField,
        sourceField,
        ...(d.source === "Channel Partner"
          ? [
              spec("partner_id", "Channel partner", "select", false, {
                options: opts(partnerState.data || []),
                placeholder: "Select a partner",
                full: true,
              }),
            ]
          : []),
        ...(allowed("assign")
          ? [
              spec("owner_id", "Lead owner", "select", false, {
                options: [
                  { value: "", label: "Auto-assign by workspace rule" },
                  { value: "none", label: "Leave unassigned" },
                  ...userOpt,
                ],
                full: true,
              }),
            ]
          : []),
      ];
      extras = [
        spec("configuration", "Property requirement", "text", false, {
          placeholder: "e.g. 3 BHK apartment",
        }),
        spec("budget", "Budget (₹)", "number"),
        spec("campaign", "Campaign name"),
        spec("timeline", "Purchase timeline", "select", false, {
          options: [
            "Within 3 months",
            "3–6 months",
            "6–12 months",
            "Exploring",
          ],
          placeholder: "Select timeline",
        }),
        priorityField,
        tempField,
        consentField,
        notes,
      ];
      break;
    case "edit-lead":
      title = "Edit lead details";
      sub = code("LD", lead.id) + " · " + lead.name;
      icon = NotebookPen;
      button = "Save changes";
      url = "/leads/" + lead.id;
      method = "PATCH";
      fields = [
        spec("name", "Customer name", "text", true),
        spec("email", "Email", "email"),
        spec("city", "City"),
        spec("budget", "Budget (₹)", "number"),
        spec("configuration", "Property requirement"),
        spec("next_action", "Next action"),
        tempField,
        priorityField,
        consentField,
      ];
      body = Object.fromEntries(fields.map((f) => [f.key, d[f.key]]));
      break;
    case "note":
      title = "Add an internal note";
      icon = NotebookPen;
      sub = lead.name + " · " + lead.project;
      url = "/leads/" + lead.id + "/notes";
      button = "Add note";
      fields = [
        spec("note", "Note", "textarea", true, {
          full: true,
          placeholder: "Record the discussion, decision or next step…",
        }),
      ];
      break;
    case "stage":
    case "bulk-stage":
      title = "Change pipeline stage";
      sub = lead?.name || `${obj.ids?.length} selected leads`;
      icon = GitBranch;
      fields = [
        spec("stage", "New stage", "select", true, {
          options: stageOptions,
          full: true,
        }),
        spec(
          "reason",
          ["Lost", "Not Interested", "Not Qualified"].includes(d.stage)
            ? "Loss reason"
            : "Reason / remark",
          "textarea",
          ["Lost", "Not Interested", "Not Qualified"].includes(d.stage),
          { full: true },
        ),
      ];
      url = lead ? "/leads/" + lead.id : "/leads/bulk";
      method = lead ? "PATCH" : "POST";
      button = "Update stage";
      body = {
        stage: d.stage,
        reason: d.reason,
        action: "stage",
        ids: obj.ids,
      };
      break;
    case "assign":
    case "bulk-assign":
      title = "Assign lead" + (lead ? "" : "s");
      sub = lead?.name || `${obj.ids?.length} selected leads`;
      icon = UsersRound;
      fields = [
        spec("owner_id", "New owner", "select", true, {
          placeholder: "Select an employee",
          options: userOpt,
          full: true,
        }),
        spec("reason", "Assignment reason", "textarea", true, { full: true }),
      ];
      url = lead ? "/leads/" + lead.id : "/leads/bulk";
      method = lead ? "PATCH" : "POST";
      button = "Assign lead" + (lead ? "" : "s");
      body = {
        owner_id: d.owner_id,
        reason: d.reason,
        action: "assign",
        ids: obj.ids,
      };
      break;
    case "tasks":
    case "bulk-task":
      title = "Schedule a follow-up";
      icon = CalendarCheck2;
      button = "Create follow-up";
      fields = [
        ...(kind === "bulk-task" ? [] : [leadField]),
        spec("subject", "Task subject", "text", true, {
          full: true,
          placeholder: "e.g. Discuss shortlisted units",
        }),
        spec("type", "Task type", "select", true, {
          options: [
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
        }),
        priorityField,
        dueField,
      ];
      if (kind === "bulk-task") {
        url = "/leads/bulk";
        body = { ...d, action: "task", ids: obj.ids };
      }
      break;
    case "calls":
      title = "Log a call";
      sub = "Record an actual conversation or call attempt.";
      icon = Phone;
      button = "Save call log";
      fields = [
        leadField,
        spec("direction", "Direction", "select", true, {
          options: ["Outbound", "Inbound"],
        }),
        spec("outcome", "Call outcome", "select", true, {
          options: [
            "Connected",
            "No Answer",
            "Busy",
            "Switched Off",
            "Wrong Number",
            "Voicemail",
            "Call Failed",
            "Callback Requested",
          ],
        }),
        spec("duration", "Talk time (seconds)", "number"),
        spec("disposition", "Disposition", "select", false, {
          options: [
            "Interested",
            "Not Interested",
            "Call Later",
            "Site Visit Interested",
            "Information Shared",
            "Budget Mismatch",
            "Project Mismatch",
            "Negotiation",
            "Other",
          ],
          placeholder: "Choose a disposition",
        }),
        spec("notes", "Call notes", "textarea", true, {
          full: true,
          placeholder: "What was discussed? What happens next?",
        }),
      ];
      break;
    case "visits":
      title = "Schedule a site visit";
      icon = MapPin;
      button = "Schedule visit";
      fields = [
        leadField,
        spec("type", "Visit type", "select", true, {
          options: ["First visit", "Repeat visit", "Closing visit"],
        }),
        spec("visitors", "Number of visitors", "number", true, { min: 1 }),
        dueField,
        spec("location", "Meeting point", "text", false, {
          placeholder: "Defaults to project location",
        }),
        notes,
      ];
      break;
    case "meetings":
      title = "Schedule a field meeting";
      sub = "Outside business meeting";
      icon = Handshake;
      button = "Schedule meeting";
      fields = [
        leadField,
        spec("party", "Meeting party", "text", false, {
          placeholder: "Customer or business name",
        }),
        spec("type", "Party type", "select", true, {
          options: [
            "Direct Customer",
            "Corporate",
            "Channel Partner",
            "Referral Partner",
            "Business Association",
            "Other",
          ],
        }),
        spec("purpose", "Meeting purpose", "text", true, { full: true }),
        spec("location", "Location", "text", true),
        dueField,
      ];
      break;
    case "opportunities":
      title = obj.edit ? "Edit opportunity" : "Create opportunity";
      if (obj.edit) {
        url = "/opportunities/" + obj.edit;
        method = "PATCH";
      }
      icon = GitBranch;
      button = obj.edit ? "Save opportunity" : "Create opportunity";
      fields = [
        leadField,
        spec("title", "Opportunity name", "text", true, { full: true }),
        spec("value", "Estimated value (₹)", "number", true),
        spec("probability", "Probability (%)", "number", true, { max: 100 }),
        spec("expected_close", "Expected closing date", "date", true),
        spec("next_step", "Next step"),
        ...(obj.edit
          ? [
              spec("stage", "Opportunity stage", "select", true, {
                options: [...boot.stages, ...boot.outcomes],
              }),
              spec("outcome", "Closing / loss reason", "text", false),
            ]
          : []),
      ];
      break;
    case "messages":
      title = "Prepare WhatsApp message";
      sub = "Open the customer’s chat; delivery is not tracked here.";
      icon = MessageCircle;
      button = "Prepare chat";
      fields = [
        leadField,
        spec("template", "Message template", "select", false, {
          options: [
            "Project introduction",
            "Site visit confirmation",
            "Follow-up",
          ],
          placeholder: "Choose a draft template",
          full: true,
        }),
        spec("body", "Message", "textarea", true, {
          full: true,
          placeholder: "Write your message…",
        }),
      ];
      break;
    case "quotations":
      title = obj.defaults?.parent_id ? "Revise quotation" : "Create quotation";
      sub = "Cost sheet based on the selected unit’s approved rate.";
      icon = FileText;
      button = "Generate quotation";
      fields = [
        leadField,
        spec("unit_id", "Available unit", "unit", true, { full: true }),
        spec("charges", "Additional charges (₹)", "number"),
        spec("discount", "Discount (₹)", "number"),
        spec("tax_rate", "Tax rate (%)", "number", true, {
          max: 100,
          step: ".01",
        }),
        spec("valid_until", "Valid until", "date", true),
        spec("_price", "Quotation summary", "summary"),
      ];
      break;
    case "bookings":
      title = "Request booking approval";
      sub = "A manager must confirm the booking before the unit is locked.";
      icon = BookmarkCheck;
      button = "Request approval";
      fields = [
        leadField,
        spec("quotation_id", "Approved cost sheet", "select", true, {
          options: (quoteState.data?.items || [])
            .filter(
              (q) =>
                ["Approved", "Sent"].includes(q.status) &&
                q.valid_until >= datePlus(),
            )
            .map((q) => ({
              value: q.id,
              label: `${code("QT", q.id)} · ${q.tower}-${q.unit_number} · ${money(q.total)}`,
            })),
          placeholder: "Choose a valid quotation",
          full: true,
          hint: "Create and approve a quotation for this lead first.",
        }),
      ];
      break;
    case "projects":
      title = obj.edit ? "Edit project" : "Add project";
      if (obj.edit) {
        method = "PATCH";
        url = "/projects/" + obj.edit;
      }
      sub = "Create a new property in your portfolio.";
      icon = Building2;
      button = obj.edit ? "Save changes" : "Create project";
      fields = [
        spec("name", "Project name", "text", true, { full: true }),
        spec("category", "Project category", "select", true, {
          options: ["Residential", "Commercial", "Mixed-use"],
        }),
        spec("status", "Project status", "select", true, {
          options: ["Active", "Upcoming", "Completed"],
        }),
        spec("location", "Location / address", "text", true, { full: true }),
        spec("city", "City"),
        spec("developer", "Developer name"),
        spec("rera", "RERA number"),
        spec("start_price", "Starting price (₹)", "number"),
        spec("description", "Description", "textarea", false, { full: true }),
      ];
      break;
    case "units":
      title = "Add inventory unit";
      icon = Layers3;
      button = "Create unit";
      fields = [
        projectField,
        spec("number", "Unit number", "text", true),
        spec("tower", "Tower / block", "text", false, { placeholder: "A" }),
        spec("floor", "Floor", "number", true, { min: -5 }),
        spec("category", "Unit type", "text", true, {
          placeholder: "e.g. 2 BHK, Office",
        }),
        spec("area", "Saleable area (sq. ft.)", "number", true, {
          min: 1,
          step: ".01",
        }),
        spec("rate", "Rate per sq. ft. (₹)", "number", true, {
          min: 1,
          step: ".01",
        }),
      ];
      break;
    case "hold":
    case "release":
    case "price":
      title =
        kind === "hold"
          ? "Hold inventory unit"
          : kind === "release"
            ? "Release unit hold"
            : "Update unit price";
      sub = `${obj.unit.project} · Unit ${obj.unit.tower}-${obj.unit.number}`;
      icon = Layers3;
      url = "/units/" + obj.unit.id;
      method = "PATCH";
      button =
        kind === "hold"
          ? "Place on hold"
          : kind === "release"
            ? "Release hold"
            : "Save price";
      fields =
        kind === "price"
          ? [
              spec("rate", "New rate per sq. ft. (₹)", "number", true, {
                min: 1,
                full: true,
              }),
            ]
          : [
              ...(kind === "hold" ? [leadField] : []),
              spec(
                "reason",
                kind === "hold" ? "Hold reason" : "Release reason",
                "textarea",
                true,
                {
                  full: true,
                  hint:
                    kind === "hold"
                      ? `Hold expires after ${boot.settings.holdHours} hours unless a booking is pending.`
                      : null,
                },
              ),
            ];
      body = { ...d, action: kind };
      break;
    case "partners":
      title = "Register channel partner";
      icon = Handshake;
      button = "Register partner";
      fields = [
        spec("name", "Contact name", "text", true),
        spec("company", "Company / agency", "text", true),
        spec("phone", "Mobile number", "tel", true),
        spec("email", "Email address", "email"),
        spec("status", "Partner status", "select", false, {
          options: ["Active", "Pending", "Inactive"],
        }),
      ];
      break;
    case "campaigns":
      title = "Create marketing campaign";
      icon = Megaphone;
      button = "Create campaign";
      fields = [
        spec("name", "Campaign name", "text", true, { full: true }),
        projectField,
        sourceField,
        spec("budget", "Campaign budget (₹)", "number"),
        spec("spend", "Recorded ad spend (₹)", "number", false, {
          hint: "Leave blank if unavailable.",
        }),
        spec("start_date", "Start date", "date", true),
        spec("end_date", "End date", "date", true),
        spec("status", "Status", "select", false, {
          options: ["Active", "Planned", "Paused", "Completed"],
        }),
      ];
      break;
    case "users":
      title = "Add workspace user";
      sub = "Grant CRM access by role and project.";
      icon = ShieldCheck;
      button = "Create user";
      fields = [
        spec("name", "Full name", "text", true),
        spec("email", "Official email", "email", true),
        spec("role", "CRM role", "select", true, { options: boot.roles }),
        spec("team", "Team", "text", true),
        spec("branch", "Branch", "text", true),
        spec("password", "Initial password", "password", true, {
          hint: "At least 12 characters.",
          minLength: 12,
        }),
        spec("projects", "Authorized projects", "multiselect", false, {
          options: projectOpt,
          full: true,
        }),
      ];
      break;
    case "date-range":
      title = "Custom date range";
      icon = CalendarDays;
      button = "Apply dates";
      fields = [
        spec("from", "From", "date", true),
        spec("to", "Through", "date", true),
      ];
      break;
    case "global-filters":
      title = "Dashboard filters";
      sub = "Apply the same filters to metrics, trends and reports.";
      icon = SlidersHorizontal;
      button = "Apply filters";
      fields = [
        spec("src", "Lead source", "select", false, {
          options: boot.sources,
          placeholder: "All sources",
        }),
        spec("stg", "Lead stage", "select", false, {
          options: [...boot.stages, ...boot.outcomes],
          placeholder: "All stages",
        }),
        spec("owner", "Employee", "select", false, {
          options: opts(boot.users),
          placeholder: "All employees",
        }),
        spec("campaign", "Campaign name", "text", false, {
          placeholder: "All campaigns",
        }),
        spec("team", "Sales team", "select", false, {
          options: [...new Set(boot.users.map((u) => u.team))],
          placeholder: "All teams",
        }),
        spec("branch", "Branch", "select", false, {
          options: [...new Set(boot.users.map((u) => u.branch))],
          placeholder: "All branches",
        }),
      ];
      break;
    case "lead-filters":
      title = "Advanced filters";
      sub = "Narrow your workspace to the right leads.";
      icon = SlidersHorizontal;
      button = "Apply filters";
      fields = [
        spec("project", "Project", "select", false, {
          options: projectOpt,
          placeholder: "All projects",
        }),
        spec("src", "Source", "select", false, {
          options: boot.sources,
          placeholder: "All sources",
        }),
        spec("stg", "Pipeline stage", "select", false, {
          options: [...boot.stages, ...boot.outcomes],
          placeholder: "All stages",
        }),
        spec("temp", "Temperature", "select", false, {
          options: ["Hot", "Warm", "Cold"],
          placeholder: "All temperatures",
        }),
        spec("priorityFilter", "Priority", "select", false, {
          options: ["Critical", "High", "Medium", "Low"],
          placeholder: "All priorities",
        }),
        spec("owner", "Lead owner", "select", false, {
          options: opts(boot.users),
          placeholder: "All owners",
        }),
      ];
      break;
    default:
      title = "Workspace action";
  }
  const contactKeys = [
    "alternate_mobile",
    "whatsapp_number",
    "district",
    "state",
    "pin",
    "occupation",
    "company",
  ];
  const requirementKeys = [
    "property_category",
    "property_type",
    "purpose",
    "min_budget",
    "preferred_location",
    "financing",
    "additional_requirements",
    "tags",
  ];
  const attributionKeys = [
    "sub_source",
    "campaign_id",
    "ad_set_name",
    "ad_set_id",
    "ad_name",
    "ad_id",
    "form_id",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "landing_page",
  ];
  if (["add-lead", "edit-lead"].includes(kind)) {
    extras.push(
      spec("_requirements", "Property qualification", "heading"),
      spec("property_category", "Category", "select", false, {
        placeholder: "Select category",
        options: ["Residential", "Commercial", "Both"],
      }),
      spec("property_type", "Property type", "select", false, {
        placeholder: "Select type",
        options: [
          "Apartment",
          "Studio",
          "Shop",
          "Office",
          "Plot",
          "Villa",
          "Other",
        ],
      }),
      spec("purpose", "Purchase purpose", "select", false, {
        placeholder: "Select purpose",
        options: ["Self-use", "Investment", "Rental income"],
      }),
      spec("min_budget", "Minimum budget (₹)", "number"),
      spec("preferred_location", "Preferred location"),
      spec("financing", "Financing", "select", false, {
        placeholder: "Not specified",
        options: ["Self-funded", "Financing required", "Undecided"],
      }),
      spec(
        "additional_requirements",
        "Additional requirements",
        "textarea",
        false,
        { full: true },
      ),
      spec("tags", "Tags", "text", false, {
        full: true,
        placeholder: "Comma-separated tags",
      }),
      spec("_contact", "Additional customer details", "heading"),
      spec("alternate_mobile", "Alternate mobile", "tel"),
      spec("whatsapp_number", "WhatsApp number", "tel"),
      spec("district", "District"),
      spec("state", "State"),
      spec("pin", "PIN code"),
      spec("occupation", "Occupation"),
      spec("company", "Company"),
    );
    if (kind === "add-lead")
      extras.push(
        spec("_attribution", "Campaign attribution", "heading"),
        ...attributionKeys.map((k) =>
          spec(
            k,
            {
              sub_source: "Sub source",
              campaign_id: "Campaign ID",
              ad_set_name: "Ad set name",
              ad_set_id: "Ad set ID",
              ad_name: "Ad name",
              ad_id: "Ad ID",
              form_id: "Lead form name / ID",
              utm_source: "UTM source",
              utm_medium: "UTM medium",
              utm_campaign: "UTM campaign",
              utm_content: "UTM content",
              landing_page: "Landing page",
            }[k],
          ),
        ),
      );
    const pick = (keys) =>
      Object.fromEntries(
        keys.filter((k) => d[k] != null && d[k] !== "").map((k) => [k, d[k]]),
      );
    body = {
      ...body,
      contact_details: pick(contactKeys),
      requirements: pick(requirementKeys),
      ...(kind === "add-lead" ? { attribution: pick(attributionKeys) } : {}),
    };
  }
  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (kind === "date-range") {
      if (
        d.from > d.to ||
        (new Date(d.to) - new Date(d.from)) / 86400000 > 366
      ) {
        setErr("Choose a valid date range of at most one year.");
        return;
      }
      obj.onSave({ period: "Custom range", from: d.from, to: d.to });
      close();
      return;
    }
    if (kind === "global-filters") {
      obj.onSave({
        source: d.src || "",
        stage: d.stg || "",
        owner: d.owner || "",
        campaign: d.campaign || "",
        team: d.team || "",
        branch: d.branch || "",
      });
      close();
      return;
    }
    if (kind === "lead-filters") {
      obj.onSave({
        project: d.project || "",
        source: d.src || "",
        stage: d.stg || "",
        temperature: d.temp || "",
        priority: d.priorityFilter || "",
        owner: d.owner || "",
      });
      close();
      return;
    }
    if (fields.some((f) => f.type === "lead") && !d.lead_id) {
      setErr("Select a customer from the matching leads.");
      return;
    }
    setBusy(true);
    try {
      const payload = { ...body };
      delete payload.lead;
      delete payload.unit;
      delete payload.defaults;
      if (payload.due_at && !payload.due_at.endsWith("Z"))
        payload.due_at += ":00Z";
      const r = await api(url, method, payload);
      refresh();
      toast(r.message || "Saved successfully.");
      if (kind === "messages") {
        open("whatsapp-link", {
          phone: r.phone || picked?.phone || lead?.phone,
          body: d.body,
        });
      } else {
        close();
        if (obj.onDone) obj.onDone(r);
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  const renderField = (f) => {
    if (f.type === "heading")
      return (
        <div className="form-section" key={f.key}>
          {f.label}
        </div>
      );
    if (f.type === "summary") {
      const un = unitState.data?.items?.find(
          (un) => un.id === Number(d.unit_id),
        ),
        base = un ? Math.round(un.area * un.rate) : 0,
        subtotal = base + (+d.charges || 0) - (+d.discount || 0);
      return (
        <div className="cost-preview" key={f.key}>
          <span>
            Base price <b>{money(base, true)}</b>
          </span>
          <span>
            Estimated total{" "}
            <strong>
              {money(
                Math.round(subtotal * (1 + (+d.tax_rate || 0) / 100)),
                true,
              )}
            </strong>
          </span>
          {+d.discount > 0 && (
            <small>Discounted quotations require manager approval.</small>
          )}
        </div>
      );
    }
    const val = d[f.key] ?? "";
    return (
      <Field
        key={f.key}
        label={f.label}
        required={f.required}
        full={f.full}
        hint={f.hint}
      >
        {f.type === "lead" ? (
          <LeadPicker
            value={val}
            initial={lead}
            project={obj.unit?.project_id}
            onChange={(id, l) => {
              setD((o) => ({
                ...o,
                lead_id: id,
                project_id: l?.project_id || o.project_id,
                unit_id: "",
                quotation_id: "",
              }));
              setPicked(l);
            }}
          />
        ) : f.type === "unit" ? (
          <div className="unit-chooser">
            <input
              placeholder="Filter units by number or type…"
              value={unitQ}
              onChange={(e) => setUnitQ(e.target.value)}
            />
            <select
              required
              value={val}
              onChange={(e) => set(f.key, e.target.value)}
            >
              <option value="">
                {d.lead_id ? "Select an available unit" : "Select a lead first"}
              </option>
              {selectOpts(
                (unitState.data?.items || []).map((un) => ({
                  value: un.id,
                  label: `${un.tower}-${un.number} · ${un.category} · ${fmtN(un.area)} sq. ft. · ${money(un.price)}`,
                })),
              )}
            </select>
          </div>
        ) : f.type === "multiselect" ? (
          <div className="checkbox-chips">
            {f.options.map((o) => (
              <label key={o.value}>
                <input
                  type="checkbox"
                  checked={val.includes(o.value)}
                  onChange={(e) =>
                    set(
                      f.key,
                      e.target.checked
                        ? [...val, o.value]
                        : val.filter((i) => i !== o.value),
                    )
                  }
                />
                {o.label}
              </label>
            ))}
          </div>
        ) : f.type === "select" ? (
          <select
            required={!!f.required}
            value={val}
            onChange={(e) => {
              set(f.key, e.target.value);
              if (f.key === "template") {
                const n = picked?.name || lead?.name || "there",
                  p = picked?.project || lead?.project || "our project";
                setD((a) => ({
                  ...a,
                  template: e.target.value,
                  body:
                    e.target.value === "Project introduction"
                      ? `Hello ${n}, thank you for your interest in ${p}. May I share the project details with you?`
                      : e.target.value === "Site visit confirmation"
                        ? `Hello ${n}, we look forward to welcoming you at ${p}. Please confirm your preferred visit time.`
                        : `Hello ${n}, following up on your enquiry about ${p}. Is there a convenient time to speak?`,
                }));
              }
            }}
          >
            {f.placeholder && <option value="">{f.placeholder}</option>}
            {selectOpts(f.options || [])}
          </select>
        ) : f.type === "textarea" ? (
          <textarea
            rows="3"
            required={!!f.required}
            value={val}
            placeholder={f.placeholder}
            maxLength={1500}
            onChange={(e) => set(f.key, e.target.value)}
          />
        ) : (
          <input
            type={f.type}
            required={!!f.required}
            value={val}
            placeholder={f.placeholder}
            min={f.min ?? (f.type === "number" ? 0 : undefined)}
            max={f.max}
            step={f.step}
            minLength={f.minLength}
            maxLength={f.type === "number" ? undefined : 300}
            onChange={(e) => set(f.key, e.target.value)}
          />
        )}
      </Field>
    );
  };
  return (
    <Modal
      title={title}
      sub={sub}
      icon={icon}
      onClose={close}
      wide={["add-lead", "edit-lead", "projects", "users"].includes(kind)}
    >
      <form onSubmit={submit}>
        <div className="modal-scroll">
          <div className="form-grid">
            {fields.map(renderField)}
            {extras.length > 0 && (
              <button
                type="button"
                className="additional-toggle"
                onClick={() => setMore(!more)}
              >
                <SlidersHorizontal size={14} />
                Additional qualification & consent
                <ChevronDown
                  size={14}
                  style={{ transform: more ? "rotate(180deg)" : "" }}
                />
              </button>
            )}
            {more && extras.map(renderField)}
          </div>
          {err && <ErrorBox error={err} />}
        </div>
        <div className="modal-footer">
          <Button type="button" onClick={close}>
            Cancel
          </Button>
          <Button
            kind="primary"
            type="submit"
            disabled={busy}
            icon={busy ? LoaderCircle : Check}
          >
            {busy ? "Saving…" : button}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function RecordModal({ type, row }) {
  const { close, open, allowed, refresh, toast } = useApp();
  const [pass, setPass] = useState(null),
    [visitorCode, setVisitorCode] = useState(""),
    [outcome, setOutcome] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reschedule, setReschedule] = useState(false),
    [due, setDue] = useState((row.due_at || timeInput()).slice(0, 16));
  const names = {
    tasks: "Follow-up details",
    calls: "Call details",
    visits: "Site visit details",
    meetings: "Field meeting",
    quotations: "Quotation & cost sheet",
    bookings: "Booking approval",
    messages: "Communication record",
    units: "Inventory unit",
    opportunities: "Sales opportunity",
  };
  const prefixes = {
    tasks: "TSK",
    calls: "CALL",
    visits: "SV",
    meetings: "OBM",
    quotations: "QT",
    bookings: "BK",
    units: "UNIT",
    messages: "MSG",
    opportunities: "OPP",
  };
  async function action(status) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await api("/" + type + "/" + row.id, "PATCH", {
        status,
        outcome,
        code: visitorCode,
        ...(reschedule ? { due_at: due + ":00Z" } : {}),
      });
      toast(r.message);
      refresh();
      close();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const item = (l, v) =>
    v != null &&
    v !== "" && (
      <div key={l}>
        <small>{l}</small>
        <strong>{v}</strong>
      </div>
    );
  const active = ![
    "Completed",
    "Cancelled",
    "Rejected",
    "Confirmed",
    "No Show",
  ].includes(row.status);
  const lead = {
    id: row.lead_id,
    name: row.customer,
    project: row.project,
    phone: row.phone,
    project_id: row.project_id,
  };
  const buttons = [];
  if (type === "tasks" && active) {
    buttons.push(
      ["Complete task", "Completed", true],
      ...(row.status === "Open" ? [["Start task", "In Progress"]] : []),
      ["Cancel task", "Cancelled"],
    );
  }
  if (
    type === "visits" &&
    !["Completed", "Cancelled", "No Show"].includes(row.status)
  )
    buttons.push(
      ...(row.status === "Checked in"
        ? [["Complete visit", "Completed", true]]
        : [
            ["Check in visitor", "Checked in", true],
            ...(row.status === "Scheduled"
              ? [["Confirm visit", "Confirmed"]]
              : []),
          ]),
      ["No show", "No Show"],
      ["Cancel visit", "Cancelled"],
    );
  if (type === "meetings" && !["Completed", "Cancelled"].includes(row.status))
    buttons.push(
      ["Complete meeting", "Completed", true],
      ...(row.status === "Scheduled" ? [["Confirm meeting", "Confirmed"]] : []),
      ["Cancel meeting", "Cancelled"],
    );
  if (type === "quotations") {
    if (row.status === "Pending approval" && allowed("approve"))
      buttons.push(["Approve quotation", "Approved", true]);
    if (row.status === "Approved") buttons.push(["Mark as sent", "Sent", true]);
  }
  if (
    type === "bookings" &&
    row.status === "Pending approval" &&
    allowed("approve")
  )
    buttons.push(
      ["Confirm & lock unit", "Confirmed", true],
      ["Reject request", "Rejected"],
    );
  return (
    <Modal
      title={names[type] || "Record details"}
      sub={
        code(prefixes[type], row.id) +
        " · " +
        (row.project || "Sales workspace")
      }
      icon={
        type === "quotations"
          ? FileText
          : type === "tasks"
            ? ClipboardList
            : type === "units"
              ? Layers3
              : CalendarCheck2
      }
      onClose={close}
    >
      <div className="modal-scroll record-detail">
        <div className="record-lead">
          <div>
            <span className="eyebrow">
              {type === "units"
                ? "UNIT"
                : type === "tasks"
                  ? "ACTIVITY"
                  : "CUSTOMER"}
            </span>
            <h2>
              {row.subject ||
                row.title ||
                (type === "units"
                  ? row.tower + "-" + row.number
                  : row.customer)}
            </h2>
          </div>
          <Badge>{row.status || row.outcome || row.stage}</Badge>
        </div>
        <div className="detail-facts">
          {item("Project", row.project)}
          {item("Assigned to", row.owner || "Workspace team")}
          {row.due_at && item("Scheduled for", stamp(row.due_at))}
          {item("Type", row.type || row.category)}
          {item("Priority", row.priority)}
          {item("Meeting point", row.location)}
          {item("Meeting purpose", row.purpose)}
          {item("Visitor count", row.visitors)}
          {item("Direction", row.direction)}
          {row.duration != null &&
            item(
              "Talk time",
              `${Math.floor(row.duration / 60)}m ${row.duration % 60}s`,
            )}
          {item("Disposition", row.disposition)}
          {item("Unit", row.unit_number && row.tower + "-" + row.unit_number)}
          {row.area && item("Saleable area", fmtN(row.area) + " sq. ft.")}
          {row.rate && item("Rate per sq. ft.", money(row.rate, true))}
          {row.price && item("Base price", money(row.price, true))}
          {row.value && item("Deal value", money(row.value, true))}
          {row.valid_until && item("Valid until", fmtDate(row.valid_until))}
          {row.version &&
            item(
              "Revision",
              "Version " +
                row.version +
                (row.parent_id
                  ? " · Replaces " + code("QT", row.parent_id)
                  : ""),
            )}
          {row.hold_until && item("Hold expiry", stamp(row.hold_until))}
          {row.check_in && item("Checked in", stamp(row.check_in))}
          {row.check_out && item("Checked out", stamp(row.check_out))}
          {item(
            "Probability",
            row.probability != null ? row.probability + "%" : null,
          )}
          {item("Next step", row.next_step)}
        </div>
        {row.notes && (
          <div className="note-block">
            <b>Notes</b>
            <p>{row.notes}</p>
          </div>
        )}
        {(row.feedback ||
          (row.outcome && type !== "calls") ||
          row.body ||
          row.reason) && (
          <div className="note-block">
            <b>
              {type === "messages" ? "Prepared message" : "Outcome / remarks"}
            </b>
            <p>{row.feedback || row.outcome || row.body || row.reason}</p>
          </div>
        )}
        {type === "quotations" && (
          <div className="cost-sheet">
            {[
              ["Base price", row.base],
              ["Additional charges", row.charges],
              ["Discount", -row.discount],
              ["Tax (" + row.tax_rate + "%)", row.tax],
              ["Total quotation", row.total],
            ].map(([k, v]) => (
              <div key={k}>
                <span>{k}</span>
                <b>{money(v, true)}</b>
              </div>
            ))}
          </div>
        )}
        {row.recording && (
          <a
            className="text-link"
            href={row.recording}
            target="_blank"
            rel="noreferrer"
          >
            Open call recording <ArrowUpRight size={14} />
          </a>
        )}
        {row.lead_id && allowed("readLeads") && (
          <button
            className="text-link record-link"
            onClick={() => {
              close();
              navigate("leads/" + row.lead_id);
            }}
          >
            Open lead profile <ArrowRight size={14} />
          </button>
        )}
        {type === "visits" &&
          ["Scheduled", "Confirmed", "Rescheduled"].includes(row.status) && (
            <div className="pass-box">
              <h3>Visitor check-in</h3>
              <p>
                Issue a one-time pass and share it with the visitor through an
                authorized channel. Ask for the code at reception.
              </p>
              {pass && (
                <>
                  <strong>{pass.code}</strong>
                  <p>
                    Valid through {stamp(pass.expires_at)}. No message has been
                    sent automatically.
                  </p>
                </>
              )}
              <Button
                icon={ShieldCheck}
                onClick={async () => {
                  try {
                    setPass(
                      await api("/visits/" + row.id + "/pass", "POST", {}),
                    );
                    refresh();
                    setError("");
                  } catch (e) {
                    setError(e.message);
                  }
                }}
              >
                {pass ? "Replace pass" : "Issue visitor pass"}
              </Button>
              <Field label="Visitor’s six-digit code">
                <input
                  inputMode="numeric"
                  maxLength={6}
                  value={visitorCode}
                  placeholder="Enter the code at check-in"
                  onChange={(e) => setVisitorCode(e.target.value)}
                />
              </Field>
            </div>
          )}
        {buttons.length > 0 &&
          ["tasks", "visits", "meetings", "bookings"].includes(type) && (
            <Field
              label={
                type === "visits"
                  ? "Visit feedback / next step"
                  : "Outcome / remarks"
              }
              full
            >
              <textarea
                rows="3"
                placeholder="Record what happened and the next action…"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
              />
            </Field>
          )}
        {["visits", "meetings", "tasks"].includes(type) &&
          buttons.length > 0 && (
            <div className="reschedule">
              <button
                className="text-link"
                onClick={() => setReschedule(!reschedule)}
              >
                <CalendarDays size={13} />
                Reschedule
              </button>
              {reschedule && (
                <div>
                  <input
                    aria-label="Reschedule date and time"
                    type="datetime-local"
                    value={due}
                    onChange={(e) => setDue(e.target.value)}
                  />
                  <Button
                    onClick={() =>
                      action(type === "tasks" ? "Open" : "Rescheduled")
                    }
                    disabled={busy}
                  >
                    Save time
                  </Button>
                </div>
              )}
            </div>
          )}
        {error && <ErrorBox error={error} />}
      </div>
      <div className="modal-footer wrap">
        {type === "units" && (
          <>
            {row.status === "Available" && (
              <Button
                kind="primary"
                onClick={() => open("hold", { unit: row })}
              >
                Hold unit
              </Button>
            )}
            {row.status === "On Hold" && (
              <Button onClick={() => open("release", { unit: row })}>
                Release hold
              </Button>
            )}
            {allowed("pricing") &&
              ["Available", "On Hold"].includes(row.status) && (
                <Button onClick={() => open("price", { unit: row })}>
                  Edit price
                </Button>
              )}
          </>
        )}
        {type === "opportunities" && (
          <Button
            kind="primary"
            icon={NotebookPen}
            onClick={() =>
              open("opportunities", {
                lead,
                edit: row.id,
                defaults: { ...row, outcome: "" },
              })
            }
          >
            Edit opportunity
          </Button>
        )}
        {type === "quotations" && (
          <>
            {row.status !== "Superseded" && (
              <Button
                onClick={() =>
                  open("quotations", {
                    lead,
                    defaults: {
                      parent_id: row.id,
                      unit_id: row.unit_id,
                      charges: row.charges,
                      discount: row.discount,
                      tax_rate: row.tax_rate,
                    },
                  })
                }
              >
                Revise
              </Button>
            )}
            <Button icon={Printer} onClick={() => window.print()}>
              Print / PDF
            </Button>
            {["Approved", "Sent"].includes(row.status) && (
              <Button
                onClick={() =>
                  open("bookings", { lead, defaults: { quotation_id: row.id } })
                }
              >
                Request booking
              </Button>
            )}
          </>
        )}
        {buttons.map(([text, status, primary]) => (
          <Button
            key={status}
            kind={primary ? "primary" : ""}
            disabled={busy}
            onClick={() => action(status)}
          >
            {text}
          </Button>
        ))}
        {!buttons.length && type !== "units" && type !== "quotations" && (
          <Button onClick={close}>Close</Button>
        )}
      </div>
    </Modal>
  );
}

export function ImportModal() {
  const { boot, close, toast, refresh } = useApp();
  const [file, setFile] = useState(""),
    [rows, setRows] = useState([]),
    [map, setMap] = useState({}),
    [pid, setPid] = useState(boot.projects[0]?.id || ""),
    [source, setSource] = useState("Import"),
    [err, setErr] = useState(""),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState(null),
    [review, setReview] = useState(null);
  useEffect(() => {
    setReview(null);
  }, [map, pid, source, file]);
  useEffect(() => {
    if (result?.status !== "Processing") return;
    let live = true;
    const timer = setInterval(
      () =>
        api("/imports/" + result.id)
          .then((r) => {
            if (!live) return;
            setResult(r);
            if (r.status !== "Processing") {
              refresh();
              toast(
                r.status === "Completed"
                  ? "Import completed."
                  : "Import requires review.",
              );
            }
          })
          .catch((e) => live && setErr(e.message)),
      1200,
    );
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [result?.id, result?.status]);
  const headers = Object.keys(rows[0] || {});
  async function read(f) {
    if (!f) return;
    setErr("");
    setBusy(true);
    try {
      if (f.size > 8e6) throw Error("Choose a workbook under 8 MB.");
      const x = await import("xlsx"),
        book = x.read(await f.arrayBuffer(), {
          type: "array",
          sheetRows: 5002,
        }),
        data = x.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], {
          defval: "",
          raw: false,
        });
      if (!data.length || data.length > 5000)
        throw Error(
          "The first sheet must contain 1–5,000 data rows and a header row.",
        );
      const keys = Object.keys(data[0]),
        m = {};
      Object.entries({
        name: /name|customer/i,
        phone: /phone|mobile|contact number/i,
        email: /email/i,
        city: /city/i,
        source: /source/i,
        project: /project/i,
        owner: /owner|assigned employee/i,
      }).forEach(([k, re]) => (m[k] = keys.find((h) => re.test(h)) || ""));
      setMap(m);
      setRows(data);
      setFile(f.name);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  const mapped = rows.map((r) => {
    const p = map.project
      ? boot.projects.find(
          (p) =>
            p.name.toLowerCase() === String(r[map.project]).toLowerCase() ||
            p.id === Number(r[map.project]),
        )
      : null;
    const owner =
      map.owner && r[map.owner]
        ? boot.users.find(
            (u) => u.name.toLowerCase() === String(r[map.owner]).toLowerCase(),
          )
        : null;
    return {
      name: r[map.name] || "",
      phone: String(r[map.phone] || ""),
      email: r[map.email] || "",
      city: r[map.city] || "",
      source: r[map.source] || source,
      project_id: map.project && r[map.project] ? p?.id || -1 : pid,
      owner_id: map.owner && r[map.owner] ? owner?.id || -1 : undefined,
      attribution: {
        original_project: r[map.project],
        original_owner: r[map.owner],
      },
    };
  });
  async function submit() {
    setBusy(true);
    setErr("");
    try {
      if (!review) {
        setReview(await api("/imports/preview", "POST", { rows: mapped }));
        return;
      }
      const r = await api("/imports", "POST", { filename: file, rows: mapped });
      setResult(r);
      refresh();
      toast(
        r.status === "Processing"
          ? "Import queued in the background."
          : "Import batch processed.",
      );
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Import leads"
      icon={FileSpreadsheet}
      sub="Map your Excel or CSV fields and review before importing."
      onClose={close}
      wide
    >
      <div className="modal-scroll">
        {result ? (
          <div className="import-result">
            {result.status === "Processing" ? (
              <LoaderCircle size={36} className="spin" />
            ) : (
              <CheckCircle2 size={36} />
            )}
            <h2>
              {result.status === "Processing"
                ? "Processing in background"
                : result.status === "Needs review"
                  ? "Import needs review"
                  : "Import completed"}
            </h2>
            <p>
              Batch {code("IMP", result.id)} ·{" "}
              {result.status === "Processing"
                ? `${result.processed || 0} of ${result.total} rows processed`
                : `${result.total} rows reconciled`}
            </p>
            {result.status === "Processing" && (
              <p className="fine-print">
                You can close this window. Track this batch in Settings → Import
                history.
              </p>
            )}
            <div className="mini-stats">
              {[
                ["New leads", result.imported],
                ["Linked enquiries", result.linked],
                ["Flagged rows", result.failures.length],
              ].map(([k, v]) => (
                <div key={k}>
                  <b>{v}</b>
                  <small>{k}</small>
                </div>
              ))}
            </div>
            {result.failures.length > 0 && (
              <Button
                icon={Download}
                onClick={() =>
                  download(
                    "import-issues.csv",
                    csv([
                      ["Row", "Reason", "Original phone"],
                      ...result.failures.map((f) => [
                        f.row,
                        f.reason,
                        f.original.phone,
                      ]),
                    ]),
                  )
                }
              >
                Download flagged rows
              </Button>
            )}
          </div>
        ) : (
          <>
            {!rows.length ? (
              <>
                <label
                  className="upload-area"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    read(e.dataTransfer.files[0]);
                  }}
                >
                  <Upload size={27} />
                  <b>Choose a file or drag it here</b>
                  <small>Excel (.xlsx, .xls) or CSV · Up to 5,000 rows</small>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => read(e.target.files[0])}
                  />
                </label>
                <button
                  className="text-link"
                  onClick={() =>
                    download(
                      "bull-realty-lead-template.csv",
                      csv([
                        [
                          "Customer name",
                          "Mobile",
                          "Email",
                          "City",
                          "Project",
                          "Source",
                          "Owner",
                        ],
                      ]),
                    )
                  }
                >
                  <Download size={14} />
                  Download import template
                </button>
              </>
            ) : (
              <>
                <div className="import-file">
                  <FileSpreadsheet size={19} />
                  <span>
                    <b>{file}</b>
                    <small>{fmtN(rows.length)} rows · First worksheet</small>
                  </span>
                  <button onClick={() => setRows([])}>Change file</button>
                </div>
                <div className="form-section">Column mapping</div>
                <div className="form-grid">
                  {[
                    ["name", "Customer name"],
                    ["phone", "Mobile number"],
                    ["email", "Email"],
                    ["city", "City"],
                    ["project", "Project"],
                    ["source", "Source"],
                    ["owner", "Owner"],
                  ].map(([key, label]) => (
                    <Field
                      key={key}
                      label={label}
                      required={["name", "phone"].includes(key)}
                    >
                      <select
                        value={map[key] || ""}
                        onChange={(e) =>
                          setMap({ ...map, [key]: e.target.value })
                        }
                      >
                        <option value="">Not mapped</option>
                        {selectOpts(headers)}
                      </select>
                    </Field>
                  ))}
                  <Field label="Default project" required>
                    <select
                      value={pid}
                      onChange={(e) => setPid(e.target.value)}
                    >
                      {selectOpts(opts(boot.projects))}
                    </select>
                  </Field>
                  <Field label="Default source">
                    <select
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                    >
                      {selectOpts(boot.sources)}
                    </select>
                  </Field>
                </div>
                <div className="form-section">
                  Preview · first {Math.min(3, rows.length)} rows
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Mobile</th>
                        <th>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mapped.slice(0, 3).map((r, i) => (
                        <tr key={i}>
                          <td>{r.name || "Missing name"}</td>
                          <td>{r.phone || "Missing mobile"}</td>
                          <td>{r.source}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="fine-print">
                  Existing phones are matched to one customer. Invalid numbers
                  and unknown project or owner mappings are flagged, not
                  silently dropped.
                </p>
                {review && (
                  <div className="cost-preview">
                    <b>Validation complete</b>
                    <span>
                      New enquiries <strong>{review.imported}</strong>
                    </span>
                    <span>
                      Repeat enquiries to link <b>{review.linked}</b>
                    </span>
                    <span>
                      Rows flagged for review <b>{review.invalid}</b>
                    </span>
                    <small>
                      Final results are revalidated when the import runs.
                    </small>
                  </div>
                )}
              </>
            )}
          </>
        )}
        {err && <ErrorBox error={err} />}
      </div>
      <div className="modal-footer">
        <Button onClick={close}>{result ? "Close" : "Cancel"}</Button>
        {!result && rows.length > 0 && (
          <Button
            kind="primary"
            icon={Upload}
            disabled={busy || !map.name || !map.phone}
            onClick={submit}
          >
            {busy
              ? "Processing…"
              : review
                ? `Import ${fmtN(rows.length)} rows`
                : "Validate & review"}
          </Button>
        )}
      </div>
    </Modal>
  );
}

export function ModalHost({ modal }) {
  const { close, boot, allowed, toast, refresh, logout, switchUser } = useApp();
  if (!modal) return null;
  const { kind, obj } = modal;
  if (kind === "import") return <ImportModal />;
  if (kind === "task-detail") return <RecordModal type="tasks" row={obj} />;
  if (kind === "record") return <RecordModal type={obj.type} row={obj.row} />;
  if (kind === "profile")
    return (
      <Modal
        title="Your workspace"
        sub="Account & workspace access"
        icon={ShieldCheck}
        onClose={close}
      >
        <div className="modal-scroll">
          <div className="profile-intro">
            <Avatar name={boot.user.name} size={52} />
            <div>
              <h2>{boot.user.name}</h2>
              <p>{boot.user.email}</p>
              <Badge color="blue">{boot.user.role}</Badge>
            </div>
          </div>
          {boot.demo && (
            <>
              <div className="form-section">Preview a demo role</div>
              <p className="fine-print">
                Switch roles to see project access and record-level permissions.
                Available only in this sample workspace.
              </p>
              <div className="role-list">
                {(boot.demoUsers || boot.users)
                  .filter((u) => u.active && u.id !== boot.user.id)
                  .map((u) => (
                    <button key={u.id} onClick={() => switchUser(u.id)}>
                      <Avatar name={u.name} />
                      <span>
                        <b>{u.name}</b>
                        <small>{u.role}</small>
                      </span>
                      <ChevronRightIcon />
                    </button>
                  ))}
              </div>
            </>
          )}
        </div>
        <div className="modal-footer">
          <Button icon={LogOut} onClick={logout}>
            Sign out
          </Button>
        </div>
      </Modal>
    );
  if (kind === "whatsapp-link")
    return (
      <Modal title="Your message is ready" icon={MessageCircle} onClose={close}>
        <div className="modal-scroll">
          <p className="note-block">{obj.body}</p>
          <p className="fine-print">
            Continue in WhatsApp to send it. This workspace has logged the
            prepared chat, not a delivery confirmation.
          </p>
        </div>
        <div className="modal-footer">
          <a
            className="btn primary"
            href={
              "https://wa.me/" +
              String(obj.phone).replace(/\D/g, "") +
              "?text=" +
              encodeURIComponent(obj.body)
            }
            target="_blank"
            rel="noreferrer"
            onClick={close}
          >
            Open WhatsApp <ArrowUpRight size={14} />
          </a>
        </div>
      </Modal>
    );
  if (kind === "confirm") return <ConfirmModal obj={obj} />;
  return (
    <FormModal key={kind + ":" + (obj.lead?.id || "")} kind={kind} obj={obj} />
  );
}
const ChevronRightIcon = () => <ArrowRight size={14} />;
function ConfirmModal({ obj }) {
  const { close, refresh, toast } = useApp(),
    [err, setErr] = useState(""),
    [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const r = await obj.action();
      refresh();
      toast(r?.message || "Updated.");
      close();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={obj.title} icon={ShieldCheck} onClose={close}>
      <div className="modal-scroll">
        <p className="confirm-text">{obj.text}</p>
        {err && <ErrorBox error={err} />}
      </div>
      <div className="modal-footer">
        <Button onClick={close}>Cancel</Button>
        <Button kind="primary" disabled={busy} onClick={run}>
          {obj.button || "Confirm"}
        </Button>
      </div>
    </Modal>
  );
}
