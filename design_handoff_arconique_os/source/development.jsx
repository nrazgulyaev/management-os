/* Development OS — Builder / Developer cabinet pages */

const DEV_DATA = {
  greeting: { firstName: "Nikita", date: "Thursday · 16 May 2026" },
  kpis: [
    { label: "Active projects", value: "3", sub: "29 units in flight", delta: 0, tone: "warm" },
    { label: "Capital deployed", value: "$1.82M", sub: "of $4.20M committed", delta: 12.4, tone: "terra" },
    { label: "Schedule adherence", value: "94%", sub: "1 project amber", delta: -2.1, tone: "olive" },
    { label: "Pre-sales reserved", value: "62%", sub: "18 of 29 units", delta: 8.6, tone: "sea" },
  ],
  projects: [
    {
      code: "ENSO-SABA",
      name: "Enso Saba",
      phase: "Structural · Phase 2",
      units: 12,
      sold: 9,
      health: { schedule: 96, budget: 92, sales: 78, risk: "low" },
      progress: 64,
      next: "Pool deck pour · Fri",
      tone: "olive",
    },
    {
      code: "ANANTYA",
      name: "Anantya Seseh",
      phase: "MEP · Phase 1",
      units: 8,
      sold: 6,
      health: { schedule: 88, budget: 95, sales: 84, risk: "amber" },
      progress: 42,
      next: "MEP rough-in QA",
      tone: "terra",
    },
    {
      code: "BAMBOO",
      name: "Bamboo Bingin",
      phase: "Finishes · Phase 3",
      units: 9,
      sold: 3,
      health: { schedule: 90, budget: 88, sales: 38, risk: "medium" },
      progress: 81,
      next: "Sales open house",
      tone: "sea",
    },
  ],
  cashflowMonths: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],
  inflows:  [180, 220, 280, 340, 410, 460, 520, 580, 540, 480, 420, 380],
  outflows: [220, 260, 310, 330, 380, 420, 440, 480, 520, 540, 500, 460],
  procurement: [
    { po: "PO-2026-184", project: "ENSO-SABA", vendor: "Saba Stone & Tile", item: "Travertine slabs · 280 m²", value: 84200, due: "Mon", status: "in-transit" },
    { po: "PO-2026-183", project: "ANANTYA",   vendor: "BaliPro MEP",        item: "VRV cassettes · 12 units", value: 62400, due: "Tue", status: "awaiting" },
    { po: "PO-2026-182", project: "BAMBOO",    vendor: "Reka Joinery",       item: "Custom kitchen · V09",  value: 41800, due: "Thu", status: "draft" },
    { po: "PO-2026-181", project: "ENSO-SABA", vendor: "Putra Glass",        item: "Frameless balustrade · 48m", value: 28600, due: "Fri", status: "approved" },
    { po: "PO-2026-180", project: "BAMBOO",    vendor: "GreenScape Bali",    item: "Mature palms · 14",     value: 12400, due: "Today", status: "delivered" },
  ],
  buyers: [
    { name: "T. Aoki", unit: "ENSO-12", stage: "Reservation",  amount: 12000, agent: "Direct" },
    { name: "K. Brenner", unit: "ANTY-04", stage: "SPA signed",    amount: 28500, agent: "Lisa Wong" },
    { name: "P. & A. Vu", unit: "ENSO-09", stage: "Down-payment",  amount: 64200, agent: "Direct" },
    { name: "M. Andersson", unit: "BAMB-03", stage: "Reservation",  amount: 8000,  agent: "Cushman" },
    { name: "R. Iyer", unit: "ANTY-02", stage: "Stage 2 paid",   amount: 92000, agent: "Direct" },
  ],
  agents: [
    { name: "Executive Business Brief", role: "C-suite", run: "Daily 07:00", status: "live", conf: 92 },
    { name: "QS Cost Analyst", role: "Build cost", run: "On commit", status: "live", conf: 89 },
    { name: "Procurement Analyst", role: "Vendor + price intel", run: "Daily 08:30", status: "live", conf: 84 },
    { name: "Tax Assistant", role: "Indonesia tax", run: "Weekly", status: "beta", conf: 78 },
    { name: "Marketing Assistant", role: "Sales funnel", run: "Daily 09:00", status: "beta", conf: 80 },
    { name: "Weekly Plan", role: "Plan & forecast", run: "Mon 06:30", status: "roadmap", conf: null },
  ],
};

