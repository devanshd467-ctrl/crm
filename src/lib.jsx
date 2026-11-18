import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ChevronDown,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Inbox,
  LoaderCircle,
  CalendarDays,
  Building2,
  SlidersHorizontal,
  AlertCircle,
} from "lucide-react";
export const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);
export const qs = (o) => {
  const p = new URLSearchParams();
  Object.entries(o || {}).forEach(([k, v]) => {
    if (v !== "" && v != null && v !== false) p.set(k, v);
  });
  const s = p.toString();
  return s ? "?" + s : "";
};
export async function api(url, method = "GET", data) {
  const t = sessionStorage.getItem("brg.session");
  const r = await fetch("/api" + url, {
    method,
    headers: {
      ...(t ? { Authorization: "Bearer " + t } : {}),
      ...(data ? { "Content-Type": "application/json" } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  let result;
  try {
    result = await r.json();
  } catch {
    throw Error("The workspace is temporarily unavailable. Please try again.");
  }
  if (!r.ok) {
    if (r.status === 401 && !url.startsWith("/auth/"))
      window.dispatchEvent(new Event("brg:expired"));
    throw Error(result.error || "Unable to complete this action.");
  }
  return result;
}
export function useLoad(url) {
  const { revision = 0 } = useApp() || {};
  const [s, set] = useState({ data: null, loading: true, error: "" });
  const [retry, r] = useState(0);
  useEffect(() => {
    let alive = true;
    if (!url) {
      set({ data: null, error: "", loading: false });
      return;
    }
    set((p) => ({ ...p, loading: true, error: "" }));
    api(url)
      .then((data) => alive && set({ data, error: "", loading: false }))
      .catch(
        (e) => alive && set({ data: null, error: e.message, loading: false }),
      );
    return () => {
      alive = false;
    };
  }, [url, revision, retry]);
  return { ...s, reload: () => r((x) => x + 1) };
}
export function useDebounce(v, n = 180) {
  const [r, set] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => set(v), n);
    return () => clearTimeout(t);
  }, [v, n]);
  return r;
}
export function navigate(page, query = {}) {
  location.hash = "/" + page.replace(/^\//, "") + qs(query);
}
export function route() {
  const [p, q] = location.hash.replace(/^#\/?/, "").split("?"),
    parts = (p || "dashboard").split("/");
  return {
    page: parts[0],
    id: parts[1],
    query: Object.fromEntries(new URLSearchParams(q || "")),
  };
}
export const fmtN = (n) =>
  new Intl.NumberFormat("en-IN").format(Number(n) || 0);
export const money = (n, full = false) => {
  n = Number(n || 0);
  if (full) return "₹" + fmtN(Math.round(n));
  if (n >= 1e7)
    return (
      "₹" +
      (n / 1e7).toLocaleString("en-IN", { maximumFractionDigits: 2 }) +
      " Cr"
    );
  if (n >= 1e5)
    return (
      "₹" +
      (n / 1e5).toLocaleString("en-IN", { maximumFractionDigits: 2 }) +
      " L"
    );
  return "₹" + fmtN(n);
};
export const fmtDate = (
  d,
  opt = { day: "numeric", month: "short", year: "numeric" },
) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", { ...opt, timeZone: "UTC" })
    : "—";
export const fmtTime = (d) =>
  d
    ? new Date(d).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: "UTC",
      })
    : "—";
export const stamp = (d) =>
  fmtDate(d, { day: "numeric", month: "short" }) + " · " + fmtTime(d);
export const initials = (s = "") =>
  s
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((v) => v[0])
    .join("")
    .toUpperCase();
export const code = (p, id) => p + "-" + String(id).padStart(4, "0");
export function download(name, text, type = "text/csv;charset=utf-8") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
export function csv(rows) {
  const safe = (v) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return "\uFEFF" + rows.map((r) => r.map(safe).join(",")).join("\r\n");
}
export const colorFor = (value = "") => {
  if (
    [
      "Confirmed",
      "Booked / Won",
      "Completed",
      "Active",
      "Available",
      "Approved",
      "Connected",
      "Sent",
    ].includes(value)
  )
    return "green";
  if (
    [
      "Hot",
      "Critical",
      "Lost",
      "Overdue",
      "Cancelled",
      "Rejected",
      "Not Interested",
      "Inactive",
      "No Show",
    ].includes(value)
  )
    return "red";
  if (
    [
      "Warm",
      "High",
      "Pending approval",
      "On Hold",
      "Negotiation",
      "In Progress",
      "Rescheduled",
    ].includes(value)
  )
    return "amber";
  if (
    [
      "Qualified",
      "Quotation Sent",
      "Commercial",
      "Meeting",
      "Scheduled",
      "Checked in",
    ].includes(value)
  )
    return "purple";
  if (
    [
      "New",
      "Interested",
      "Residential",
      "Open",
      "Visit Scheduled",
      "Booked",
      "Planned",
    ].includes(value)
  )
    return "blue";
  return "slate";
};
export function Badge({ children, color, dot = false }) {
  return (
    <span className={"badge " + (color || colorFor(children))}>
      {dot && <i />}
      {children}
    </span>
  );
}
export function Avatar({ name, size = 32, color }) {
  const n = [...(name || "A")].reduce((a, s) => a + s.charCodeAt(0), 0);
  return (
    <span
      aria-hidden
      className={
        "avatar " +
        (color || ["lavender", "sky", "rose", "sand", "mint"][n % 5])
      }
      style={{ width: size, height: size, fontSize: size * 0.33 }}
    >
      {initials(name)}
    </span>
  );
}
export function Button({
  children,
  icon: Icon,
  kind = "",
  className = "",
  ...props
}) {
  return (
    <button className={"btn " + kind + " " + className} {...props}>
      {Icon && <Icon size={15} strokeWidth={1.8} />} {children}
    </button>
  );
}
export function IconButton({ icon: Icon, label, size = 16, ...props }) {
  return (
    <button className="icon-btn" aria-label={label} title={label} {...props}>
      <Icon size={size} strokeWidth={1.75} />
    </button>
  );
}
export function Select({
  value,
  onChange,
  options,
  icon: Icon,
  label,
  small = false,
  className = "",
  placeholder,
}) {
  const normalized = options.map((o) =>
    typeof o === "object" ? o : { value: o, label: o },
  );
  return (
    <label className={"select-wrap " + (small ? "small " : "") + className}>
      {Icon && <Icon size={14} strokeWidth={1.75} />}
      <select
        aria-label={label || placeholder || "Select an option"}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {normalized.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={13} />
    </label>
  );
}
export function FilterBar({ f, set, dates = true, projects = true }) {
  const { boot, open } = useApp();
  return (
    <div className="inline-filters">
      {projects && (
        <Select
          label="Filter by project"
          icon={Building2}
          value={f.project || ""}
          options={[
            { value: "", label: "All projects" },
            ...boot.projects.map((p) => ({ value: p.id, label: p.name })),
          ]}
          onChange={(v) => set({ ...f, project: v })}
        />
      )}{" "}
      {dates && (
        <Select
          label="Date range"
          icon={CalendarDays}
          value={f.period || "This month"}
          onChange={(v) =>
            v === "Custom range"
              ? open("date-range", {
                  f,
                  onSave: (val) => set({ ...f, ...val }),
                })
              : set({ ...f, period: v, from: "", to: "" })
          }
          options={[
            "Today",
            "Yesterday",
            "Last 7 days",
            "This month",
            "Last month",
            "Custom range",
          ]}
        />
      )}
      <button
        className={
          "extra-filter " +
          (["source", "campaign", "stage", "owner", "team", "branch"].some(
            (k) => f[k],
          )
            ? "applied"
            : "")
        }
        aria-label="More dashboard filters"
        title="Source, campaign, stage and team filters"
        onClick={() =>
          open("global-filters", {
            defaults: {
              src: f.source || "",
              stg: f.stage || "",
              owner: f.owner || "",
              campaign: f.campaign || "",
              team: f.team || "",
              branch: f.branch || "",
            },
            onSave: (v) => set({ ...f, ...v }),
          })
        }
      >
        <SlidersHorizontal size={14} />
      </button>
    </div>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder = "Search records…",
}) {
  return (
    <label className="search-box">
      <Search size={16} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button aria-label="Clear search" onClick={() => onChange("")}>
          <X size={13} />
        </button>
      )}
    </label>
  );
}
export function Pager({ page, set, total, size = 15 }) {
  const last = Math.max(1, Math.ceil(total / size));
  return (
    <div className="pager">
      <span>
        {total
          ? `${fmtN((page - 1) * size + 1)}–${fmtN(Math.min(total, page * size))} of ${fmtN(total)} records`
          : "0 records"}
      </span>
      <div>
        <button
          disabled={page <= 1}
          aria-label="Previous page"
          onClick={() => set(page - 1)}
        >
          <ChevronLeft size={15} />
        </button>
        <b>{page}</b>
        <span>of {last}</span>
        <button
          disabled={page >= last}
          aria-label="Next page"
          onClick={() => set(page + 1)}
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
export function Empty({
  title = "No records found",
  text = "Try changing your filters or add a new record.",
  icon: Icon = Inbox,
  children,
}) {
  return (
    <div className="empty">
      <span>
        <Icon size={23} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading">
      <LoaderCircle size={19} className="spin" />
      Loading workspace…
    </div>
  );
}
export function ErrorBox({ error, retry }) {
  return (
    <div className="error-box">
      <AlertCircle size={16} />
      <span>{error}</span>
      {retry && <button onClick={retry}>Try again</button>}
    </div>
  );
}
export function DataState({ state, children }) {
  return state.error ? (
    <ErrorBox error={state.error} retry={state.reload} />
  ) : !state.data ? (
    <Loading />
  ) : (
    children(state.data)
  );
}
export function PageHead({ eyebrow, title, sub, children }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow blue-text">{eyebrow}</div>}
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      <div className="head-actions">{children}</div>
    </div>
  );
}
export function Modal({
  title,
  sub,
  icon: Icon,
  children,
  onClose,
  wide = false,
}) {
  const ref = useRef(null);
  useEffect(() => {
    const old = document.activeElement,
      t = setTimeout(
        () =>
          (
            ref.current?.querySelector(
              "input:not([type=checkbox]):not([type=file]),select,textarea",
            ) || ref.current?.querySelector("button")
          )?.focus(),
        35,
      );
    const key = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const fs = [
          ...ref.current.querySelectorAll(
            "button:not([disabled]),input:not([disabled]),textarea,select,a[href]",
          ),
        ].filter((e) => e.offsetParent !== null);
        if (!fs.length) return;
        if (e.shiftKey && document.activeElement === fs[0]) {
          e.preventDefault();
          fs.at(-1).focus();
        } else if (!e.shiftKey && document.activeElement === fs.at(-1)) {
          e.preventDefault();
          fs[0].focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      old?.focus?.();
    };
  }, []);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        ref={ref}
        className={"modal " + (wide ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head">
          <div className="modal-title">
            {Icon && (
              <span className="modal-icon">
                <Icon size={20} />
              </span>
            )}
            <div>
              <h2>{title}</h2>
              {sub && <p>{sub}</p>}
            </div>
          </div>
          <IconButton icon={X} label="Close dialog" onClick={onClose} />
        </div>
        {children}
      </section>
    </div>
  );
}
export function Tabs({ items, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((v) => (
        <button
          role="tab"
          aria-selected={value === v}
          key={v}
          onClick={() => onChange(v)}
          className={value === v ? "active" : ""}
        >
          {v}
        </button>
      ))}
    </div>
  );
}
export function Field({ label, required, children, full, hint }) {
  const control =
    React.isValidElement(children) &&
    ["input", "textarea", "select"].includes(children.type)
      ? React.cloneElement(children, { "aria-label": label })
      : children;
  return (
    <label className={"field " + (full ? "full" : "")}>
      <span>
        {label}
        {required && <em> *</em>}
      </span>
      {control}
      {hint && <small>{hint}</small>}
    </label>
  );
}
