import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  UsersRound,
  Phone,
  CalendarClock,
  MessagesSquare,
  MapPin,
  Building2,
  Grid2X2,
  FileText,
  BookmarkCheck,
  Megaphone,
  ChartNoAxesCombined,
  ChartColumnIncreasing,
  Settings,
  PanelLeft,
  Search,
  Bell,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  MessageCircle,
  Handshake,
  UserRoundCheck,
  History,
  ArrowUpRight,
  ArrowRight,
  LogIn,
  LockKeyhole,
  CheckCircle2,
  AlertCircle,
  CheckCheck,
  ClipboardList,
  SquareKanban,
} from "lucide-react";
import {
  Ctx,
  useApp,
  useLoad,
  useDebounce,
  api,
  qs,
  route,
  navigate,
  Avatar,
  Button,
  IconButton,
  Loading,
  ErrorBox,
  Empty,
  Modal,
  Field,
  code,
} from "./lib";
import Dashboard from "./dashboard";
import { Leads, LeadDetail, Pipeline } from "./leads";
import {
  Records,
  Projects,
  Inventory,
  Directory,
  Reports,
  Logs,
  Notifications,
  Settings as SettingsPage,
} from "./pages";
import { ModalHost } from "./forms";
import "./styles.css";
const INFO = {
  dashboard: ["Dashboard", LayoutDashboard],
  "my-work": ["My work", ClipboardList, "activity"],
  leads: ["Lead management", UsersRound, "readLeads"],
  pipeline: ["Sales pipeline", SquareKanban, "readLeads"],
  assignment: ["Lead assignment", UserRoundCheck, "assign"],
  tasks: ["Follow-ups", CalendarClock, "activity"],
  calls: ["Call management", Phone, "activity"],
  messages: ["WhatsApp", MessageCircle, "activity"],
  visits: ["Site visits", MapPin, "visits"],
  meetings: ["Field meetings", Handshake, "activity"],
  projects: ["Projects", Building2],
  inventory: ["Inventory", Grid2X2, "inventory"],
  quotations: ["Quotations", FileText, "quote"],
  bookings: ["Bookings", BookmarkCheck, "quote"],
  partners: ["Channel partners", Handshake, "partners"],
  campaigns: ["Campaigns", Megaphone, "marketing"],
  team: ["Team performance", ChartColumnIncreasing, "team"],
  reports: ["Reports & analytics", ChartNoAxesCombined, "reports"],
  notifications: ["Notifications", Bell],
  users: ["User management", UsersRound, "manageUsers"],
  activity: ["Activity log", History, "audit"],
  settings: ["Settings", Settings, "settings"],
};
function Logo() {
  return (
    <span className="brand">
      <img src="/bull.svg" alt="" />
      <span>
        <b>BULL REALTY</b>
        <small>
          <i />
          GLOBAL
          <i />
        </small>
      </span>
    </span>
  );
}
function App() {
  const [boot, setBoot] = useState(null),
    [config, setConfig] = useState({ demo: false }),
    [auth, setAuth] = useState("loading"),
    [err, setErr] = useState(""),
    [revision, rev] = useState(0),
    [r, setRoute] = useState(route()),
    [modal, setModal] = useState(null),
    [search, setSearch] = useState(false),
    [notifs, setNotifs] = useState(false),
    [collapsed, setCollapsed] = useState(false),
    [mobile, setMobile] = useState(false),
    [toastState, setToast] = useState(null);
  const timer = useRef(null),
    h = useRef(null);
  const toast = useCallback((text, type = "success") => {
    clearTimeout(timer.current);
    setToast({ text, type });
    timer.current = setTimeout(() => setToast(null), 3800);
  }, []);
  const close = useCallback(() => setModal(null), []);
  const open = useCallback((kind, obj = {}) => {
    setModal({ kind, obj });
    setSearch(false);
    setNotifs(false);
  }, []);
  const refresh = useCallback(() => {
    rev((x) => x + 1);
    api("/bootstrap")
      .then(setBoot)
      .catch((e) => toast(e.message, "error"));
  }, []);
  async function init() {
    setAuth("loading");
    setErr("");
    try {
      const c = await api("/config");
      setConfig(c);
      if (
        !sessionStorage.getItem("brg.session") &&
        c.demo &&
        !sessionStorage.getItem("brg.signedout")
      ) {
        const s = await api("/auth/demo", "POST", {});
        sessionStorage.setItem("brg.session", s.token);
      }
      if (!sessionStorage.getItem("brg.session")) {
        setAuth("login");
        return;
      }
      let b;
      try {
        b = await api("/bootstrap");
      } catch (e) {
        // Renew an expired sample session only. Private workspaces must sign in again.
        if (
          !c.demo ||
          sessionStorage.getItem("brg.signedout") ||
          sessionStorage.getItem("brg.session")
        )
          throw e;
        const next = await api("/auth/demo", "POST", {});
        sessionStorage.setItem("brg.session", next.token);
        b = await api("/bootstrap");
      }
      setBoot(b);
      setAuth("ready");
    } catch (e) {
      setErr(e.message);
      setAuth(sessionStorage.getItem("brg.session") ? "error" : "login");
    }
  }
  useEffect(() => {
    const onHash = () => {
      setRoute(route());
      setMobile(false);
      setNotifs(false);
      setSearch(false);
      setModal(null);
      window.scrollTo(0, 0);
    };
    const keys = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch((v) => !v);
        setNotifs(false);
      }
      if (e.key === "Escape") {
        setSearch(false);
        setNotifs(false);
        setMobile(false);
      }
    };
    const expired = () => {
      sessionStorage.removeItem("brg.session");
      setAuth("login");
      setBoot(null);
      setModal(null);
    };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("keydown", keys);
    window.addEventListener("brg:expired", expired);
    init();
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("keydown", keys);
      window.removeEventListener("brg:expired", expired);
    };
  }, []);
  useEffect(() => {
    document.title =
      (INFO[r.page]?.[0] || "Workspace") + " · Bull Realty Global";
  }, [r.page]);
  useEffect(() => {
    if (!notifs) return;
    const click = (e) => {
      if (h.current && !h.current.contains(e.target)) setNotifs(false);
    };
    document.addEventListener("mousedown", click);
    return () => document.removeEventListener("mousedown", click);
  }, [notifs]);
  async function login(data, demo = false) {
    const res = await api(demo ? "/auth/demo" : "/auth/login", "POST", data);
    sessionStorage.setItem("brg.session", res.token);
    sessionStorage.removeItem("brg.signedout");
    setBoot(await api("/bootstrap"));
    setAuth("ready");
  }
  async function logout() {
    try {
      await api("/auth/logout", "POST", {});
    } catch {}
    sessionStorage.removeItem("brg.session");
    sessionStorage.setItem("brg.signedout", "1");
    setBoot(null);
    setModal(null);
    setAuth("login");
    navigate("dashboard");
  }
  async function switchUser(id) {
    try {
      await login({ user_id: id }, true);
      close();
      rev((v) => v + 1);
      navigate("dashboard");
      toast("Demo role switched.");
    } catch (e) {
      toast(e.message, "error");
    }
  }
  useEffect(() => {
    if (auth !== "ready") return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 60000);
    return () => clearInterval(id);
  }, [auth, refresh]);
  const allowed = (k) => !k || boot?.permissions.includes(k);
  if (auth === "loading")
    return (
      <div className="splash">
        <Logo />
        <Loading />
      </div>
    );
  if (auth === "error")
    return (
      <div className="splash">
        <Logo />
        <ErrorBox error={err} retry={init} />
      </div>
    );
  if (!boot || auth === "login")
    return <Login login={login} config={config} initialError={err} />;
  const current = INFO[r.page],
    permitted = current && allowed(current[2]);
  let content;
  if (!current)
    content = (
      <Empty
        title="Page not found"
        text="Choose a module from your workspace navigation."
      >
        <Button onClick={() => navigate("dashboard")}>Back to dashboard</Button>
      </Empty>
    );
  else if (!permitted)
    content = (
      <Empty
        icon={LockKeyhole}
        title="Restricted workspace"
        text="Your CRM role does not have permission to open this module."
      >
        <Button onClick={() => navigate("dashboard")}>Back to dashboard</Button>
      </Empty>
    );
  else if (r.page === "dashboard") content = <Dashboard />;
  else if (r.page === "leads")
    content = r.id ? <LeadDetail id={r.id} /> : <Leads query={r.query} />;
  else if (r.page === "assignment")
    content = <Leads query={{ view: "Unassigned", ...r.query }} />;
  else if (r.page === "pipeline") content = <Pipeline />;
  else if (r.page === "projects") content = <Projects id={r.id} />;
  else if (r.page === "inventory") content = <Inventory query={r.query} />;
  else if (r.page === "my-work") content = <Records type="tasks" mine />;
  else if (
    [
      "tasks",
      "calls",
      "visits",
      "meetings",
      "messages",
      "quotations",
      "bookings",
    ].includes(r.page)
  )
    content = <Records type={r.page} query={r.query} />;
  else if (["team", "users", "partners", "campaigns"].includes(r.page))
    content = <Directory type={r.page} />;
  else if (r.page === "reports") content = <Reports />;
  else if (r.page === "activity") content = <Logs />;
  else if (r.page === "notifications") content = <Notifications />;
  else content = <SettingsPage />;
  return (
    <Ctx.Provider
      value={{
        boot,
        allowed,
        refresh,
        revision,
        toast,
        open,
        close,
        logout,
        switchUser,
      }}
    >
      <div
        className={
          "app-shell " +
          (collapsed ? "rail-collapsed " : "") +
          (mobile ? "mobile-nav-open" : "")
        }
      >
        {mobile && (
          <button
            className="mobile-scrim"
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
          />
        )}
        <Sidebar
          r={r}
          expandRail={() => setCollapsed(false)}
          mobileClose={() => setMobile(false)}
        />
        <div className="main-column">
          <header className="topbar">
            <div className="breadcrumb">
              <IconButton
                icon={PanelLeft}
                label="Toggle navigation"
                size={18}
                onClick={() =>
                  window.innerWidth <= 850
                    ? setMobile(!mobile)
                    : setCollapsed(!collapsed)
                }
              />
              <i />
              <span>Workspace</span>
              <ChevronRight size={13} />
              <b>{current?.[0] || "Workspace"}</b>
            </div>
            <div className="top-actions">
              <button
                className="global-search"
                aria-label="Search workspace"
                onClick={() => setSearch(true)}
              >
                <Search size={15} />
                <span>Search anything...</span>
                <kbd>⌘ K</kbd>
              </button>
              {allowed("writeLead") && (
                <Button
                  className="top-add"
                  kind="primary"
                  icon={Plus}
                  onClick={() => open("add-lead")}
                >
                  Add lead
                </Button>
              )}
              <div className="notify-wrap" ref={h}>
                <button
                  className={"bell-button " + (notifs ? "pressed" : "")}
                  aria-label={"Notifications, " + boot.unread + " unread"}
                  onClick={() => setNotifs(!notifs)}
                >
                  <Bell size={19} strokeWidth={1.65} />
                  {boot.unread > 0 && <i />}
                </button>
                {notifs && (
                  <NotificationPopover close={() => setNotifs(false)} />
                )}
              </div>
              <span className="header-divider" />
              <button
                className="account-button"
                onClick={() => open("profile")}
                aria-label="Open account and role settings"
              >
                <Avatar
                  name={boot.user.name}
                  color="profile-avatar"
                  size={33}
                />
                <span>
                  <b>{boot.user.name}</b>
                  <small>
                    {boot.user.role === "Super Admin"
                      ? "Administrator"
                      : boot.user.role}
                  </small>
                </span>
                <ChevronDown size={12} />
              </button>
            </div>
          </header>
          <main
            key={
              r.page +
              ":" +
              r.id +
              ":" +
              JSON.stringify(r.query) +
              ":" +
              boot.user.id
            }
          >
            {content}
          </main>
          <footer className="main-footer">
            <span>Bull Realty Global</span>
            <i />
            Sales & Marketing CRM
            <span className="footer-right">Workspace v1.0</span>
          </footer>
        </div>
      </div>
      {modal && (
        <ModalHost
          modal={modal}
          key={modal.kind + ":" + (modal.obj.row?.id || "")}
        />
      )}{" "}
      {search && <SearchPalette close={() => setSearch(false)} />}{" "}
      {toastState && (
        <div className={"toast " + toastState.type} role="status">
          {toastState.type === "error" ? (
            <AlertCircle size={17} />
          ) : (
            <CheckCircle2 size={17} />
          )}
          <span>{toastState.text}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={13} />
          </button>
        </div>
      )}
    </Ctx.Provider>
  );
}
function Sidebar({ r, mobileClose, expandRail }) {
  const { boot, allowed, open } = useApp(),
    [expanded, setExp] = useState({});
  const item = (key, sub = false) => {
    const [label, Icon, cap] = INFO[key];
    if (!allowed(cap)) return null;
    return (
      <a
        href={"#/" + key}
        key={key}
        title={label}
        className={
          "nav-item " + (sub ? "sub " : "") + (r.page === key ? "active" : "")
        }
        aria-current={r.page === key ? "page" : undefined}
      >
        <Icon size={17} strokeWidth={1.65} />
        <span>{label}</span>
        {key === "my-work" && boot.workCount > 0 && (
          <b className="nav-count">{boot.workCount}</b>
        )}
        {key === "dashboard" && r.page === key && (
          <i className="nav-active-dot" />
        )}
      </a>
    );
  };
  const group = (label, kids) =>
    kids.some(Boolean) && (
      <div className="nav-group">
        <div className="nav-label">{label}</div>
        {kids}
      </div>
    );
  const branch = (label, Icon, keys) => {
    keys = keys.filter((k) => allowed(INFO[k][2]));
    if (!keys.length) return null;
    const isOpen = expanded[label] ?? keys.includes(r.page);
    return (
      <div className="nav-branch" key={label}>
        <button
          title={label}
          className={
            "nav-item " + (keys.includes(r.page) ? "parent-active" : "")
          }
          onClick={() => {
            expandRail();
            setExp({ ...expanded, [label]: !isOpen });
          }}
        >
          <Icon size={17} strokeWidth={1.65} />
          <span>{label}</span>
          <ChevronDown
            className={"nav-chevron " + (isOpen ? "up" : "")}
            size={12}
          />
        </button>
        {isOpen && (
          <div className="nav-children">{keys.map((k) => item(k, true))}</div>
        )}
      </div>
    );
  };
  return (
    <aside className="sidebar">
      <a
        href="#/dashboard"
        className="brand-wrap"
        title="Bull Realty Global dashboard"
      >
        <Logo />
      </a>
      <button
        className="mobile-close"
        onClick={mobileClose}
        aria-label="Close menu"
      >
        <X size={19} />
      </button>
      <nav className="sidebar-scroll" aria-label="Main navigation">
        {group("WORKSPACE", [item("dashboard"), item("my-work")])}
        {group("SALES & ENGAGEMENT", [
          item("leads"),
          item("pipeline"),
          item("tasks"),
          branch("Communications", MessagesSquare, ["calls", "messages"]),
          item("visits"),
          item("meetings"),
        ])}
        {group("PROPERTY MANAGEMENT", [
          item("projects"),
          item("inventory"),
          item("quotations"),
          item("bookings"),
        ])}
        {group("MANAGEMENT", [
          branch("Marketing", Megaphone, ["campaigns", "partners"]),
          item("reports"),
          branch("Team & access", UsersRound, [
            "team",
            "users",
            "assignment",
            "activity",
          ]),
        ])}
      </nav>
      <div className="sidebar-bottom">
        {allowed("settings") && (
          <a
            className={"nav-item " + (r.page === "settings" ? "active" : "")}
            href="#/settings"
          >
            <Settings size={17} strokeWidth={1.6} />
            <span>Settings & integrations</span>
          </a>
        )}
        <div className="workspace-status">
          <i />
          <span>{boot.demo ? "Demo workspace" : "Workspace online"}</span>
          <b>v1.0</b>
        </div>
      </div>
    </aside>
  );
}
function NotificationPopover({ close }) {
  const { refresh, toast } = useApp(),
    s = useLoad("/notifications");
  return (
    <div className="notify-pop">
      <div className="notify-head">
        <h3>Notifications</h3>
        <button
          title="Mark all read"
          aria-label="Mark all as read"
          onClick={async () => {
            try {
              await api("/notifications/read", "POST", {});
              refresh();
            } catch (e) {
              toast(e.message, "error");
            }
          }}
        >
          <CheckCheck size={16} />
        </button>
      </div>
      {s.data ? (
        s.data.slice(0, 4).map((n) => (
          <button
            className="notify-entry"
            key={n.id}
            onClick={async () => {
              try {
                await api("/notifications/read", "POST", { id: n.id });
                refresh();
                close();
                navigate(
                  n.lead_id
                    ? "leads/" + n.lead_id
                    : n.kind === "Report"
                      ? "reports"
                      : n.kind === "Reminder"
                        ? "my-work"
                        : "leads",
                );
              } catch (e) {
                toast(e.message, "error");
              }
            }}
          >
            <span className={"notice-dot " + (n.is_read ? "read" : "")} />
            <span>
              <b>{n.title}</b>
              <small>{n.body}</small>
            </span>
          </button>
        ))
      ) : (
        <Loading />
      )}
      {s.data && !s.data.length && (
        <p className="padded muted">No notifications yet.</p>
      )}
      <button
        className="panel-foot-link"
        onClick={() => {
          close();
          navigate("notifications");
        }}
      >
        Open notification center <ArrowRight size={13} />
      </button>
    </div>
  );
}
function SearchPalette({ close }) {
  const { boot, allowed, open } = useApp(),
    [q, setQ] = useState(""),
    v = useDebounce(q),
    s = useLoad(
      v && allowed("readLeads") ? "/leads" + qs({ q: v, size: 5 }) : null,
    ),
    pages = Object.entries(INFO)
      .filter(
        ([k, [n, I, p]]) =>
          allowed(p) && n.toLowerCase().includes(q.toLowerCase()),
      )
      .slice(0, q ? 6 : 5),
    projects = q
      ? boot.projects.filter((p) =>
          p.name.toLowerCase().includes(q.toLowerCase()),
        )
      : [];
  const go = (k) => {
    close();
    navigate(k);
  };
  return (
    <Modal title="Search workspace" onClose={close}>
      <div className="palette-search">
        <Search size={18} />
        <input
          autoFocus
          placeholder="Search pages, projects, leads or phone numbers…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <kbd>ESC</kbd>
      </div>
      <div className="palette-results">
        {pages.length > 0 && (
          <div className="eyebrow">{q ? "PAGES" : "QUICK NAVIGATION"}</div>
        )}
        {pages.map(([k, [n, I]]) => (
          <button key={k} onClick={() => go(k)}>
            <I size={16} />
            <span>{n}</span>
            <ArrowRight size={13} />
          </button>
        ))}
        {projects.length > 0 && <div className="eyebrow">PROJECTS</div>}
        {projects.map((p) => (
          <button key={p.id} onClick={() => go("projects/" + p.id)}>
            <Building2 size={16} />
            <span>{p.name}</span>
            <ArrowUpRight size={13} />
          </button>
        ))}
        {s.data?.items?.length > 0 && <div className="eyebrow">LEADS</div>}
        {s.data?.items?.map((l) => (
          <button key={l.id} onClick={() => go("leads/" + l.id)}>
            <Avatar size={25} name={l.name} />
            <span>
              {l.name}
              <small>
                {code("LD", l.id)} · {l.project}
              </small>
            </span>
            <ArrowUpRight size={13} />
          </button>
        ))}
        {q &&
          !pages.length &&
          !projects.length &&
          !s.data?.items?.length &&
          !s.loading && (
            <Empty
              icon={Search}
              title="No matches found"
              text="Try a customer name, project, or module."
            />
          )}
      </div>
    </Modal>
  );
}
function Login({ login, config, initialError }) {
  const [email, setEmail] = useState(""),
    [password, pw] = useState(""),
    [err, setErr] = useState(initialError),
    [busy, setBusy] = useState(false);
  async function go(demo) {
    setBusy(true);
    setErr("");
    try {
      await login(demo ? {} : { email, password }, demo);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-screen">
      <div className="login-visual">
        <Logo />
        <div>
          <div className="welcome-kicker">
            <span />
            SALES & MARKETING CRM
          </div>
          <h1>
            Your real estate
            <br />
            sales workspace.
          </h1>
          <p>From the first enquiry to a confirmed booking.</p>
        </div>
      </div>
      <div className="login-box">
        <span className="modal-icon">
          <LockKeyhole size={22} />
        </span>
        <div className="eyebrow">BULL REALTY GLOBAL</div>
        <h1>Welcome back</h1>
        <p>Sign in to your sales workspace.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            go(false);
          }}
        >
          <Field label="Official email">
            <input
              type="email"
              required
              autoComplete="username"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => pw(e.target.value)}
            />
          </Field>
          {err && <ErrorBox error={err} />}
          <Button type="submit" kind="primary" icon={LogIn} disabled={busy}>
            Sign in
          </Button>
        </form>
        {config.demo && (
          <>
            <div className="or-line">or explore a sample workspace</div>
            <Button onClick={() => go(true)} disabled={busy}>
              Enter demo workspace <ArrowRight size={14} />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