function DevCommand() {
  const d = DEV_DATA;
  return (
    <>
      <PageHeader
        eyebrow={d.greeting.date}
        title="Development "
        accent="command center."
        sub="Three active projects, 29 units in flight, $1.82M deployed across the build cycle. One AI insight needs your read this morning."
        actions={<>
          <button className="btn btn-ghost"><Icon.Compass className="icon" /> Public preview</button>
          <button className="btn btn-accent"><Icon.Building className="icon" /> Projects</button>
        </>}
      />

      <Section eyebrow="Top of mind" title="Portfolio KPIs" sub="Across all active developments. Cards in amber need your read this week.">
        <div className="grid g-4">
          {d.kpis.map((k, i) => (
            <KpiCard key={i} tone={k.tone} label={k.label} value={k.value} sub={k.sub} delta={k.delta || null}
              sparkData={i === 1 ? [120, 140, 130, 160, 180, 220, 260, 290, 310, 340, 360, 380] : null}
              sparkColor={i === 1 ? "var(--terra)" : null}
            />
          ))}
        </div>
      </Section>

      <div className="ai-panel">
        <div className="meta">
          <Icon.Sparkles size={13} /> Executive Business Brief · 07:00
          <Pill tone="ghost" style={{ marginLeft: "auto", color: "rgba(255,255,255,0.7)", borderColor: "rgba(255,255,255,0.18)" }}>Needs review</Pill>
        </div>
        <h3>Anantya MEP is <em>4 days behind</em>; pushing finishes start to 2 June puts the contractual closing on V04 at risk.</h3>
        <p>Recommend front-loading the BaliPro VRV crew to dual-shift Tue–Thu (incremental cost Rp 38M, modelled). Bamboo sales are 24 pts under plan — Cushman renewal review is overdue. Saba Phase 2 is on track; pool deck pour Friday looks clean.</p>
        <div className="actions">
          <button className="btn btn-accent">Approve dual-shift <Icon.ArrowUR className="icon" /></button>
          <button className="btn btn-onink">Open Anantya schedule</button>
          <button className="btn btn-onink">Dismiss</button>
        </div>
      </div>

      <Section eyebrow="Projects" title="Project health · 3 active"
        sub="Schedule, budget, sales, and AI risk in one glance."
        action={<button className="btn btn-quiet">All projects <Icon.ArrowUR className="icon" /></button>}
      >
        <div className="grid g-3">
          {d.projects.map(p => <ProjectHealthCard key={p.code} project={p} />)}
        </div>
      </Section>

      <div className="grid g-12">
        <div className="col-8">
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Cashflow · 2026</div>
                <div className="card-sub">Inflows vs Outflows · USD thousands</div>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <Pill tone="olive"><span className="dot" /> Inflows</Pill>
                <Pill tone="terra"><span className="dot" /> Outflows</Pill>
              </div>
            </div>
            <DualLine months={d.cashflowMonths} a={d.inflows} b={d.outflows} />
            <div className="row" style={{ gap: 24, paddingTop: 14, marginTop: 14, borderTop: "1px solid var(--line-2)", flexWrap: "wrap" }}>
              <div><div className="muted" style={{ fontSize: 11 }}>YTD inflows</div><div className="serif tnum" style={{ fontSize: 22 }}>$1.43M</div></div>
              <div><div className="muted" style={{ fontSize: 11 }}>YTD outflows</div><div className="serif tnum" style={{ fontSize: 22 }}>$1.50M</div></div>
              <div><div className="muted" style={{ fontSize: 11 }}>Net position</div><div className="serif tnum" style={{ fontSize: 22, color: "var(--danger)" }}>−$72K</div></div>
              <div><div className="muted" style={{ fontSize: 11 }}>Forecast Dec</div><div className="serif tnum" style={{ fontSize: 22, color: "var(--success)" }}>+$480K</div></div>
            </div>
          </div>
        </div>
        <div className="col-4">
          <div className="card" style={{ height: "100%" }}>
            <div className="card-header">
              <div>
                <div className="card-title">Sales funnel</div>
                <div className="card-sub">29 units · 3 projects</div>
              </div>
            </div>
            {[
              { l: "Reserved", v: 18, max: 29, c: "var(--olive)" },
              { l: "SPA signed", v: 14, max: 29, c: "var(--terra)" },
              { l: "Down-payment", v: 11, max: 29, c: "var(--sea)" },
              { l: "Stage 2 paid", v: 6, max: 29, c: "var(--ink-deep)" },
            ].map((s, i) => (
              <div key={i} style={{ marginTop: 14 }}>
                <div className="row between" style={{ marginBottom: 6 }}>
                  <span style={{ fontSize: 12.5 }}>{s.l}</span>
                  <span className="mono tnum" style={{ fontSize: 12.5, fontWeight: 500 }}>{s.v}<span className="muted">/{s.max}</span></span>
                </div>
                <HBar value={s.v} max={s.max} color={s.c} height={8} />
              </div>
            ))}
            <div className="divider" />
            <div className="row between">
              <span className="muted" style={{ fontSize: 11 }}>Avg reservation → close</span>
              <span className="mono tnum">42d</span>
            </div>
            <div className="row between" style={{ marginTop: 6 }}>
              <span className="muted" style={{ fontSize: 11 }}>Pipeline value</span>
              <span className="mono tnum">$8.42M</span>
            </div>
          </div>
        </div>
      </div>

      <Section eyebrow="Snapshots" title="Operating picture"
        sub="Plan vs. forecast across cash, budget, progress, and the sales funnel.">
        <div className="grid g-4">
          {[
            { t: "Cost vs Budget", v: "92%", sub: "Anantya 88% · amber", c: "var(--terra)", dots: 27, total: 30 },
            { t: "Schedule Adherence", v: "94%", sub: "1 project amber", c: "var(--olive)", dots: 28, total: 30 },
            { t: "QA / QC pass rate", v: "97%", sub: "Last 30 inspections", c: "var(--sea)", dots: 29, total: 30 },
            { t: "AI confidence avg", v: "86", sub: "across 4 live agents", c: "var(--ink-deep)", dots: 26, total: 30 },
          ].map((s, i) => (
            <div className="card" key={i}>
              <div className="card-header">
                <div className="card-title">{s.t}</div>
              </div>
              <div className="serif" style={{ fontSize: 38, letterSpacing: "-0.02em", lineHeight: 1 }}>{s.v}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4, marginBottom: 14 }}>{s.sub}</div>
              <DotGrid filled={s.dots} total={s.total} color={s.c} />
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="AI surface" title="Two agents shipping first">
        <div className="grid g-2">
          {d.agents.filter(a => a.status === "live").slice(0, 2).map((a, i) => (
            <div className="card" key={i}>
              <div className="row between" style={{ marginBottom: 10 }}>
                <div className="row" style={{ gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 12, background: "var(--ink-deep)", color: "#fff", display: "grid", placeItems: "center" }}>
                    <Icon.Robot size={16} />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{a.name}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>{a.role} · {a.run}</div>
                  </div>
                </div>
                <Pill tone="success">Live</Pill>
              </div>
              <p style={{ margin: "8px 0 12px", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55 }}>
                {i === 0
                  ? "Synthesises overnight signals from every project into one C-suite briefing. Flags amber budgets and schedule slips, recommends moves."
                  : "Lives inside the BoQ. Re-runs costs the moment a quantity or rate changes, surfacing material variances within minutes."
                }
              </p>
              <div className="row" style={{ gap: 8 }}>
                <span style={{ fontSize: 11, color: "var(--ink-3)" }}>Confidence</span>
                <HBar value={a.conf} color="var(--olive)" />
                <span className="mono tnum" style={{ fontSize: 12 }}>{a.conf}</span>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

function ProjectHealthCard({ project: p }) {
  const riskTone = p.health.risk === "low" ? "success" : p.health.risk === "amber" ? "warning" : "danger";
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="row between">
        <div>
          <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{p.code}</span>
          <div className="serif" style={{ fontSize: 22, letterSpacing: "-0.01em", marginTop: 2 }}>{p.name}</div>
          <div className="muted" style={{ fontSize: 11.5 }}>{p.phase}</div>
        </div>
        <Pill tone={riskTone}>{p.health.risk}</Pill>
      </div>

      <div style={{ position: "relative", height: 100, padding: 12, borderRadius: 14, background: "var(--surface-warm)", display: "grid", placeItems: "center" }}>
        <div style={{ width: "100%" }}>
          <div className="row between" style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 6 }}>
            <span>Construction progress</span>
            <span className="mono tnum">{p.progress}%</span>
          </div>
          <HBar value={p.progress} color={`var(--${p.tone})`} height={10} />
          <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>Next milestone · <span style={{ color: "var(--ink)" }}>{p.next}</span></div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {[
          { l: "Schedule", v: p.health.schedule, c: "var(--olive)" },
          { l: "Budget", v: p.health.budget, c: "var(--terra)" },
          { l: "Sales", v: p.health.sales, c: "var(--sea)" },
        ].map((m, i) => (
          <div key={i} style={{ background: "var(--surface-warm)", borderRadius: 12, padding: 10 }}>
            <div className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>{m.l}</div>
            <div className="serif tnum" style={{ fontSize: 18, marginTop: 2, marginBottom: 6 }}>{m.v}%</div>
            <HBar value={m.v} color={m.c} height={4} />
          </div>
        ))}
      </div>

      <div className="row between" style={{ paddingTop: 4 }}>
        <span className="muted" style={{ fontSize: 12 }}>{p.sold}/{p.units} units reserved</span>
        <button className="btn btn-quiet">Open <Icon.ArrowR className="icon" /></button>
      </div>
    </div>
  );
}

function DualLine({ months, a, b }) {
  const W = 800, H = 240;
  const allMax = Math.max(...a, ...b);
  const xs = months.map((_, i) => 24 + (i * (W - 48)) / (months.length - 1));
  const yFor = (v) => H - 28 - (v / allMax) * (H - 60);
  const ysA = a.map(yFor), ysB = b.map(yFor);
  const buildSmooth = (xs, ys) => {
    let line = `M ${xs[0]} ${ys[0]}`;
    for (let i = 1; i < xs.length; i++) {
      const cx = (xs[i - 1] + xs[i]) / 2;
      line += ` C ${cx} ${ys[i - 1]}, ${cx} ${ys[i]}, ${xs[i]} ${ys[i]}`;
    }
    return line;
  };
  const lineA = buildSmooth(xs, ysA);
  const lineB = buildSmooth(xs, ysB);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block" }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--olive)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--olive)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0,1,2,3,4].map(i => (
        <line key={i} x1="0" x2={W} y1={(H-32) * i / 4 + 6} y2={(H-32) * i / 4 + 6} stroke="var(--line-2)" strokeDasharray="3 6" />
      ))}
      <path d={`${lineA} L ${xs[xs.length-1]} ${H-28} L ${xs[0]} ${H-28} Z`} fill="url(#gA)" />
      <path d={lineA} fill="none" stroke="var(--olive)" strokeWidth="2.2" />
      <path d={lineB} fill="none" stroke="var(--terra)" strokeWidth="2.2" strokeDasharray="4 4" />
      {months.map((m, i) => (
        <text key={i} x={xs[i]} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--ink-3)" fontFamily="var(--font-mono)">{m}</text>
      ))}
    </svg>
  );
}

