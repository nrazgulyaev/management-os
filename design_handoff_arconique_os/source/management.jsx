/* Management OS — Hospitality cabinet pages */

// ---- Mock data ----
const MGMT_DATA = {
  user: { firstName: "Nikita", role: "Owner" },
  villaCount: 24,
  occupiedTonight: 19,
  upcomingCheckIns14d: 31,
  openTickets: 7,
  mtdRevenueIDR: 8.42, // billions
  occupancyYTD: 76.4,
  occupancyDelta: 4.2,
  revenueDelta: 12.6,
  revenueSeries: [
    { m: "Nov", v: 5.84 }, { m: "Dec", v: 6.21 }, { m: "Jan", v: 7.45 },
    { m: "Feb", v: 7.92 }, { m: "Mar", v: 8.66 }, { m: "Apr", v: 9.12 },
  ],
  villaSeries: [11, 13, 12, 15, 17, 18, 19, 21, 22, 24, 22, 24],
  topVillas: [
    { code: "EV-07", name: "Enso Villa 07", project: "Enso Saba", occ: 92.4 },
    { code: "EV-03", name: "Enso Villa 03", project: "Enso Saba", occ: 89.8 },
    { code: "AS-12", name: "Anantya 12", project: "Anantya Seseh", occ: 88.5 },
    { code: "ES-S6", name: "Enso Sky 06", project: "Enso Saba", occ: 86.1 },
    { code: "BV-09", name: "Bamboo 09", project: "Bamboo Bingin", occ: 84.9 },
  ],
  villas: [
    { code: "EV-07", name: "Enso Villa 07", project: "Enso Saba", status: "occupied", mtd: 480, nights: 22 },
    { code: "EV-03", name: "Enso Villa 03", project: "Enso Saba", status: "turnover", mtd: 412, nights: 19 },
    { code: "AS-12", name: "Anantya 12", project: "Anantya Seseh", status: "occupied", mtd: 396, nights: 21 },
    { code: "ES-S6", name: "Enso Sky 06", project: "Enso Saba", status: "maintenance", mtd: 312, nights: 16 },
    { code: "BV-09", name: "Bamboo 09", project: "Bamboo Bingin", status: "occupied", mtd: 388, nights: 20 },
    { code: "AS-04", name: "Anantya 04", project: "Anantya Seseh", status: "vacant", mtd: 244, nights: 12 },
    { code: "EV-11", name: "Enso Villa 11", project: "Enso Saba", status: "occupied", mtd: 422, nights: 18 },
    { code: "BV-03", name: "Bamboo 03", project: "Bamboo Bingin", status: "blocked", mtd: 110, nights: 4 },
  ],
  schedule: [
    { time: "10:30", title: "EV-07 · Turnover", meta: "Putu A. · 22/28 items", tone: "warning", tag: "Awaiting approval" },
    { time: "11:15", title: "AS-04 · Deep clean", meta: "Ketut B. · 8/16 items", tone: "info", tag: "In progress" },
    { time: "12:00", title: "ES-S6 · Pool repair", meta: "Maintenance · Wayan C.", tone: "danger", tag: "P1" },
    { time: "14:00", title: "AS-12 · Check-in", meta: "M. & L. Tanaka · 4 nights", tone: "olive", tag: "Confirmed" },
    { time: "15:30", title: "EV-07 · Check-in", meta: "S. Reynolds party · 6 nights", tone: "warning", tag: "At risk" },
    { time: "16:45", title: "BV-09 · Concierge", meta: "Sunset dinner, Uluwatu", tone: "neutral", tag: "Scheduled" },
  ],
  notifications: [
    { from: "Maintenance · ES-S6", body: "Pool pump failure — vendor ETA Friday", time: "2h ago" },
    { from: "Housekeeping · EV-07", body: "22/28 items · awaiting supervisor", time: "32m ago" },
    { from: "Finance", body: "7 owner payouts queued · Rp 742M", time: "now" },
    { from: "Channels · Booking.com", body: "Rate parity warning on EV-11", time: "1h ago" },
    { from: "Guest · S. Reynolds", body: "Asking about late check-in", time: "12m ago" },
  ],
  bookings: [
    { id: "RES-2841", guest: "M. & L. Tanaka", villa: "AS-12", checkin: "Today", nights: 4, channel: "Direct", value: 1820, status: "confirmed" },
    { id: "RES-2840", guest: "S. Reynolds party", villa: "EV-07", checkin: "Today", nights: 6, channel: "Booking.com", value: 3640, status: "at-risk" },
    { id: "RES-2839", guest: "A. Voss", villa: "BV-09", checkin: "Tomorrow", nights: 3, channel: "Airbnb", value: 1290, status: "confirmed" },
    { id: "RES-2838", guest: "J. Park", villa: "EV-11", checkin: "Sat", nights: 7, channel: "Direct", value: 4480, status: "confirmed" },
    { id: "RES-2837", guest: "Ono family", villa: "AS-04", checkin: "Sat", nights: 5, channel: "Expedia", value: 2150, status: "pending" },
    { id: "RES-2836", guest: "P. Walsh", villa: "ES-S6", checkin: "Mon", nights: 4, channel: "Direct", value: 2080, status: "blocked" },
  ],
};

// ---- Pages ----

