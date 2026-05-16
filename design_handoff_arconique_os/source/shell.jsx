/* Shared shell: Sidebar, TopBar, AppShell, helper UI atoms */

function Pill({ tone = "neutral", children, ...p }) {
  return <span className={`pill ${tone}`} {...p}>{children}</span>;
}

function Avatar({ name, color, size = 28 }) {
  const initials = (name || "?").split(/\s+/).map(s => s[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: color || "var(--terra)",
      color: "#fff",
      display: "grid", placeItems: "center",
      fontSize: Math.round(size * 0.4),
      fontWeight: 600,
      letterSpacing: "0.02em",
      flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

const APP_DEFS = {
  mgmt: {
    code: "MOS",
    name: "Management OS",
    sub: "Hospitality",
    nav: [
      { section: "Workspace" },
      { id: "overview", label: "Portfolio overview", icon: "Home" },
      { id: "bookings", label: "Bookings", icon: "Bookings", badge: "12" },
      { id: "finance", label: "Finance", icon: "Coin" },
      { id: "operations", label: "Operations", icon: "Wrench", badge: "3" },
      { id: "frontoffice", label: "Front office", icon: "Key" },
      { section: "Guests" },
      { id: "guests", label: "Guests", icon: "Users" },
      { id: "concierge", label: "Concierge", icon: "Concierge" },
      { id: "ai", label: "Operations Copilot", icon: "Sparkles" },
      { section: "Library" },
      { id: "villas", label: "Villas", icon: "Building" },
      { id: "inventory", label: "Inventory", icon: "Box" },
      { id: "channels", label: "Channels", icon: "PlugZap" },
    ],
  },
  dev: {
    code: "DOS",
    name: "Development OS",
    sub: "Build cycle",
    nav: [
      { section: "Command" },
      { id: "command", label: "Command center", icon: "Compass" },
      { id: "projects", label: "Projects", icon: "Building", badge: "3" },
      { id: "cashflow", label: "Cashflow forecast", icon: "ChartLine" },
      { id: "investors", label: "Investors", icon: "Users" },
      { section: "Build" },
      { id: "boq", label: "BoQ & Quantity Survey", icon: "Layers" },
      { id: "procurement", label: "Procurement", icon: "Truck", badge: "8" },
      { id: "qaqc", label: "QA / QC", icon: "ShieldCheck" },
      { id: "drawings", label: "Drawings", icon: "Map" },
      { section: "Sales & money" },
      { id: "sales", label: "Sales & buyers", icon: "Tag" },
      { id: "banking", label: "Banking", icon: "Bank" },
      { id: "ai", label: "AI Agents", icon: "Robot" },
    ],
  },
};

function Sidebar({ app, setApp, route, setRoute }) {
  const def = APP_DEFS[app];
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark serif">A</div>
        <div className="brand-text">
          <span className="name">Arconique</span>
          <span className="sub">{def.sub}</span>
        </div>
      </div>

      <div className="app-switcher">
        <button className={app === "mgmt" ? "active" : ""} onClick={() => { setApp("mgmt"); setRoute("overview"); }}>
          <Icon.Home size={13} />
          <span className="label">Management</span>
        </button>
        <button className={app === "dev" ? "active" : ""} onClick={() => { setApp("dev"); setRoute("command"); }}>
          <Icon.Hammer size={13} />
          <span className="label">Development</span>
        </button>
      </div>

      {def.nav.map((n, i) => {
        if (n.section) return <div key={i} className="nav-section">{n.section}</div>;
        const IconCmp = Icon[n.icon] || Icon.Dot;
        return (
          <button key={n.id} className={`nav-item ${route === n.id ? "active" : ""}`} onClick={() => setRoute(n.id)}>
            <IconCmp className="icon" />
            <span className="label">{n.label}</span>
            {n.badge && <span className="badge">{n.badge}</span>}
          </button>
        );
      })}

      <div className="spacer" />
      <div className="divider" />
      <button className="nav-item">
        <Icon.Settings className="icon" />
        <span className="label">Settings</span>
      </button>
      <button className="nav-item">
        <Icon.Logout className="icon" />
        <span className="label">Sign out</span>
      </button>
    </aside>
  );
}

function TopBar({ app }) {
  const def = APP_DEFS[app];
  return (
    <div className="topbar">
      <div className="search">
        <Icon.Search size={15} />
        <span style={{ flex: 1 }}>Search villas, bookings, projects…</span>
        <kbd>⌘K</kbd>
      </div>
      <div className="actions">
        <Pill tone={app === "mgmt" ? "olive" : "sea"}>
          <span className="dot" /> {def.code} · Live
        </Pill>
        <button className="icon-btn"><Icon.Plus size={16} /></button>
        <button className="icon-btn">
          <Icon.Bell size={16} />
          <span className="dot" />
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: 6 }}>
          <Avatar name="Nikita R" color="linear-gradient(135deg, var(--terra), var(--terra-deep))" size={38} />
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }} className="hide-sm">
            <span style={{ fontSize: 13, fontWeight: 500 }}>Nikita R.</span>
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>Owner · ARC</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileTabbar({ app, route, setRoute }) {
  const items = app === "mgmt"
    ? [
        { id: "overview", icon: "Home", label: "Home" },
        { id: "bookings", icon: "Bookings", label: "Bookings" },
        { id: "operations", icon: "Wrench", label: "Ops" },
        { id: "ai", icon: "Sparkles", label: "Copilot" },
      ]
    : [
        { id: "command", icon: "Compass", label: "Command" },
        { id: "projects", icon: "Building", label: "Projects" },
        { id: "procurement", icon: "Truck", label: "Procure" },
        { id: "ai", icon: "Robot", label: "Agents" },
      ];
  return (
    <nav className="mobile-tabbar">
      {items.map((t) => {
        const C = Icon[t.icon];
        return (
          <button key={t.id} className={`mt ${route === t.id ? "active" : ""}`} onClick={() => setRoute(t.id)}>
            <C />
            <span>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function PageHeader({ eyebrow, title, accent, sub, actions }) {
  return (
    <div className="page-header">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}{accent && <> <span className="accent">{accent}</span></>}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {actions && <div className="head-actions">{actions}</div>}
    </div>
  );
}

function Section({ eyebrow, title, sub, action, children }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {(eyebrow || title || action) && (
        <div className="row between" style={{ alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
          <div>
            {eyebrow && <div style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.10em", color: "var(--ink-3)", marginBottom: 4 }}>{eyebrow}</div>}
            {title && <div className="serif" style={{ fontSize: 26, letterSpacing: "-0.015em", lineHeight: 1.1 }}>{title}</div>}
            {sub && <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{sub}</div>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

function KpiCard({ tone = "warm", label, value, sub, delta, sparkColor, sparkData, hero, children }) {
  const isInk = tone === "ink" || tone === "ink-warm";
  return (
    <div className={`card tone-${tone} ${hero ? "kpi-hero" : ""}`}>
      <div className="row between">
        <div className="kpi-label">{label}</div>
        {delta != null && (
          <span className={`kpi-delta ${delta > 0 ? "up" : delta < 0 ? "down" : "flat"}`}>
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "–"} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
      <div className={`serif kpi-value ${!hero ? "compact" : ""}`} style={isInk ? { color: "#fff" } : null}>{value}</div>
      {sub && <div className="kpi-meta">{sub}</div>}
      {sparkData && <div style={{ marginTop: 6 }}><Sparkline data={sparkData} color={sparkColor || (isInk ? "rgba(255,255,255,0.7)" : "var(--terra)")} height={hero ? 56 : 36} /></div>}
      {children}
    </div>
  );
}

window.Pill = Pill;
window.Avatar = Avatar;
window.Sidebar = Sidebar;
window.TopBar = TopBar;
window.MobileTabbar = MobileTabbar;
window.PageHeader = PageHeader;
window.Section = Section;
window.KpiCard = KpiCard;
window.APP_DEFS = APP_DEFS;