function DevProjects() {
  const d = DEV_DATA;
  return (
    <>
      <PageHeader
        eyebrow="Projects"
        title="Build "
        accent="portfolio."
        sub="29 units across three active developments."
        actions={<>
          <button className="btn btn-ghost"><Icon.Filter className="icon" /> Filter</button>
          <button className="btn btn-accent"><Icon.Plus className="icon" /> New project</button>
        </>}
      />
      <div className="grid g-3">
        {d.projects.map(p => <ProjectHealthCard key={p.code} project={p} />)}
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="card-header" style={{ padding: 20, marginBottom: 0 }}>
          <div>
            <div className="card-title">Active project schedule</div>
            <div className="card-sub">Phase timeline, May 2026</div>
          </div>
          <div className="tabs">
            <span className="tab active">Gantt</span>
            <span className="tab">Milestones</span>
          </div>
        </div>
        <div style={{ padding: 20, paddingTop: 0 }}>
          <Gantt rows={[
            { name: "Enso Saba",  phases: [{ s: 0, e: 18, c: "var(--olive)", label: "Foundation" }, { s: 18, e: 56, c: "var(--terra)", label: "Structural" }, { s: 56, e: 78, c: "var(--sea)", label: "MEP" }, { s: 78, e: 100, c: "var(--ink-deep)", label: "Finishes" }], cursor: 64 },
            { name: "Anantya Seseh", phases: [{ s: 0, e: 22, c: "var(--olive)", label: "Foundation" }, { s: 22, e: 48, c: "var(--terra)", label: "Structural" }, { s: 48, e: 76, c: "var(--sea)", label: "MEP" }, { s: 76, e: 100, c: "var(--ink-deep)", label: "Finishes" }], cursor: 42, amber: true },
            { name: "Bamboo Bingin", phases: [{ s: 0, e: 16, c: "var(--olive)", label: "Foundation" }, { s: 16, e: 40, c: "var(--terra)", label: "Structural" }, { s: 40, e: 64, c: "var(--sea)", label: "MEP" }, { s: 64, e: 100, c: "var(--ink-deep)", label: "Finishes" }], cursor: 81 },
          ]} />
        </div>
      </div>
    </>
  );
}