function MgmtOverview() {
  const d = MGMT_DATA;
  return (
    <>
      {/* Hero — reference greeting bar */}
      <div className="hero-greet">
        <div className="row" style={{ gap: 18, flexWrap: "wrap" }}>
          <div className="date-badge">
            <div className="num serif">16</div>
            <div className="lbl"><strong>Thu, May</strong>Week 20 · 2026</div>
          </div>
          <button className="cta-pill" onClick={() => alert("Opens today's task board")}>
            Show my tasks
            <span className="arrow"><Icon.ArrowR size={14} /></span>
          </button>
          <button className="icon-btn"><Icon.Calendar size={16} /><span className="dot" /></button>
        </div>
        <div className="hero-ai">
          <div className="greet">Hey, <em>{d.user.firstName}</em>.</div>
          <div className="prompt">Just ask me anything!</div>
        </div>
        <button className="big-mic"><Icon.Mic size={26} /></button>
      </div>

      {/* Hero row — KPI · revenue area · profile */}
      <div className="grid g-12">
        <div className="col-3">
          <KpiCard tone="ink-warm" hero
            label="Villas under management"
            value={d.villaCount}
            sub={<><Pill tone="success"><span className="dot" />{d.occupiedTonight} occupied tonight</Pill></>}
            sparkData={d.villaSeries}
            sparkColor="oklch(0.85 0.10 50)"
          />
        </div>

        <div className="col-6">
          <div className="card" style={{ padding: 24 }}>
            <div className="card-header">
              <div>
                <div className="card-title">Revenue · last 6 months</div>
                <div className="card-sub">Monthly · IDR billions</div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <span className="score-chip">▲ {d.revenueDelta}% YoY</span>
                <div className="tabs">
                  <span className="tab">6M</span>
                  <span className="tab active">12M</span>
                  <span className="tab">YTD</span>
                </div>
              </div>
            </div>
            <AreaChart
              data={d.revenueSeries.map(r => ({ value: r.v }))}
              labels={d.revenueSeries.map(r => r.m)}
              color="var(--terra)"
              height={220}
              pinIndex={5}
              pinLabel={`Rp ${d.revenueSeries[5].v.toFixed(2)}B`}
            />
            <div className="row" style={{ gap: 18, marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line-2)" }}>
              <div>
                <div className="muted" style={{ fontSize: 11 }}>MTD</div>
                <div className="big-stat"><span className="currency">Rp</span> {d.mtdRevenueIDR}<span className="unit">B</span></div>
              </div>
              <div>
                <div className="muted" style={{ fontSize: 11 }}>ADR</div>
                <div className="big-stat"><span className="currency">Rp</span> 4.2<span className="unit">M</span></div>
              </div>
              <div>
                <div className="muted" style={{ fontSize: 11 }}>RevPAR</div>
                <div className="big-stat"><span className="currency">Rp</span> 3.1<span className="unit">M</span></div>
              </div>
              <div className="spacer" />
              <button className="btn btn-quiet">Open finance <Icon.ArrowUR className="icon" /></button>
            </div>
          </div>
        </div>

        <div className="col-3">
          <div className="card tone-warm" style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%" }}>
            <div className="row" style={{ gap: 10 }}>
              <Avatar name={`${d.user.firstName} R`} color="linear-gradient(135deg, var(--terra), var(--terra-deep))" size={44} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{d.user.firstName} R.</div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{d.user.role} · Arconique</div>
              </div>
              <div className="spacer" />
              <Pill tone="ink">ARC</Pill>
            </div>
            <div className="divider" style={{ margin: "4px 0" }} />
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ink-3)" }}>Top-occupancy villas</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {d.topVillas.slice(0, 4).map(v => (
                <div key={v.code} className="row" style={{ gap: 10 }}>
                  <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", width: 42, flexShrink: 0 }}>{v.code}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.name}</div>
                    <HBar value={v.occ} color="var(--terra)" />
                  </div>
                  <div className="mono tnum" style={{ fontSize: 11.5, fontWeight: 500 }}>{v.occ.toFixed(1)}%</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Reference-style row: dome donut · 13-days · sparkline-stocks */}
      <div className="grid g-12">
        <div className="col-3">
          <div className="card tone-warm" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <div className="card-header" style={{ width: "100%", marginBottom: 0 }}>
              <div className="card-title">Occupancy growth</div>
              <Pill tone="success">▲ {d.occupancyDelta}%</Pill>
            </div>
            <DomeDonut value={36} label="Growth rate" />
          </div>
        </div>
        <div className="col-3">
          <div className="card tone-warm" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="card-header" style={{ marginBottom: 0 }}>
              <div className="row" style={{ gap: 8 }}>
                <div className="icon-btn" style={{ width: 32, height: 32 }}><Icon.Calendar size={14} /></div>
                <div>
                  <div className="serif" style={{ fontSize: 34, letterSpacing: "-0.02em", lineHeight: 1 }}>13 Days</div>
                  <div className="muted" style={{ fontSize: 11 }}>109 hours · 23 minutes left in cycle</div>
                </div>
              </div>
            </div>
            <div className="dot-timeline">
              {Array.from({ length: 26 }).map((_, i) => (
                <span key={i} className={i >= 13 ? "dim" : ""} />
              ))}
            </div>
            <div className="muted" style={{ fontSize: 11 }}>Owner payout cycle resets in 13 days</div>
          </div>
        </div>
        <div className="col-3">
          <div className="card tone-warm">
            <div className="card-header" style={{ marginBottom: 4 }}>
              <div>
                <div className="card-title">Cash position</div>
                <div className="card-sub">Operating account</div>
              </div>
              <Pill tone="success">+9.3%</Pill>
            </div>
            <div className="big-stat" style={{ marginTop: 4 }}><span className="currency">$</span> 16,073<span className="unit">.49</span></div>
            <WiggleLine data={[16,18,15,19,17,21,19,24,22,27,25,29,27,31,28,33]} color="var(--terra)" height={70} />
            <div className="row between" style={{ marginTop: 6 }}>
              <span className="muted" style={{ fontSize: 11 }}>Trailing 30d</span>
              <button className="btn btn-quiet">Open <Icon.ArrowR className="icon" /></button>
            </div>
          </div>
        </div>
        <div className="col-3">
          <div className="card tone-warm">
            <div className="card-header">
              <div className="card-title">Review rating</div>
              <button className="icon-btn" style={{ width: 28, height: 28 }}><Icon.Plus size={12} /></button>
            </div>
            <div className="serif" style={{ fontSize: 22, letterSpacing: "-0.01em", lineHeight: 1.15 }}>How is your guest experience going?</div>
            <div className="smiles">
              {[0,1,2,3,4].map(i => (
                <div key={i} className={`face ${i === 4 ? "active" : ""}`}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    {i === 0 && <><circle cx="9" cy="10" r="0.6"/><circle cx="15" cy="10" r="0.6"/><path d="M9 15c1 -1.5 5 -1.5 6 0"/></>}
                    {i === 1 && <><circle cx="9" cy="10" r="0.6"/><circle cx="15" cy="10" r="0.6"/><path d="M9 16c1 -0.5 5 -0.5 6 0"/></>}
                    {i === 2 && <><circle cx="9" cy="10" r="0.6"/><circle cx="15" cy="10" r="0.6"/><path d="M9 15h6"/></>}
                    {i === 3 && <><circle cx="9" cy="10" r="0.6"/><circle cx="15" cy="10" r="0.6"/><path d="M9 14.5c1 1 5 1 6 0"/></>}
                    {i === 4 && <><circle cx="9" cy="10" r="0.6"/><circle cx="15" cy="10" r="0.6"/><path d="M9 14c1 2 5 2 6 0"/></>}
                  </svg>
                </div>
              ))}
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>92% guests rated above 4 stars · last 30 days</div>
          </div>
        </div>
      </div>

      {/* Small KPI strip */}
      <div className="grid g-4">
        <div className="card tone-olive">
          <div className="kpi-label">Active bookings</div>
          <div className="serif kpi-value compact">{d.occupiedTonight}<span style={{ fontSize: 22, color: "var(--ink-3)" }}>/{d.villaCount}</span></div>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <Pill tone="success">▲ 2 vs last week</Pill>
          </div>
        </div>
        <div className="card tone-terra">
          <div className="kpi-label">MTD revenue</div>
          <div className="serif kpi-value compact">Rp {d.mtdRevenueIDR}B</div>
          <div className="kpi-meta" style={{ marginTop: 8 }}>
            <Pill tone="success">▲ {d.revenueDelta}% YoY</Pill>
            <span>vs Rp 7.48B</span>
          </div>
        </div>
        <div className="card tone-sea">
          <div className="kpi-label">Upcoming check-ins · 14d</div>
          <div className="serif kpi-value compact">{d.upcomingCheckIns14d}</div>
          <div className="kpi-meta" style={{ marginTop: 8 }}>
            <Pill tone="sea">5 today</Pill>
            <span>13 weekend</span>
          </div>
        </div>
        <div className="card tone-sand">
          <div className="kpi-label">Open tickets</div>
          <div className="row" style={{ alignItems: "baseline", gap: 8 }}>
            <div className="serif kpi-value compact">{d.openTickets}</div>
            <Pill tone="warning">SLA</Pill>
          </div>
          <div className="kpi-meta" style={{ marginTop: 8 }}>
            <span>2 P1 · 3 P2 · 2 P3</span>
          </div>
        </div>
      </div>

      {/* Schedule + Notifications */}
      <div className="grid g-12">
        <div className="col-8">
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Today's schedule</div>
                <div className="card-sub">Housekeeping turnovers · maintenance · arrivals, in order.</div>
              </div>
              <button className="btn btn-quiet">Open ops board <Icon.ArrowUR className="icon" /></button>
            </div>
            <div className="list">
              {d.schedule.map((row, i) => (
                <div className="list-row" key={i}>
                  <span className="time">{row.time}</span>
                  <div className="info">
                    <div className="t">{row.title}</div>
                    <div className="s">{row.meta}</div>
                  </div>
                  <Pill tone={row.tone}>{row.tag}</Pill>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="col-4">
          <div className="card" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div className="card-header">
              <div>
                <div className="card-title">Notifications</div>
                <div className="card-sub">Latest {d.notifications.length}</div>
              </div>
              <Pill tone="terra">{d.notifications.length} new</Pill>
            </div>
            <div className="list" style={{ flex: 1 }}>
              {d.notifications.map((n, i) => (
                <div className="list-row" key={i}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: i % 2 ? "var(--olive-soft)" : "var(--terra-soft)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                    <Icon.Bell size={13} color={i % 2 ? "var(--olive-deep)" : "var(--terra-deep)"} />
                  </div>
                  <div className="info">
                    <div className="t" style={{ fontSize: 12.5 }}>{n.from}</div>
                    <div className="s">{n.body}</div>
                  </div>
                  <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{n.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Concentric annual profits + Operations Copilot + Donut */}
      <div className="grid g-12">
        <div className="col-4">
          <div className="card bubble-card" style={{ minHeight: 380 }}>
            <div className="card-header" style={{ width: "100%", marginBottom: 0 }}>
              <div>
                <div className="card-title">Annual profit</div>
                <div className="card-sub">By project, 2026</div>
              </div>
              <div className="filterbar"><span className="chip active">2026</span><span className="chip">2025</span></div>
            </div>
            <ConcentricBubbles rings={[
              { label: "14K", value: 100 },
              { label: "9.3K", value: 76 },
              { label: "6.8K", value: 52 },
              { label: "4K", value: 30 },
            ]} />
          </div>
        </div>

        <div className="col-5">
          <div className="ai-panel" style={{ height: "100%" }}>
            <div className="meta">
              <Icon.Sparkles size={13} /> Operations Copilot · AM briefing
              <Pill tone="ghost" style={{ marginLeft: "auto", color: "rgba(255,255,255,0.7)", borderColor: "rgba(255,255,255,0.18)" }}>Modeled</Pill>
            </div>
            <h3>Three arrivals on the books, all on track <em>except EV-07</em>, where supervisor approval has not yet cleared.</h3>
            <p>Enso Sky 06 remains blocked on pool parts; vendor ETA Friday. I'd hold the next two Sky bookings unless we can re-route to ES-S2.</p>
            <div className="actions">
              <button className="cta-pill" onClick={() => alert('Opening Operations Copilot')}>
                Open Copilot <span className="arrow"><Icon.ArrowR size={14} /></span>
              </button>
              <button className="btn btn-onink">Clear EV-07 review</button>
            </div>
          </div>
        </div>

        <div className="col-3">
          <div className="card" style={{ height: "100%" }}>
            <div className="card-header">
              <div>
                <div className="card-title">On-time turnover</div>
                <div className="card-sub">Today's housekeeping</div>
              </div>
            </div>
            <div style={{ display: "grid", placeItems: "center", padding: "10px 0 14px" }}>
              <Donut value={11} total={14} color="var(--olive)" size={140} thickness={16} label="On time" />
            </div>
            <div className="col" style={{ gap: 8 }}>
              <div className="row" style={{ gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: "var(--olive)" }} />
                <span style={{ fontSize: 12 }}>Completed</span>
                <span className="mono tnum" style={{ marginLeft: "auto" }}>11</span>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: "var(--sea)" }} />
                <span style={{ fontSize: 12 }}>In progress</span>
                <span className="mono tnum" style={{ marginLeft: "auto" }}>2</span>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: "var(--warning)" }} />
                <span style={{ fontSize: 12 }}>Awaiting</span>
                <span className="mono tnum" style={{ marginLeft: "auto" }}>1</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Villa pulse */}
      <Section
        eyebrow="Tonight"
        title="Villa pulse"
        sub="Live from the status board. Click a card to open."
        action={<button className="cta-pill ghost">All villas <span className="arrow"><Icon.ArrowR size={14} /></span></button>}
      >
        <div className="grid g-4">
          {d.villas.slice(0, 8).map(v => (
            <div key={v.code} className="card sm" style={{ cursor: "pointer" }}>
              <div className="row between" style={{ marginBottom: 10 }}>
                <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{v.code}</span>
                <Pill tone={
                  v.status === "occupied" ? "success" :
                  v.status === "turnover" ? "olive" :
                  v.status === "maintenance" ? "danger" :
                  v.status === "blocked" ? "warning" : "neutral"
                }>{v.status}</Pill>
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>{v.name}</div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{v.project}</div>
              <div className="row between" style={{ paddingTop: 12, marginTop: 12, borderTop: "1px solid var(--line-2)" }}>
                <span className="muted" style={{ fontSize: 11 }}><Icon.Calendar size={12} /> MTD</span>
                <span className="mono tnum" style={{ fontSize: 13, fontWeight: 500 }}>Rp {v.mtd}M</span>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

function MgmtBookings() {
  const d = MGMT_DATA;
  return (
    <>
      <PageHeader
        eyebrow="Bookings"
        title="Reservations & "
        accent="calendar"
        sub="All confirmed and pending reservations across channels."
        actions={<>
          <button className="btn btn-ghost"><Icon.Filter className="icon" /> Filter</button>
          <button className="btn btn-ghost"><Icon.Download className="icon" /> Export</button>
          <button className="btn btn-accent"><Icon.Plus className="icon" /> New booking</button>
        </>}
      />
      <div className="grid g-4">
        <KpiCard tone="warm" label="Active bookings" value="142" sub={<Pill tone="success">▲ 8 this week</Pill>} />
        <KpiCard tone="terra" label="Booked nights · MTD" value="550" sub={<Pill tone="olive">76% occupancy</Pill>} />
        <KpiCard tone="sea" label="Direct share" value="48%" sub={<Pill tone="sea">▲ 6%</Pill>} />
        <KpiCard tone="olive" label="Avg booking value" value="Rp 18.4M" sub={<Pill tone="success">▲ 4.1%</Pill>} />
      </div>

      <div className="grid g-12">
        <div className="col-8">
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Bookings · Apr–May 2026</div>
                <div className="card-sub">Daily revenue, all channels</div>
              </div>
              <div className="tabs">
                <span className="tab active">Revenue</span>
                <span className="tab">Nights</span>
                <span className="tab">Pace</span>
              </div>
            </div>
            <AreaChart
              data={[160, 220, 180, 260, 310, 290, 340, 320, 380, 410, 380, 460, 420, 510].map(v => ({ value: v }))}
              labels={["Apr 1","Apr 8","Apr 15","Apr 22","Apr 29","May 6","May 13"]}
              color="var(--terra)" height={240}
            />
          </div>
        </div>
        <div className="col-4">
          <div className="card" style={{ height: "100%" }}>
            <div className="card-header">
              <div>
                <div className="card-title">Channel mix</div>
                <div className="card-sub">Last 30 days</div>
              </div>
            </div>
            <div style={{ display: "grid", placeItems: "center", padding: "8px 0 14px" }}>
              <Donut value={48} total={100} color="var(--terra)" size={130} thickness={16} label="Direct" />
            </div>
            {[
              { l: "Direct", v: 48, c: "var(--terra)" },
              { l: "Booking.com", v: 24, c: "var(--olive)" },
              { l: "Airbnb", v: 18, c: "var(--sea)" },
              { l: "Expedia", v: 10, c: "var(--sand)" },
            ].map((s, i) => (
              <div className="row" key={i} style={{ gap: 10, padding: "8px 0", borderTop: i ? "1px solid var(--line-2)" : "none" }}>
                <span style={{ width: 9, height: 9, borderRadius: 4, background: s.c }} />
                <span style={{ fontSize: 13 }}>{s.l}</span>
                <span className="spacer" />
                <span className="mono tnum" style={{ fontSize: 13, fontWeight: 500 }}>{s.v}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="card-header" style={{ padding: 20, marginBottom: 0 }}>
          <div>
            <div className="card-title">Upcoming reservations</div>
            <div className="card-sub">Next 7 days · {d.bookings.length} bookings</div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <span className="chip active">All</span>
            <span className="chip">Confirmed</span>
            <span className="chip">At risk</span>
            <span className="chip">Pending</span>
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Ref</th>
              <th>Guest</th>
              <th>Villa</th>
              <th>Check-in</th>
              <th>Nights</th>
              <th>Channel</th>
              <th className="right">Value</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {d.bookings.map(b => (
              <tr key={b.id}>
                <td className="mono">{b.id}</td>
                <td><strong style={{ fontWeight: 500 }}>{b.guest}</strong></td>
                <td className="mono">{b.villa}</td>
                <td>{b.checkin}</td>
                <td className="mono tnum">{b.nights}</td>
                <td>{b.channel}</td>
                <td className="right mono tnum">${b.value.toLocaleString()}</td>
                <td>
                  <Pill tone={b.status === "confirmed" ? "success" : b.status === "at-risk" ? "warning" : b.status === "blocked" ? "danger" : "neutral"}>
                    {b.status}
                  </Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MgmtFinance() {
  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Revenue &"
        accent="cashflow"
        sub="Owner payouts, channel fees, and live cash position across the portfolio."
        actions={<>
          <button className="btn btn-ghost"><Icon.Download className="icon" /> Statements</button>
          <button className="btn btn-accent">Run payout cycle</button>
        </>}
      />
      <div className="grid g-12">
        <div className="col-6">
          <div className="card tone-ink-warm" style={{ minHeight: 280 }}>
            <div className="card-header">
              <div className="card-title" style={{ color: "rgba(255,255,255,0.7)" }}>Net cash · operating</div>
              <Pill tone="success">▲ 18.4% MoM</Pill>
            </div>
            <div className="serif" style={{ fontSize: 64, letterSpacing: "-0.025em", lineHeight: 1, color: "#fff", margin: "8px 0 18px" }}>
              Rp 12.84<span style={{ color: "rgba(255,255,255,0.5)", fontSize: 32 }}>B</span>
            </div>
            <Sparkline data={[6.2, 7.1, 7.6, 8.4, 9.2, 8.9, 9.8, 10.4, 11.2, 11.8, 12.1, 12.84]} color="oklch(0.85 0.10 50)" height={70} />
            <div className="row" style={{ gap: 24, marginTop: 14, color: "rgba(255,255,255,0.8)", fontSize: 12 }}>
              <div><div style={{ opacity: 0.65, marginBottom: 2 }}>Inflows MTD</div><div className="mono tnum" style={{ fontSize: 16, color: "#fff" }}>Rp 8.42B</div></div>
              <div><div style={{ opacity: 0.65, marginBottom: 2 }}>Outflows MTD</div><div className="mono tnum" style={{ fontSize: 16, color: "#fff" }}>Rp 3.18B</div></div>
              <div><div style={{ opacity: 0.65, marginBottom: 2 }}>Pending payouts</div><div className="mono tnum" style={{ fontSize: 16, color: "#fff" }}>Rp 742M</div></div>
            </div>
          </div>
        </div>
        <div className="col-3">
          <KpiCard tone="terra" label="Owner payouts · queue" value="7" sub={<Pill tone="warning">Rp 742M pending</Pill>} />
          <div style={{ height: 16 }} />
          <KpiCard tone="olive" label="Channel fees · MTD" value="Rp 312M" sub={<Pill tone="neutral">3.7% of gross</Pill>} />
        </div>
        <div className="col-3">
          <KpiCard tone="sea" label="ADR" value="Rp 4.2M" sub={<Pill tone="success">▲ 6.8%</Pill>} />
          <div style={{ height: 16 }} />
          <KpiCard tone="sand" label="RevPAR" value="Rp 3.1M" sub={<Pill tone="success">▲ 11.4%</Pill>} />
        </div>
      </div>

      <div className="grid g-12">
        <div className="col-8">
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Revenue vs Plan · 2026</div>
                <div className="card-sub">Solid: actuals · Dotted: plan</div>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <Pill tone="terra"><span className="dot" /> Actual</Pill>
                <Pill tone="neutral"><span className="dot" /> Plan</Pill>
              </div>
            </div>
            <AreaChart
              data={[5.84, 6.21, 7.45, 7.92, 8.66, 9.12, 9.7, 10.2, 9.4, 8.8, 9.6, 11.2].map(v => ({ value: v }))}
              labels={["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]}
              color="var(--terra)" height={260} pinIndex={4} pinLabel="Rp 8.66B"
            />
          </div>
        </div>
        <div className="col-4">
          <div className="card" style={{ height: "100%" }}>
            <div className="card-header">
              <div>
                <div className="card-title">Owner payouts queue</div>
                <div className="card-sub">7 owners · 24 villas</div>
              </div>
            </div>
            <div className="list">
              {[
                { name: "PT Saba Lestari", villas: 6, amount: "Rp 248M" },
                { name: "Bamboo Ventures Ltd", villas: 4, amount: "Rp 162M" },
                { name: "Anantya Holdings", villas: 5, amount: "Rp 142M" },
                { name: "Sky Trustees", villas: 3, amount: "Rp 92M" },
                { name: "M. Hartono", villas: 2, amount: "Rp 58M" },
              ].map((o, i) => (
                <div className="list-row" key={i}>
                  <Avatar name={o.name} color={["var(--terra)","var(--olive)","var(--sea)","var(--ink-deep)","var(--terra-deep)"][i]} size={32} />
                  <div className="info">
                    <div className="t" style={{ fontSize: 12.5 }}>{o.name}</div>
                    <div className="s">{o.villas} villas</div>
                  </div>
                  <div className="mono tnum" style={{ fontSize: 13, fontWeight: 500 }}>{o.amount}</div>
                </div>
              ))}
            </div>
            <button className="btn btn-ghost" style={{ width: "100%", marginTop: 12, justifyContent: "center" }}>Approve all <Icon.ArrowR className="icon" /></button>
          </div>
        </div>
      </div>
    </>
  );
}

function MgmtOperations() {
  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Today's"
        accent="ops board"
        sub="Housekeeping, maintenance, and front-office tickets."
        actions={<>
          <button className="btn btn-ghost"><Icon.Filter className="icon" /> Filters</button>
          <button className="btn btn-accent"><Icon.Plus className="icon" /> New ticket</button>
        </>}
      />
      <div className="grid g-4">
        <KpiCard tone="warm" label="Open tickets" value="7" sub={<Pill tone="warning">2 P1</Pill>} />
        <KpiCard tone="terra" label="Turnovers today" value="14" sub={<Pill tone="olive">11 on time</Pill>} />
        <KpiCard tone="olive" label="Avg resolution" value="4h 12m" sub={<Pill tone="success">▼ 18m</Pill>} />
        <KpiCard tone="sea" label="Vendor on-site" value="3" sub="2 housekeeping · 1 pool" />
      </div>

      <div className="grid g-3">
        {[
          { title: "Backlog", count: 4, tone: "neutral", items: [
            { code: "ES-S6", title: "Pool pump replacement", meta: "Wayan C. · 2h ago", p: "P1" },
            { code: "AS-04", title: "AC inverter — bedroom 2", meta: "Unassigned · 5h ago", p: "P2" },
            { code: "EV-11", title: "Wi-Fi mesh add-on", meta: "Made K. · 1d ago", p: "P3" },
            { code: "BV-09", title: "Garden netting tear", meta: "Unassigned · 2d ago", p: "P3" },
          ]},
          { title: "In progress", count: 5, tone: "sea", items: [
            { code: "EV-07", title: "Turnover · 22/28 items", meta: "Putu A. · since 09:15", p: "—" },
            { code: "AS-12", title: "Pre-check-in inspection", meta: "Komang L. · since 10:00", p: "—" },
            { code: "AS-04", title: "Deep clean", meta: "Ketut B. · 8/16 items", p: "—" },
          ]},
          { title: "Done · today", count: 11, tone: "success", items: [
            { code: "EV-03", title: "Turnover complete", meta: "Putu A. · 08:42", p: "✓" },
            { code: "BV-03", title: "Linen restock", meta: "Made K. · 08:10", p: "✓" },
            { code: "AS-12", title: "Spa setup", meta: "Komang L. · 07:55", p: "✓" },
          ]},
        ].map((col, i) => (
          <div className="card" key={i}>
            <div className="card-header">
              <div className="row" style={{ gap: 8 }}>
                <div className="card-title">{col.title}</div>
                <Pill tone={col.tone}>{col.count}</Pill>
              </div>
              <button className="btn btn-quiet"><Icon.Plus size={14} /></button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {col.items.map((it, j) => (
                <div key={j} style={{
                  padding: 12, borderRadius: 14,
                  background: "var(--surface-warm)", border: "1px solid var(--line)",
                }}>
                  <div className="row between" style={{ marginBottom: 6 }}>
                    <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{it.code}</span>
                    <Pill tone={
                      it.p === "P1" ? "danger" : it.p === "P2" ? "warning" : it.p === "✓" ? "success" : "neutral"
                    }>{it.p}</Pill>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{it.title}</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{it.meta}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function MgmtAi() {
  return (
    <>
      <PageHeader
        eyebrow="AI"
        title="Operations"
        accent="copilot"
        sub="Briefings, recommendations, and run history."
      />
      <div className="ai-panel" style={{ minHeight: 220 }}>
        <div className="meta">
          <Icon.Sparkles size={13} /> AM Briefing · 16 May 2026 · 07:00
        </div>
        <h3>Three arrivals on the books, all on track <em>except EV-07</em>. Two tickets need to leave today.</h3>
        <p>EV-07 supervisor approval is still open, blocking the 15:00 check-in. ES-S6 pool repair has slipped to Friday; I'd hold the next two Sky bookings unless we re-route to ES-S2. Direct channel pacing is +12% vs the same week last year — your push on rate parity is working.</p>
        <div className="actions">
          <button className="btn btn-accent">Approve recommendations <Icon.ArrowUR className="icon" /></button>
          <button className="btn btn-onink">Open full briefing</button>
          <button className="btn btn-onink">Replay yesterday</button>
        </div>
      </div>

      <Section eyebrow="Run history" title="Last 7 days">
        <div className="grid g-3">
          {[
            { d: "16 May", t: "AM briefing", insight: "Three arrivals — one at risk", confidence: 92 },
            { d: "15 May", t: "Inventory alert", insight: "Linen below par at EV cluster", confidence: 86 },
            { d: "14 May", t: "Pricing nudge", insight: "+8% weekend rate · Bingin", confidence: 78 },
            { d: "13 May", t: "Guest concierge", insight: "5 upsell opportunities flagged", confidence: 88 },
            { d: "12 May", t: "Maintenance triage", insight: "Pre-emptive AC service window", confidence: 81 },
            { d: "11 May", t: "Channel parity", insight: "Booking.com rate sync warning", confidence: 94 },
          ].map((r, i) => (
            <div className="card sm" key={i}>
              <div className="row between" style={{ marginBottom: 8 }}>
                <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{r.d}</span>
                <Pill tone="olive">conf {r.confidence}</Pill>
              </div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{r.t}</div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{r.insight}</div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

function MgmtStub({ title }) {
  return (
    <>
      <PageHeader
        eyebrow="Management OS"
        title={title}
        sub="Section ready · live data and detailed views will land here next."
        actions={<button className="btn btn-ghost">Open in full <Icon.ArrowR className="icon" /></button>}
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

function MgmtFrontOffice() {
  const arrivals = [
    { time: "14:00", guest: "M. & L. Tanaka", villa: "AS-12", nights: 4, party: "2 adults", flight: "GA 718 · 11:45", status: "ready" },
    { time: "15:30", guest: "S. Reynolds party", villa: "EV-07", nights: 6, party: "4 ad · 2 ch", flight: "QF 43 · 13:10", status: "at-risk" },
    { time: "17:00", guest: "A. Voss", villa: "BV-09", nights: 3, party: "2 adults", flight: "SQ 942 · 14:55", status: "confirmed" },
    { time: "19:30", guest: "Y. Nakamura", villa: "AS-04", nights: 5, party: "2 ad · 1 ch", flight: "JL 725 · 16:30", status: "confirmed" },
  ];
  const departures = [
    { time: "10:00", guest: "K. Patel", villa: "EV-03", nights: 7, settled: true },
    { time: "11:30", guest: "B. Schmidt", villa: "EV-11", nights: 4, settled: true },
    { time: "12:00", guest: "L. Romano", villa: "BV-03", nights: 5, settled: false },
  ];
  return (
    <>
      <PageHeader eyebrow="Front office" title="Today's " accent="arrivals & departures"
        sub="Live arrivals, departures, and the front-desk checklist."
        actions={<>
          <button className="btn btn-ghost"><Icon.Filter className="icon" /> Filter</button>
          <button className="cta-pill">Run pre-arrivals <span className="arrow"><Icon.ArrowR size={14} /></span></button>
        </>}
      />
      <div className="grid g-4">
        <KpiCard tone="terra" label="Arrivals · today" value="5" sub={<Pill tone="warning">1 at-risk</Pill>} />
        <KpiCard tone="olive" label="Departures · today" value="3" sub={<Pill tone="success">all settled</Pill>} />
        <KpiCard tone="sea" label="In-house · tonight" value="19" sub="38 guests" />
        <KpiCard tone="sand" label="Pre-arrival checks" value="14/16" sub={<Pill tone="warning">2 pending</Pill>} />
      </div>
      <div className="grid g-12">
        <div className="col-7">
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div className="card-header" style={{ padding: 20, marginBottom: 0 }}>
              <div>
                <div className="card-title">Arrivals</div>
                <div className="card-sub">Pre-keying status and flight ETAs</div>
              </div>
              <div className="filterbar"><span className="chip active">Today</span><span className="chip">Tomorrow</span><span className="chip">14d</span></div>
            </div>
            <table className="tbl">
              <thead><tr><th>ETA</th><th>Guest</th><th>Villa</th><th>Party</th><th>Inbound</th><th>Status</th></tr></thead>
              <tbody>
                {arrivals.map(a => (
                  <tr key={a.guest}>
                    <td className="mono">{a.time}</td>
                    <td className="row" style={{ gap: 8 }}>
                      <Avatar name={a.guest} color="var(--terra)" size={26} />
                      <strong style={{ fontWeight: 500 }}>{a.guest}</strong>
                    </td>
                    <td className="mono">{a.villa}</td>
                    <td className="muted">{a.party}</td>
                    <td className="muted mono">{a.flight}</td>
                    <td><Pill tone={a.status === "ready" ? "success" : a.status === "at-risk" ? "warning" : "olive"}>{a.status}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="col-5">
          <div className="card" style={{ height: "100%" }}>
            <div className="card-header">
              <div className="card-title">Pre-arrival checklist · EV-07</div>
              <Pill tone="warning">2 pending</Pill>
            </div>
            <div className="list">
              {[
                { l: "Welcome amenity placed", done: true },
                { l: "Key cards encoded", done: true },
                { l: "Driver dispatched", done: true },
                { l: "Hot meal pre-order", done: true },
                { l: "Supervisor sign-off", done: false, note: "Awaiting approval" },
                { l: "Pool service cleared", done: false, note: "Blocked on parts" },
              ].map((c, i) => (
                <div className="list-row" key={i}>
                  <div style={{ width: 22, height: 22, borderRadius: 6, background: c.done ? "var(--olive)" : "var(--surface-sunken)", border: c.done ? "none" : "1px solid var(--line)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                    {c.done && <Icon.Check size={12} color="#fff" />}
                  </div>
                  <div className="info">
                    <div className="t" style={{ fontSize: 13, opacity: c.done ? 0.6 : 1, textDecoration: c.done ? "line-through" : "none" }}>{c.l}</div>
                    {c.note && <div className="s" style={{ color: "var(--terra-deep)" }}>{c.note}</div>}
                  </div>
                </div>
              ))}
            </div>
            <button className="cta-pill ghost" style={{ marginTop: 12 }}>Sign off remaining <span className="arrow"><Icon.Check size={14} /></span></button>
          </div>
        </div>
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="card-header" style={{ padding: 20, marginBottom: 0 }}>
          <div>
            <div className="card-title">Departures</div>
            <div className="card-sub">Settlements & key returns</div>
          </div>
        </div>
        <table className="tbl">
          <thead><tr><th>Time</th><th>Guest</th><th>Villa</th><th>Stay</th><th>Settlement</th><th>Action</th></tr></thead>
          <tbody>
            {departures.map(dep => (
              <tr key={dep.guest}>
                <td className="mono">{dep.time}</td>
                <td className="row" style={{ gap: 8 }}><Avatar name={dep.guest} color="var(--olive)" size={26} /><strong style={{ fontWeight: 500 }}>{dep.guest}</strong></td>
                <td className="mono">{dep.villa}</td>
                <td className="mono">{dep.nights}n</td>
                <td><Pill tone={dep.settled ? "success" : "warning"}>{dep.settled ? "settled" : "incidentals open"}</Pill></td>
                <td><button className="btn btn-quiet">{dep.settled ? "Close" : "Settle"} <Icon.ArrowR className="icon" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MgmtGuests() {
  const guests = [
    { name: "M. & L. Tanaka", nation: "JP", stays: 4, last: "Today", nights: 22, ltv: 18200, segment: "Returning" },
    { name: "S. Reynolds party", nation: "AU", stays: 1, last: "Today", nights: 6, ltv: 3640, segment: "New" },
    { name: "K. Brenner", nation: "DE", stays: 3, last: "Mar 2026", nights: 18, ltv: 14800, segment: "Returning" },
    { name: "P. & A. Vu", nation: "VN", stays: 2, last: "Feb 2026", nights: 11, ltv: 8420, segment: "Returning" },
    { name: "T. Aoki", nation: "JP", stays: 1, last: "Jan 2026", nights: 5, ltv: 4180, segment: "New" },
    { name: "R. Iyer", nation: "IN", stays: 5, last: "Apr 2026", nights: 31, ltv: 27600, segment: "VIP" },
  ];
  return (
    <>
      <PageHeader eyebrow="Guests" title="Guest " accent="profiles"
        sub="Unified CRM across stays, channels, and concierge interactions."
        actions={<>
          <button className="btn btn-ghost"><Icon.Filter className="icon" /> Filter</button>
          <button className="cta-pill">Add guest <span className="arrow"><Icon.Plus size={14} /></span></button>
        </>}
      />
      <div className="grid g-4">
        <KpiCard tone="terra" label="Active profiles" value="1,284" sub={<Pill tone="success">▲ 12% YoY</Pill>} />
        <KpiCard tone="olive" label="VIPs" value="48" sub="3.7% of base" />
        <KpiCard tone="sea" label="Repeat rate" value="34%" sub={<Pill tone="success">▲ 4 pts</Pill>} />
        <KpiCard tone="sand" label="Avg LTV" value="$8,420" sub="Trailing 24 months" />
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="card-header" style={{ padding: 20, marginBottom: 0 }}>
          <div className="card-title">Guests</div>
          <div className="filterbar"><span className="chip active">All</span><span className="chip">VIP</span><span className="chip">Returning</span><span className="chip">New</span></div>
        </div>
        <table className="tbl">
          <thead><tr><th>Guest</th><th>Nation</th><th>Stays</th><th>Last stay</th><th>Total nights</th><th className="right">LTV</th><th>Segment</th></tr></thead>
          <tbody>
            {guests.map(g => (
              <tr key={g.name}>
                <td className="row" style={{ gap: 10 }}><Avatar name={g.name} color={g.segment === "VIP" ? "var(--ink-deep)" : "var(--terra)"} size={30} /><strong style={{ fontWeight: 500 }}>{g.name}</strong></td>
                <td className="mono">{g.nation}</td>
                <td className="mono tnum">{g.stays}</td>
                <td className="muted">{g.last}</td>
                <td className="mono tnum">{g.nights}</td>
                <td className="right mono tnum">${g.ltv.toLocaleString()}</td>
                <td><Pill tone={g.segment === "VIP" ? "terra" : g.segment === "Returning" ? "olive" : "neutral"}>{g.segment}</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MgmtConcierge() {
  const threads = [
    { who: "S. Reynolds", villa: "EV-07", last: "Asking about late check-in", time: "12m", unread: 2, tone: "warning" },
    { who: "M. & L. Tanaka", villa: "AS-12", last: "Sunset dinner tonight — 6pm reservation confirmed at Ulu Cliffhouse", time: "1h", unread: 0, tone: "neutral" },
    { who: "A. Voss", villa: "BV-09", last: "Spa appointment tomorrow at 10am? Yes — booked.", time: "2h", unread: 0, tone: "neutral" },
    { who: "R. Iyer", villa: "AS-04", last: "Private chef · 4 courses · 18:30 tomorrow", time: "3h", unread: 1, tone: "olive" },
    { who: "Y. Nakamura", villa: "AS-04", last: "Welcome amenity request — pls send tray of fruit", time: "5h", unread: 0, tone: "neutral" },
  ];
  return (
    <>
      <PageHeader eyebrow="Concierge" title="Guest " accent="requests"
        sub="Live request inbox across all channels."
      />
      <div className="grid g-4">
        <KpiCard tone="terra" label="Open threads" value="11" sub={<Pill tone="warning">3 unread</Pill>} />
        <KpiCard tone="olive" label="Median response" value="6 min" sub={<Pill tone="success">▼ 2m</Pill>} />
        <KpiCard tone="sea" label="AI-resolved" value="48%" sub="Past 30 days" />
        <KpiCard tone="sand" label="Upsell revenue" value="$3,840" sub="MTD · 12 conversions" />
      </div>
      <div className="grid g-12">
        <div className="col-5">
          <div className="card" style={{ padding: 0, overflow: "hidden", height: "100%" }}>
            <div className="card-header" style={{ padding: 18, marginBottom: 0 }}>
              <div className="card-title">Inbox</div>
              <div className="filterbar"><span className="chip active">All</span><span className="chip">Unread</span><span className="chip">VIP</span></div>
            </div>
            <div>
              {threads.map((t, i) => (
                <div key={i} style={{ padding: "14px 18px", borderTop: "1px solid var(--line-2)", cursor: "pointer", background: i === 0 ? "var(--terra-tint)" : "transparent" }}>
                  <div className="row" style={{ gap: 10 }}>
                    <Avatar name={t.who} color="var(--terra)" size={36} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row between"><strong style={{ fontWeight: 500, fontSize: 13.5 }}>{t.who}</strong><span className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{t.time}</span></div>
                      <div className="row between" style={{ marginTop: 4 }}>
                        <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 280 }}>{t.last}</span>
                        {t.unread > 0 && <span className="pill terra" style={{ fontSize: 10 }}>{t.unread}</span>}
                      </div>
                      <div className="muted" style={{ fontSize: 10.5, marginTop: 4 }}>{t.villa}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="col-7">
          <div className="card" style={{ display: "flex", flexDirection: "column", height: "100%", padding: 0, overflow: "hidden" }}>
            <div className="card-header" style={{ padding: 18, borderBottom: "1px solid var(--line-2)", marginBottom: 0 }}>
              <div className="row" style={{ gap: 10 }}>
                <Avatar name="S. Reynolds" color="var(--terra)" size={36} />
                <div><div style={{ fontSize: 14, fontWeight: 500 }}>S. Reynolds</div><div className="muted" style={{ fontSize: 11.5 }}>EV-07 · check-in today 15:30 · party of 6</div></div>
              </div>
              <Pill tone="warning">VIP</Pill>
            </div>
            <div style={{ flex: 1, padding: 20, display: "flex", flexDirection: "column", gap: 10, background: "var(--bg)" }}>
              <ChatMsg from="guest">Hi! Our flight just landed, but luggage is delayed. Can we check in at 15:00 instead of 15:30 if villa's ready?</ChatMsg>
              <ChatMsg from="agent">Let me check with housekeeping — one moment.</ChatMsg>
              <ChatMsg from="ai" pill="AI suggestion">
                EV-07 is at 22/28 checklist items; pool repair still pending. Realistic ETA 15:45. Suggest offering 15:30 lobby check-in with bag drop at villa.
              </ChatMsg>
              <ChatMsg from="guest">No worries! We'll grab lunch nearby.</ChatMsg>
            </div>
            <div style={{ padding: 16, borderTop: "1px solid var(--line-2)", display: "flex", gap: 10, alignItems: "center" }}>
              <input style={{ flex: 1, padding: "10px 14px", borderRadius: 999, border: "1px solid var(--line)", background: "var(--surface)", outline: "none" }} placeholder="Reply to S. Reynolds…" />
              <button className="icon-btn"><Icon.Sparkles size={15} /></button>
              <button className="cta-pill">Send <span className="arrow"><Icon.ArrowR size={14} /></span></button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function ChatMsg({ from = "guest", pill, children }) {
  const isGuest = from === "guest";
  const isAI = from === "ai";
  return (
    <div style={{ display: "flex", justifyContent: isGuest ? "flex-start" : "flex-end" }}>
      <div style={{
        maxWidth: "70%",
        padding: "10px 14px",
        borderRadius: isGuest ? "18px 18px 18px 4px" : "18px 18px 4px 18px",
        background: isAI ? "var(--ink-deep)" : isGuest ? "var(--surface)" : "var(--terra)",
        color: isAI ? "#fff" : isGuest ? "var(--ink)" : "#fff",
        border: isGuest ? "1px solid var(--line)" : "none",
        fontSize: 13,
        lineHeight: 1.5,
      }}>
        {pill && <div style={{ fontSize: 10, opacity: 0.8, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{pill}</div>}
        {children}
      </div>
    </div>
  );
}

function MgmtVillas() {
  const d = MGMT_DATA;
  return (
    <>
      <PageHeader eyebrow="Villas" title="Portfolio " accent="library"
        sub={`${d.villaCount} villas across three projects in Bali.`}
        actions={<button className="cta-pill">Add villa <span className="arrow"><Icon.Plus size={14} /></span></button>}
      />
      <div className="grid g-4">
        <KpiCard tone="terra" label="Total villas" value="24" sub="3 projects" />
        <KpiCard tone="olive" label="Avg occupancy YTD" value="76.4%" sub={<Pill tone="success">▲ 4.2%</Pill>} />
        <KpiCard tone="sea" label="Avg ADR" value="Rp 4.2M" sub={<Pill tone="success">▲ 6.8%</Pill>} />
        <KpiCard tone="sand" label="In maintenance" value="2" sub="ES-S6 · EV-11" />
      </div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <span className="chip active">All projects</span>
        <span className="chip">Enso Saba</span>
        <span className="chip">Anantya Seseh</span>
        <span className="chip">Bamboo Bingin</span>
      </div>
      <div className="grid g-3">
        {[
          { code: "EV-07", name: "Enso Villa 07", project: "Enso Saba", beds: 4, baths: 5, status: "occupied", occ: 92.4, mtd: 480 },
          { code: "EV-03", name: "Enso Villa 03", project: "Enso Saba", beds: 4, baths: 5, status: "turnover", occ: 89.8, mtd: 412 },
          { code: "AS-12", name: "Anantya 12", project: "Anantya Seseh", beds: 5, baths: 6, status: "occupied", occ: 88.5, mtd: 396 },
          { code: "ES-S6", name: "Enso Sky 06", project: "Enso Saba", beds: 3, baths: 4, status: "maintenance", occ: 86.1, mtd: 312 },
          { code: "BV-09", name: "Bamboo 09", project: "Bamboo Bingin", beds: 4, baths: 5, status: "occupied", occ: 84.9, mtd: 388 },
          { code: "AS-04", name: "Anantya 04", project: "Anantya Seseh", beds: 3, baths: 4, status: "vacant", occ: 78.2, mtd: 244 },
        ].map(v => (
          <div key={v.code} className="card sm" style={{ cursor: "pointer" }}>
            <div style={{
              aspectRatio: "16/9",
              borderRadius: 18,
              background: `repeating-linear-gradient(135deg, ${v.status === "occupied" ? "var(--terra-soft)" : v.status === "maintenance" ? "var(--warning-soft)" : "var(--olive-soft)"} 0 12px, var(--surface) 12px 14px)`,
              display: "grid", placeItems: "center",
              marginBottom: 12,
              border: "1px solid var(--line)",
              position: "relative",
              overflow: "hidden",
            }}>
              <span className="mono muted" style={{ fontSize: 11 }}>{v.name} · placeholder photo</span>
              <Pill tone={
                v.status === "occupied" ? "success" :
                v.status === "turnover" ? "olive" :
                v.status === "maintenance" ? "danger" : "neutral"
              } style={{ position: "absolute", top: 12, right: 12 }}>{v.status}</Pill>
            </div>
            <div className="row between">
              <div>
                <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{v.code}</span>
                <div className="serif" style={{ fontSize: 19, letterSpacing: "-0.01em", marginTop: 2 }}>{v.name}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>{v.project} · {v.beds}br {v.baths}ba</div>
              </div>
            </div>
            <div className="row between" style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line-2)" }}>
              <div><div className="muted" style={{ fontSize: 10.5 }}>Occupancy YTD</div><div className="mono tnum" style={{ fontSize: 13, fontWeight: 500 }}>{v.occ}%</div></div>
              <div style={{ textAlign: "right" }}><div className="muted" style={{ fontSize: 10.5 }}>MTD revenue</div><div className="mono tnum" style={{ fontSize: 13, fontWeight: 500 }}>Rp {v.mtd}M</div></div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function MgmtInventory() {
  return (
    <>
      <PageHeader eyebrow="Inventory" title="Linen & " accent="amenities"
        sub="Par-level stock across villas and central store."
        actions={<button className="cta-pill">Place re-order <span className="arrow"><Icon.ArrowR size={14} /></span></button>}
      />
      <div className="grid g-4">
        <KpiCard tone="terra" label="Items below par" value="6" sub={<Pill tone="warning">2 critical</Pill>} />
        <KpiCard tone="olive" label="Open POs" value="3" sub="Rp 84M total" />
        <KpiCard tone="sea" label="On-hand value" value="Rp 1.24B" sub="Central + villas" />
        <KpiCard tone="sand" label="Turnover" value="4.6 wk" sub="trailing 90d" />
      </div>
      <div className="grid g-2">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Items below par</div>
            <Pill tone="warning">6</Pill>
          </div>
          {[
            { l: "King sheets · Egyptian 600TC", loc: "EV cluster", on: 18, par: 32, c: "var(--terra)" },
            { l: "Pool towels · ivory", loc: "All villas", on: 64, par: 96, c: "var(--terra)" },
            { l: "Welcome amenity · fruit basket", loc: "Central", on: 4, par: 12, c: "var(--warning)" },
            { l: "Espresso pods · arabica", loc: "AS cluster", on: 120, par: 240, c: "var(--terra)" },
            { l: "Bath robes · waffle white", loc: "BV cluster", on: 14, par: 28, c: "var(--terra)" },
            { l: "Hand soap · cedarwood 250ml", loc: "All villas", on: 28, par: 60, c: "var(--warning)" },
          ].map((it, i) => (
            <div key={i} style={{ padding: "12px 0", borderTop: i ? "1px solid var(--line-2)" : "none" }}>
              <div className="row between" style={{ marginBottom: 6 }}>
                <div><div style={{ fontSize: 13, fontWeight: 500 }}>{it.l}</div><div className="muted" style={{ fontSize: 11.5 }}>{it.loc}</div></div>
                <div className="mono tnum" style={{ fontSize: 13 }}>{it.on}<span className="muted">/{it.par}</span></div>
              </div>
              <HBar value={(it.on / it.par) * 100} color={it.c} height={5} />
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Reorder cadence · 30 days</div>
          </div>
          <BarChart data={[2,1,3,4,2,5,3,6,4,7,5,8]} labels={["W1","","W2","","W3","","W4","","M","","N","D"]} height={140} color="var(--terra)" highlight={9} />
          <div className="row between" style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line-2)" }}>
            <div><div className="muted" style={{ fontSize: 11 }}>Open</div><div className="mono tnum" style={{ fontSize: 15 }}>3</div></div>
            <div><div className="muted" style={{ fontSize: 11 }}>Delivered</div><div className="mono tnum" style={{ fontSize: 15 }}>12</div></div>
            <div><div className="muted" style={{ fontSize: 11 }}>Cancelled</div><div className="mono tnum" style={{ fontSize: 15 }}>1</div></div>
            <div><div className="muted" style={{ fontSize: 11 }}>Avg lead</div><div className="mono tnum" style={{ fontSize: 15 }}>3.2d</div></div>
          </div>
        </div>
      </div>
    </>
  );
}

function MgmtChannels() {
  return (
    <>
      <PageHeader eyebrow="Channels" title="Channel " accent="manager"
        sub="OTA connections, rate parity, and channel-side warnings."
        actions={<button className="cta-pill">Push rates <span className="arrow"><Icon.ArrowR size={14} /></span></button>}
      />
      <div className="grid g-4">
        <KpiCard tone="terra" label="Connected channels" value="8" sub="All active" />
        <KpiCard tone="olive" label="Rate parity OK" value="92%" sub={<Pill tone="warning">2 warnings</Pill>} />
        <KpiCard tone="sea" label="Inventory sync" value="Live" sub="last 11s ago" />
        <KpiCard tone="sand" label="Direct share" value="48%" sub={<Pill tone="success">▲ 6 pts</Pill>} />
      </div>
      <div className="grid g-3">
        {[
          { name: "Direct (arconique.com)", icon: "Compass", state: "live", share: 48, vol: 68, color: "var(--terra)" },
          { name: "Booking.com", icon: "PlugZap", state: "warning", share: 24, vol: 34, color: "var(--olive)" },
          { name: "Airbnb", icon: "PlugZap", state: "live", share: 18, vol: 26, color: "var(--sea)" },
          { name: "Expedia / VRBO", icon: "PlugZap", state: "live", share: 10, vol: 14, color: "var(--sand)" },
          { name: "Agoda", icon: "PlugZap", state: "live", share: 8, vol: 11, color: "var(--ink-deep)" },
          { name: "Cushman partner feed", icon: "Briefcase", state: "live", share: 4, vol: 6, color: "var(--terra-deep)" },
        ].map((c, i) => {
          const C = Icon[c.icon];
          return (
            <div key={i} className="card">
              <div className="row between" style={{ marginBottom: 12 }}>
                <div className="row" style={{ gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 12, background: "var(--surface-warm)", display: "grid", placeItems: "center" }}><C size={16} /></div>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>{c.name}</div>
                    <div className="muted" style={{ fontSize: 11 }}>Last sync · 11s ago</div>
                  </div>
                </div>
                <Pill tone={c.state === "live" ? "success" : "warning"}>{c.state}</Pill>
              </div>
              <div className="row between" style={{ marginBottom: 6 }}>
                <span className="muted" style={{ fontSize: 11 }}>Share</span>
                <span className="mono tnum" style={{ fontSize: 12 }}>{c.share}%</span>
              </div>
              <HBar value={c.share} color={c.color} height={6} />
              <div className="row between" style={{ marginTop: 12, fontSize: 11.5 }}>
                <span className="muted">{c.vol} bookings · 30d</span>
                <button className="btn btn-quiet">Open <Icon.ArrowR className="icon" /></button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function ManagementApp({ route }) {
  switch (route) {
    case "overview":    return <MgmtOverview />;
    case "bookings":    return <MgmtBookings />;
    case "finance":     return <MgmtFinance />;
    case "operations":  return <MgmtOperations />;
    case "frontoffice": return <MgmtFrontOffice />;
    case "guests":      return <MgmtGuests />;
    case "concierge":   return <MgmtConcierge />;
    case "ai":          return <MgmtAi />;
    case "villas":      return <MgmtVillas />;
    case "inventory":   return <MgmtInventory />;
    case "channels":    return <MgmtChannels />;
    default:            return <MgmtStub title={
      (APP_DEFS.mgmt.nav.find(n => n.id === route) || {}).label || "Section"
    } />;
  }
}

window.ManagementApp = ManagementApp;