function Gantt({ rows }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {rows.map((r, i) => (
        <div key={i}>
          <div className="row between" style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>{r.name}</div>
            <div className="row" style={{ gap: 6 }}>
              {r.amber && <Pill tone="warning">Amber · MEP</Pill>}
              <span className="mono tnum" style={{ fontSize: 11.5 }}>{r.cursor}%</span>
            </div>
          </div>
          <div style={{ position: "relative", height: 32, borderRadius: 8, background: "var(--surface-sunken)", overflow: "hidden", display: "flex" }}>
            {r.phases.map((p, j) => (
              <div key={j} title={p.label} style={{
                width: `${p.e - p.s}%`,
                background: p.c,
                opacity: 0.85,
                display: "grid", placeItems: "center",
                color: "#fff", fontSize: 10.5, fontWeight: 500,
                borderRight: j < r.phases.length - 1 ? "1px solid rgba(255,255,255,0.4)" : "none",
              }}>
                {p.e - p.s > 12 ? p.label : ""}
              </div>
            ))}
            <div style={{ position: "absolute", top: -4, bottom: -4, left: `${r.cursor}%`, width: 2, background: r.amber ? "var(--warning)" : "var(--ink-deep)" }}>
              <div style={{ position: "absolute", top: -6, left: -5, width: 12, height: 12, borderRadius: "50%", background: r.amber ? "var(--warning)" : "var(--ink-deep)", border: "2px solid white" }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DevCashflow() {
  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Cashflow "
        accent="forecast."
        sub="12-month rolling forecast with sensitivity bands."
        actions={<button className="btn btn-ghost"><Icon.Download className="icon" /> Export model</button>}
      />
      <div className="grid g-4">
        <KpiCard tone="warm" label="Cash on hand" value="$842K" sub={<Pill tone="success">▲ $42K WoW</Pill>} />
        <KpiCard tone="terra" label="Burn · trailing 30d" value="$184K" sub={<Pill tone="warning">▲ 8%</Pill>} />
        <KpiCard tone="olive" label="Runway" value="4.6 mo" sub={<Pill tone="warning">Below target</Pill>} />
        <KpiCard tone="sea" label="Forecast Dec" value="+$480K" sub={<Pill tone="success">on plan</Pill>} />
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">12-month cashflow projection</div>
            <div className="card-sub">Inflows · Outflows · Net position</div>
          </div>
          <div className="tabs">
            <span className="tab active">Base</span>
            <span className="tab">Bull</span>
            <span className="tab">Bear</span>
          </div>
        </div>
        <DualLine months={DEV_DATA.cashflowMonths} a={DEV_DATA.inflows} b={DEV_DATA.outflows} />
      </div>

      <div className="grid g-12">
        <div className="col-7">
          <div className="card">
            <div className="card-header">
              <div className="card-title">Capital deployment · by project</div>
              <Pill tone="terra">$1.82M / $4.20M</Pill>
            </div>
            {DEV_DATA.projects.map((p, i) => (
              <div key={i} style={{ padding: "12px 0", borderTop: i ? "1px solid var(--line-2)" : "none" }}>
                <div className="row between" style={{ marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>{p.phase}</div>
                  </div>
                  <div className="row" style={{ gap: 12 }}>
                    <span className="mono tnum" style={{ fontSize: 13 }}>${(p.health.budget * 5 + 200).toFixed(0)}K</span>
                    <span className="muted mono">/ ${(p.health.budget * 7 + 400).toFixed(0)}K</span>
                  </div>
                </div>
                <HBar value={p.progress} color={`var(--${p.tone})`} height={6} />
              </div>
            ))}
          </div>
        </div>
        <div className="col-5">
          <div className="card" style={{ height: "100%" }}>
            <div className="card-header">
              <div className="card-title">Upcoming commitments · 30d</div>
              <Pill tone="warning">$420K</Pill>
            </div>
            <div className="list">
              {[
                { l: "BaliPro MEP · stage 2", a: "$92K", d: "18 May" },
                { l: "Saba Stone & Tile", a: "$84K", d: "20 May" },
                { l: "Reka Joinery · kitchen", a: "$42K", d: "27 May" },
                { l: "Bali Pemda land tax", a: "$28K", d: "30 May" },
                { l: "Marketing · Cushman", a: "$18K", d: "31 May" },
              ].map((row, i) => (
                <div className="list-row" key={i}>
                  <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", width: 56 }}>{row.d}</span>
                  <div className="info"><div className="t">{row.l}</div></div>
                  <span className="mono tnum" style={{ fontWeight: 500 }}>{row.a}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function DevProcurement() {
  return (
    <>
      <PageHeader
        eyebrow="Procurement"
        title="Purchase "
        accent="orders."
        sub="Active POs across vendors and projects."
        actions={<>
          <button className="btn btn-ghost"><Icon.Filter className="icon" /> Filter</button>
          <button className="btn btn-accent"><Icon.Plus className="icon" /> New PO</button>
        </>}
      />
      <div className="grid g-4">
        <KpiCard tone="warm" label="Active POs" value="42" sub={<Pill tone="olive">8 due this week</Pill>} />
        <KpiCard tone="terra" label="Open value" value="$648K" sub="across 17 vendors" />
        <KpiCard tone="olive" label="On-time delivery" value="91%" sub={<Pill tone="success">▲ 3%</Pill>} />
        <KpiCard tone="sea" label="Cost variance" value="−2.4%" sub="vs BoQ baseline" />
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="card-header" style={{ padding: 20, marginBottom: 0 }}>
          <div>
            <div className="card-title">Active purchase orders</div>
            <div className="card-sub">Sorted by due date</div>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <span className="chip active">All</span>
            <span className="chip">Awaiting</span>
            <span className="chip">In transit</span>
            <span className="chip">Delivered</span>
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>PO #</th><th>Project</th><th>Vendor</th><th>Item</th>
              <th className="right">Value</th><th>Due</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {DEV_DATA.procurement.map(po => (
              <tr key={po.po}>
                <td className="mono">{po.po}</td>
                <td><Pill tone={po.project === "ENSO-SABA" ? "olive" : po.project === "ANANTYA" ? "terra" : "sea"}>{po.project}</Pill></td>
                <td>{po.vendor}</td>
                <td className="muted">{po.item}</td>
                <td className="right mono tnum">${po.value.toLocaleString()}</td>
                <td className="mono">{po.due}</td>
                <td>
                  <Pill tone={
                    po.status === "delivered" ? "success" :
                    po.status === "in-transit" ? "sea" :
                    po.status === "approved" ? "olive" :
                    po.status === "awaiting" ? "warning" : "neutral"
                  }>{po.status}</Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid g-2">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Vendor performance · last 90d</div>
          </div>
          {[
            { v: "Saba Stone & Tile", score: 96, jobs: 24, c: "var(--olive)" },
            { v: "BaliPro MEP", score: 88, jobs: 18, c: "var(--terra)" },
            { v: "Reka Joinery", score: 92, jobs: 12, c: "var(--sea)" },
            { v: "Putra Glass", score: 84, jobs: 9, c: "var(--sand)" },
            { v: "GreenScape Bali", score: 78, jobs: 6, c: "var(--ink-deep)" },
          ].map((v, i) => (
            <div key={i} style={{ padding: "12px 0", borderTop: i ? "1px solid var(--line-2)" : "none" }}>
              <div className="row between" style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{v.v}</span>
                <span className="mono tnum" style={{ fontSize: 13 }}>{v.score}<span className="muted">/100</span></span>
              </div>
              <HBar value={v.score} color={v.c} height={5} />
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{v.jobs} jobs · {v.score > 90 ? "on time" : "minor delays"}</div>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Spend by category · MTD</div>
          </div>
          <div className="row" style={{ gap: 20, alignItems: "center" }}>
            <Donut value={28} total={100} color="var(--terra)" size={140} thickness={18} label="Materials" />
            <div className="col" style={{ flex: 1, gap: 8 }}>
              {[
                { l: "Materials", v: 28, c: "var(--terra)" },
                { l: "Labour", v: 24, c: "var(--olive)" },
                { l: "MEP", v: 18, c: "var(--sea)" },
                { l: "Finishes", v: 14, c: "var(--sand)" },
                { l: "Other", v: 16, c: "var(--ink-deep)" },
              ].map((c, i) => (
                <div className="row" key={i} style={{ gap: 10 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 4, background: c.c }} />
                  <span style={{ fontSize: 12.5 }}>{c.l}</span>
                  <span className="spacer" />
                  <span className="mono tnum" style={{ fontSize: 12.5, fontWeight: 500 }}>{c.v}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function DevSales() {
  return (
    <>
      <PageHeader
        eyebrow="Sales"
        title="Buyers &"
        accent="pipeline."
        sub="29 units across three projects. 18 reserved, 11 still open."
        actions={<>
          <button className="btn btn-ghost"><Icon.Filter className="icon" /> Filter</button>
          <button className="btn btn-accent"><Icon.Plus className="icon" /> Add lead</button>
        </>}
      />
      <div className="grid g-4">
        <KpiCard tone="warm" label="Pipeline value" value="$8.42M" sub="29 units, weighted" />
        <KpiCard tone="terra" label="Closed YTD" value="$3.18M" sub={<Pill tone="success">▲ 38% YoY</Pill>} />
        <KpiCard tone="olive" label="Avg time to close" value="42 days" sub={<Pill tone="success">▼ 6d</Pill>} />
        <KpiCard tone="sea" label="Direct share" value="64%" sub="36% via partners" />
      </div>

      <div className="grid g-12">
        <div className="col-8">
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div className="card-header" style={{ padding: 20, marginBottom: 0 }}>
              <div className="card-title">Recent buyer activity</div>
              <button className="btn btn-quiet">View all <Icon.ArrowR className="icon" /></button>
            </div>
            <table className="tbl">
              <thead>
                <tr><th>Buyer</th><th>Unit</th><th>Stage</th><th>Agent</th><th className="right">Value</th></tr>
              </thead>
              <tbody>
                {DEV_DATA.buyers.map((b, i) => (
                  <tr key={i}>
                    <td className="row" style={{ gap: 10 }}>
                      <Avatar name={b.name} color={["var(--terra)","var(--olive)","var(--sea)","var(--ink-deep)","var(--terra-deep)"][i]} size={28} />
                      <strong style={{ fontWeight: 500 }}>{b.name}</strong>
                    </td>
                    <td className="mono">{b.unit}</td>
                    <td>
                      <Pill tone={
                        b.stage === "Reservation" ? "neutral" :
                        b.stage === "SPA signed" ? "olive" :
                        b.stage === "Down-payment" ? "terra" : "success"
                      }>{b.stage}</Pill>
                    </td>
                    <td className="muted">{b.agent}</td>
                    <td className="right mono tnum">${b.amount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="col-4">
          <div className="card" style={{ height: "100%" }}>
            <div className="card-header">
              <div className="card-title">Funnel · all projects</div>
            </div>
            {[
              { l: "Leads", v: 124, max: 124, c: "var(--sand)" },
              { l: "Qualified", v: 68, max: 124, c: "var(--sea)" },
              { l: "Reserved", v: 18, max: 124, c: "var(--olive)" },
              { l: "SPA signed", v: 14, max: 124, c: "var(--terra)" },
              { l: "Closed", v: 6, max: 124, c: "var(--ink-deep)" },
            ].map((s, i) => (
              <div key={i} style={{ marginTop: 14 }}>
                <div className="row between" style={{ marginBottom: 6 }}>
                  <span style={{ fontSize: 12.5 }}>{s.l}</span>
                  <span className="mono tnum" style={{ fontSize: 12.5, fontWeight: 500 }}>{s.v}</span>
                </div>
                <HBar value={s.v} max={s.max} color={s.c} height={8} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function DevAgents() {
  return (
    <>
      <PageHeader
        eyebrow="AI"
        title="Agent "
        accent="roster."
        sub="Specialised assistants that watch the build cycle and surface decisions."
      />
      <div className="grid g-3">
        {DEV_DATA.agents.map((a, i) => (
          <div key={i} className="card" style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 220 }}>
            <div className="row between">
              <div style={{ width: 40, height: 40, borderRadius: 14, background:
                a.status === "live" ? "var(--ink-deep)" : a.status === "beta" ? "var(--terra-soft)" : "var(--surface-sunken)",
                color: a.status === "live" ? "#fff" : a.status === "beta" ? "var(--terra-deep)" : "var(--ink-3)",
                display: "grid", placeItems: "center" }}>
                <Icon.Robot size={18} />
              </div>
              <Pill tone={a.status === "live" ? "success" : a.status === "beta" ? "warning" : "neutral"}>
                {a.status}
              </Pill>
            </div>
            <div>
              <div className="serif" style={{ fontSize: 22, letterSpacing: "-0.01em", lineHeight: 1.15 }}>{a.name}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{a.role}</div>
            </div>
            <div className="spacer" />
            <div className="row between" style={{ paddingTop: 8, borderTop: "1px solid var(--line-2)" }}>
              <span className="muted" style={{ fontSize: 11 }}>{a.run}</span>
              {a.conf != null && <span className="mono tnum" style={{ fontSize: 11 }}>conf {a.conf}</span>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function DevStub({ title }) {
  return (
    <>
      <PageHeader
        eyebrow="Development OS"
        title={title}
        sub="Section ready · live data and detailed views will land here next."
      />
      <div className="grid g-4">
        <KpiCard tone="warm" label="Items" value="—" />
        <KpiCard tone="terra" label="Active" value="—" />
        <KpiCard tone="olive" label="This week" value="—" />
        <KpiCard tone="sea" label="Open issues" value="—" />
      </div>
      <div className="card" style={{ minHeight: 260, display: "grid", placeItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div className="serif" style={{ fontSize: 28, color: "var(--ink-3)" }}>{title}</div>
          <div className="muted" style={{ marginTop: 8 }}>This page in the prototype is a placeholder for the {title.toLowerCase()} cabinet.</div>
        </div>
      </div>
    </>
  );
}

function DevInvestors() {
  const investors = [
    { name: "Saba Capital Partners", commit: 1200000, called: 820000, units: 6, project: "Enso Saba", irr: 18.4, status: "active" },
    { name: "Anantya Holdings PTE", commit: 900000, called: 640000, units: 5, project: "Anantya Seseh", irr: 22.1, status: "active" },
    { name: "M. Hartono", commit: 480000, called: 320000, units: 2, project: "Bamboo Bingin", irr: 16.8, status: "active" },
    { name: "Bamboo Ventures Ltd", commit: 720000, called: 480000, units: 4, project: "Bamboo Bingin", irr: 14.2, status: "active" },
    { name: "Sky Trustees", commit: 600000, called: 240000, units: 3, project: "Enso Saba", irr: null, status: "pending" },
  ];
  const totalCommit = investors.reduce((a, b) => a + b.commit, 0);
  const totalCalled = investors.reduce((a, b) => a + b.called, 0);
  return (
    <>
      <PageHeader eyebrow="Investors" title="Capital " accent="partners"
        sub={`${investors.length} LPs · $${(totalCommit/1e6).toFixed(2)}M committed · $${(totalCalled/1e6).toFixed(2)}M called`}
        actions={<>
          <button className="btn btn-ghost"><Icon.Download className="icon" /> Statements</button>
          <button className="cta-pill">Capital call <span className="arrow"><Icon.ArrowR size={14} /></span></button>
        </>}
      />
      <div className="grid g-4">
        <KpiCard tone="terra" label="Committed capital" value="$3.90M" sub="across 5 LPs" />
        <KpiCard tone="olive" label="Called capital" value="$2.50M" sub={<Pill tone="success">64% deployed</Pill>} />
        <KpiCard tone="sea" label="Avg target IRR" value="17.9%" sub="weighted by commit" />
        <KpiCard tone="sand" label="Next distribution" value="Jul 2026" sub="$240K estimated" />
      </div>
      <div className="grid g-12">
        <div className="col-8">
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div className="card-header" style={{ padding: 20, marginBottom: 0 }}>
              <div className="card-title">Cap table</div>
              <div className="filterbar"><span className="chip active">All</span><span className="chip">Active</span><span className="chip">Pending</span></div>
            </div>
            <table className="tbl">
              <thead><tr><th>Investor</th><th>Project</th><th>Units</th><th>Commit</th><th>Called</th><th>IRR</th><th>Status</th></tr></thead>
              <tbody>
                {investors.map(i => (
                  <tr key={i.name}>
                    <td className="row" style={{ gap: 10 }}><Avatar name={i.name} color="var(--terra)" size={28} /><strong style={{ fontWeight: 500 }}>{i.name}</strong></td>
                    <td className="muted">{i.project}</td>
                    <td className="mono tnum">{i.units}</td>
                    <td className="mono tnum">${(i.commit/1000).toFixed(0)}K</td>
                    <td className="mono tnum">${(i.called/1000).toFixed(0)}K</td>
                    <td className="mono tnum">{i.irr ? `${i.irr}%` : "—"}</td>
                    <td><Pill tone={i.status === "active" ? "success" : "warning"}>{i.status}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="col-4">
          <div className="card" style={{ height: "100%" }}>
            <div className="card-header"><div className="card-title">Calls vs distributions · 2026</div></div>
            <BarChart data={[280,180,240,360,320,420,180,240,360,420,500,640]} labels={["Jan","","Mar","","May","","Jul","","Sep","","Nov",""]} height={140} color="var(--terra)" highlight={4} />
            <div className="row between" style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line-2)" }}>
              <div><div className="muted" style={{ fontSize: 11 }}>YTD called</div><div className="serif tnum" style={{ fontSize: 22 }}>$1.38M</div></div>
              <div><div className="muted" style={{ fontSize: 11 }}>YTD distributed</div><div className="serif tnum" style={{ fontSize: 22 }}>$420K</div></div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function DevBoQ() {
  const items = [
    { code: "01.010", section: "Site works", desc: "Site clearance and grading", qty: 1200, unit: "m²", rate: 18, total: 21600, variance: 2.4 },
    { code: "02.110", section: "Substructure", desc: "Strip foundations, C25", qty: 184, unit: "m³", rate: 245, total: 45080, variance: -1.8 },
    { code: "03.230", section: "Frame", desc: "Reinforced concrete columns", qty: 92, unit: "m³", rate: 320, total: 29440, variance: 0.4 },
    { code: "04.110", section: "External walls", desc: "AAC blockwork incl. render", qty: 1860, unit: "m²", rate: 38, total: 70680, variance: 5.1 },
    { code: "05.220", section: "Roof", desc: "Engineered timber + ipe shingle", qty: 420, unit: "m²", rate: 220, total: 92400, variance: -0.6 },
    { code: "06.140", section: "Internal finishes", desc: "Travertine floor · 600x600", qty: 580, unit: "m²", rate: 145, total: 84100, variance: 4.2 },
    { code: "07.310", section: "MEP", desc: "VRV system · 12 cassettes", qty: 12, unit: "ea", rate: 5200, total: 62400, variance: 1.8 },
  ];
  return (
    <>
      <PageHeader eyebrow="Quantity Survey" title="Bill of " accent="quantities"
        sub="Live BoQ for Anantya Seseh · Phase 1 · 8 units."
        actions={<>
          <button className="btn btn-ghost"><Icon.Download className="icon" /> Export XLSX</button>
          <button className="cta-pill">Re-run cost model <span className="arrow"><Icon.Sparkles size={14} /></span></button>
        </>}
      />
      <div className="grid g-4">
        <KpiCard tone="terra" label="Total contract" value="$1.86M" sub="across 7 sections" />
        <KpiCard tone="olive" label="Variance to baseline" value="+2.1%" sub={<Pill tone="warning">amber</Pill>} />
        <KpiCard tone="sea" label="Line items" value="184" sub="7 sections" />
        <KpiCard tone="sand" label="Last re-run" value="2h ago" sub="QS Cost Analyst" />
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="card-header" style={{ padding: 20, marginBottom: 0 }}>
          <div className="card-title">BoQ line items</div>
          <div className="filterbar"><span className="chip active">Top sections</span><span className="chip">Variance &gt; 3%</span><span className="chip">Material</span></div>
        </div>
        <table className="tbl">
          <thead><tr><th>Code</th><th>Section</th><th>Description</th><th className="right">Qty</th><th>Unit</th><th className="right">Rate</th><th className="right">Total</th><th className="right">Variance</th></tr></thead>
          <tbody>
            {items.map(it => (
              <tr key={it.code}>
                <td className="mono">{it.code}</td>
                <td><Pill tone="terra">{it.section}</Pill></td>
                <td>{it.desc}</td>
                <td className="right mono tnum">{it.qty.toLocaleString()}</td>
                <td className="mono">{it.unit}</td>
                <td className="right mono tnum">${it.rate}</td>
                <td className="right mono tnum">${it.total.toLocaleString()}</td>
                <td className="right"><Pill tone={Math.abs(it.variance) > 3 ? "warning" : it.variance < 0 ? "success" : "neutral"}>{it.variance > 0 ? "+" : ""}{it.variance}%</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function DevQAQC() {
  const inspections = [
    { id: "QA-2026-184", villa: "AS-12", item: "MEP rough-in · ground floor", inspector: "I. Pratama", state: "pass", date: "Today", notes: 0 },
    { id: "QA-2026-183", villa: "AS-04", item: "Travertine sub-base", inspector: "I. Pratama", state: "pass", date: "Today", notes: 2 },
    { id: "QA-2026-182", villa: "EV-07", item: "Pool waterproofing", inspector: "K. Sutrisno", state: "fail", date: "Yesterday", notes: 4 },
    { id: "QA-2026-181", villa: "BV-09", item: "Joinery — kitchen V09", inspector: "M. Putra", state: "pass", date: "Yesterday", notes: 1 },
    { id: "QA-2026-180", villa: "AS-12", item: "Foundation rebar", inspector: "I. Pratama", state: "pass", date: "May 14", notes: 0 },
    { id: "QA-2026-179", villa: "ES-S6", item: "Pool deck pour readiness", inspector: "K. Sutrisno", state: "rework", date: "May 14", notes: 3 },
  ];
  return (
    <>
      <PageHeader eyebrow="Quality" title="Inspection " accent="register"
        sub="QA / QC inspections across active projects."
        actions={<button className="cta-pill">New inspection <span className="arrow"><Icon.Plus size={14} /></span></button>}
      />
      <div className="grid g-4">
        <KpiCard tone="terra" label="Pass rate · 30d" value="97%" sub="29 of 30 inspections" />
        <KpiCard tone="olive" label="Open NCRs" value="4" sub={<Pill tone="warning">1 critical</Pill>} />
        <KpiCard tone="sea" label="Inspections · today" value="6" sub="4 done · 2 due" />
        <KpiCard tone="sand" label="Avg close-out" value="1.8 days" sub={<Pill tone="success">▼ 0.4d</Pill>} />
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="card-header" style={{ padding: 20, marginBottom: 0 }}>
          <div className="card-title">Recent inspections</div>
          <div className="filterbar"><span className="chip active">All</span><span className="chip">Pass</span><span className="chip">Fail</span><span className="chip">Rework</span></div>
        </div>
        <table className="tbl">
          <thead><tr><th>Ref</th><th>Villa</th><th>Item</th><th>Inspector</th><th>Date</th><th>Notes</th><th>Status</th></tr></thead>
          <tbody>
            {inspections.map(i => (
              <tr key={i.id}>
                <td className="mono">{i.id}</td>
                <td className="mono">{i.villa}</td>
                <td><strong style={{ fontWeight: 500 }}>{i.item}</strong></td>
                <td className="muted">{i.inspector}</td>
                <td className="muted">{i.date}</td>
                <td className="mono tnum">{i.notes}</td>
                <td><Pill tone={i.state === "pass" ? "success" : i.state === "fail" ? "danger" : "warning"}>{i.state}</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function DevDrawings() {
  const sets = [
    { code: "A-100", title: "Site plan", rev: "Rev D", date: "12 May", state: "current", disc: "Architectural" },
    { code: "A-201", title: "Ground floor plan", rev: "Rev C", date: "08 May", state: "current", disc: "Architectural" },
    { code: "A-202", title: "First floor plan", rev: "Rev C", date: "08 May", state: "current", disc: "Architectural" },
    { code: "A-401", title: "Sections AA-BB", rev: "Rev B", date: "30 Apr", state: "current", disc: "Architectural" },
    { code: "S-301", title: "Slab reinforcement L1", rev: "Rev B", date: "06 May", state: "current", disc: "Structural" },
    { code: "M-501", title: "VRV layout typical", rev: "Rev A", date: "02 May", state: "review", disc: "Mechanical" },
    { code: "E-601", title: "Lighting layout typical", rev: "Rev A", date: "02 May", state: "review", disc: "Electrical" },
    { code: "L-701", title: "Landscape masterplan", rev: "Rev A", date: "28 Apr", state: "current", disc: "Landscape" },
  ];
  return (
    <>
      <PageHeader eyebrow="Drawings" title="Drawing " accent="register"
        sub="Current revisions across disciplines."
        actions={<>
          <button className="btn btn-ghost"><Icon.Download className="icon" /> Export</button>
          <button className="cta-pill">Upload revision <span className="arrow"><Icon.Plus size={14} /></span></button>
        </>}
      />
      <div className="grid g-4">
        <KpiCard tone="terra" label="Active drawings" value="184" sub="across 5 disciplines" />
        <KpiCard tone="olive" label="In review" value="6" sub="MEP discipline" />
        <KpiCard tone="sea" label="Open RFIs" value="11" sub={<Pill tone="warning">2 critical</Pill>} />
        <KpiCard tone="sand" label="Last upload" value="2h ago" sub="A-201 Rev C" />
      </div>
      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        <span className="chip active">All disciplines</span>
        <span className="chip">Architectural</span>
        <span className="chip">Structural</span>
        <span className="chip">Mechanical</span>
        <span className="chip">Electrical</span>
        <span className="chip">Landscape</span>
      </div>
      <div className="grid g-4">
        {sets.map(s => (
          <div key={s.code} className="card sm" style={{ cursor: "pointer" }}>
            <div style={{ aspectRatio: "4/3", borderRadius: 14, border: "1px solid var(--line)", background: "repeating-linear-gradient(135deg, var(--surface-warm) 0 6px, var(--surface) 6px 8px)", display: "grid", placeItems: "center", marginBottom: 10 }}>
              <span className="mono muted" style={{ fontSize: 11 }}>{s.code}</span>
            </div>
            <div className="row between">
              <div>
                <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{s.code}</span>
                <div style={{ fontSize: 13.5, fontWeight: 500, marginTop: 2 }}>{s.title}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>{s.disc}</div>
              </div>
              <Pill tone={s.state === "current" ? "success" : "warning"}>{s.rev}</Pill>
            </div>
            <div className="row between" style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line-2)" }}>
              <span className="muted" style={{ fontSize: 11 }}>{s.date}</span>
              <button className="btn btn-quiet">Open <Icon.ArrowR className="icon" /></button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function DevBanking() {
  const accounts = [
    { name: "Operating · IDR", bank: "BCA", iban: "•••• 8214", balance: "Rp 12.84B", trend: [8,9,10,11,12,11,13,12,12.84] },
    { name: "Escrow · USD", bank: "DBS Singapore", iban: "•••• 4012", balance: "$1.42M", trend: [0.8,1.0,1.1,1.3,1.4,1.42] },
    { name: "Capex · USD", bank: "DBS Singapore", iban: "•••• 4013", balance: "$842K", trend: [1.1,1.0,0.95,0.88,0.842] },
    { name: "Sales receipts · IDR", bank: "Mandiri", iban: "•••• 6201", balance: "Rp 3.18B", trend: [1.4,1.8,2.2,2.6,2.9,3.18] },
  ];
  const txns = [
    { d: "16 May", from: "Saba Stone & Tile", to: "Capex · USD", amt: "−$84,200", type: "vendor" },
    { d: "16 May", from: "Buyer · T. Aoki (ENSO-12 res.)", to: "Escrow · USD", amt: "+$12,000", type: "incoming" },
    { d: "15 May", from: "BaliPro MEP · stage 1", to: "Capex · USD", amt: "−$62,400", type: "vendor" },
    { d: "15 May", from: "Capital call · Saba Capital", to: "Capex · USD", amt: "+$240,000", type: "call" },
    { d: "14 May", from: "Salaries · May 2nd half", to: "Operating · IDR", amt: "−Rp 248M", type: "payroll" },
    { d: "13 May", from: "BCA · interest", to: "Operating · IDR", amt: "+Rp 4.2M", type: "incoming" },
  ];
  return (
    <>
      <PageHeader eyebrow="Banking" title="Accounts & " accent="transactions"
        sub="Live balances across operating, escrow, and capex accounts."
        actions={<>
          <button className="btn btn-ghost"><Icon.Download className="icon" /> Export ledger</button>
          <button className="cta-pill">Initiate transfer <span className="arrow"><Icon.ArrowR size={14} /></span></button>
        </>}
      />
      <div className="grid g-4">
        {accounts.map((a, i) => (
          <div key={i} className={`card ${i === 0 ? "tone-ink-warm" : "tone-warm"}`}>
            <div className="row between">
              <div>
                <div className={`kpi-label ${i === 0 ? "" : ""}`}>{a.name}</div>
                <div className="muted" style={{ fontSize: 11, marginTop: 2, color: i === 0 ? "rgba(255,255,255,0.5)" : "" }}>{a.bank} · {a.iban}</div>
              </div>
              <Icon.Bank size={18} color={i === 0 ? "rgba(255,255,255,0.6)" : "var(--ink-3)"} />
            </div>
            <div className="serif" style={{ fontSize: 30, letterSpacing: "-0.02em", marginTop: 12, color: i === 0 ? "#fff" : "var(--ink)" }}>{a.balance}</div>
            <div style={{ marginTop: 10 }}>
              <Sparkline data={a.trend} color={i === 0 ? "oklch(0.85 0.10 50)" : "var(--terra)"} height={36} />
            </div>
          </div>
        ))}
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="card-header" style={{ padding: 20, marginBottom: 0 }}>
          <div className="card-title">Recent transactions</div>
          <div className="filterbar"><span className="chip active">All</span><span className="chip">Incoming</span><span className="chip">Outgoing</span></div>
        </div>
        <table className="tbl">
          <thead><tr><th>Date</th><th>Counterparty</th><th>Account</th><th>Type</th><th className="right">Amount</th></tr></thead>
          <tbody>
            {txns.map((t, i) => (
              <tr key={i}>
                <td className="mono muted">{t.d}</td>
                <td><strong style={{ fontWeight: 500 }}>{t.from}</strong></td>
                <td className="muted">{t.to}</td>
                <td><Pill tone={t.type === "incoming" || t.type === "call" ? "success" : t.type === "vendor" ? "terra" : "neutral"}>{t.type}</Pill></td>
                <td className="right mono tnum" style={{ color: t.amt.startsWith("−") ? "var(--ink)" : "var(--success)", fontWeight: 500 }}>{t.amt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function DevelopmentApp({ route }) {
  switch (route) {
    case "command":     return <DevCommand />;
    case "projects":    return <DevProjects />;
    case "cashflow":    return <DevCashflow />;
    case "investors":   return <DevInvestors />;
    case "boq":         return <DevBoQ />;
    case "procurement": return <DevProcurement />;
    case "qaqc":        return <DevQAQC />;
    case "drawings":    return <DevDrawings />;
    case "sales":       return <DevSales />;
    case "banking":     return <DevBanking />;
    case "ai":          return <DevAgents />;
    default:            return <DevStub title={
      (APP_DEFS.dev.nav.find(n => n.id === route) || {}).label || "Section"
    } />;
  }
}

window.DevelopmentApp = DevelopmentApp;
