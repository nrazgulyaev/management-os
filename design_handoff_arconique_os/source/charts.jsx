/* Lightweight SVG charts — no chart library, all hand-rendered.
   Each chart is self-contained, responsive, and uses CSS vars. */

function buildPath(points, w, h, padX = 4, padY = 6) {
  if (!points.length) return { line: "", area: "" };
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const xs = points.map((_, i) => padX + (i * (w - 2 * padX)) / (points.length - 1));
  const ys = points.map((v) => h - padY - ((v - min) / range) * (h - 2 * padY));
  let line = `M ${xs[0]} ${ys[0]}`;
  for (let i = 1; i < points.length; i++) {
    const cx = (xs[i - 1] + xs[i]) / 2;
    line += ` C ${cx} ${ys[i - 1]}, ${cx} ${ys[i]}, ${xs[i]} ${ys[i]}`;
  }
  const area = `${line} L ${xs[xs.length - 1]} ${h} L ${xs[0]} ${h} Z`;
  return { line, area, xs, ys, min, max };
}

function AreaChart({ data, height = 200, color = "var(--terra)", labels = [], pinIndex = null, pinLabel = null }) {
  const W = 800;
  const H = height;
  const values = data.map((d) => d.value ?? d);
  const { line, area, xs, ys, min, max } = buildPath(values, W, H, 12, 28);
  const gradId = `g-${Math.round(Math.random() * 1e6)}`;
  const grid = 4;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="60%" stopColor={color} stopOpacity="0.08" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[...Array(grid + 1)].map((_, i) => (
        <line key={i} x1="0" x2={W} y1={(H * i) / grid} y2={(H * i) / grid} stroke="var(--line-2)" strokeWidth="1" strokeDasharray={i === grid ? "0" : "3 6"} />
      ))}
      <path d={area} fill={`url(#${gradId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" />
      {xs && xs.map((x, i) => (
        <circle key={i} cx={x} cy={ys[i]} r={pinIndex === i ? 5 : 0} fill="white" stroke={color} strokeWidth="2.5" />
      ))}
      {pinIndex != null && xs && (
        <g transform={`translate(${xs[pinIndex]} ${ys[pinIndex] - 18})`}>
          <rect x="-44" y="-22" width="88" height="22" rx="11" fill="var(--ink-deep)" />
          <text textAnchor="middle" y="-7" fontSize="11" fill="#fff" fontFamily="var(--font-mono)" fontWeight="500">{pinLabel}</text>
        </g>
      )}
      {labels.length > 0 && xs && labels.map((l, i) => (
        <text key={i} x={xs[i]} y={H - 6} fontSize="10" textAnchor="middle" fill="var(--ink-3)" fontFamily="var(--font-mono)">{l}</text>
      ))}
    </svg>
  );
}

function Sparkline({ data, color = "var(--terra)", height = 36 }) {
  const W = 200, H = height;
  const { line, area } = buildPath(data, W, H, 2, 4);
  const gid = `s-${Math.round(Math.random() * 1e6)}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" />
    </svg>
  );
}

function Donut({ value, total, label, color = "var(--terra)", size = 140, track = "var(--surface-sunken)", thickness = 14 }) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / total));
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={thickness} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={thickness} strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
        <div>
          <div className="serif" style={{ fontSize: Math.round(size * 0.22), letterSpacing: "-0.02em", lineHeight: 1, color: "var(--ink)" }}>
            {Math.round(pct * 100)}<span style={{ fontSize: Math.round(size * 0.12), color: "var(--ink-3)" }}>%</span>
          </div>
          {label && <div className="muted" style={{ fontSize: 10.5, marginTop: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</div>}
        </div>
      </div>
    </div>
  );
}

function BarChart({ data, height = 120, color = "var(--terra)", highlight = -1, labels = [] }) {
  const W = 320, H = height;
  const max = Math.max(...data) || 1;
  const gap = 8;
  const bw = (W - gap * (data.length - 1)) / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }}>
      {data.map((v, i) => {
        const h = (v / max) * (H - 24);
        const x = i * (bw + gap);
        const y = H - 12 - h;
        const isHi = i === highlight;
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw} height={h} rx={Math.min(bw / 2, 10)}
              fill={isHi ? color : "var(--surface-sunken)"}
              stroke={isHi ? color : "var(--line)"}
              strokeWidth="1"
            />
            {labels[i] && (
              <text x={x + bw / 2} y={H - 1} textAnchor="middle" fontSize="9.5" fill={isHi ? "var(--ink)" : "var(--ink-3)"} fontFamily="var(--font-mono)">{labels[i]}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function MiniBar({ data, color = "var(--terra)" }) {
  const max = Math.max(...data) || 1;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 32 }}>
      {data.map((v, i) => (
        <div key={i} style={{
          flex: 1,
          height: `${(v / max) * 100}%`,
          background: color,
          opacity: 0.35 + 0.65 * (v / max),
          borderRadius: 3,
          minHeight: 3,
        }} />
      ))}
    </div>
  );
}

function HBar({ value, max = 100, color = "var(--olive)", track = "var(--surface-sunken)", height = 6 }) {
  return (
    <div style={{ height, background: track, borderRadius: 999, overflow: "hidden", width: "100%" }}>
      <div style={{ height: "100%", width: `${Math.max(2, Math.min(100, (value / max) * 100))}%`, background: color, borderRadius: 999 }} />
    </div>
  );
}

function StackedBar({ segments, height = 10 }) {
  // segments: [{ value, color }]
  const total = segments.reduce((a, b) => a + b.value, 0) || 1;
  return (
    <div style={{ display: "flex", height, width: "100%", borderRadius: 999, overflow: "hidden", background: "var(--surface-sunken)", gap: 2, padding: 2 }}>
      {segments.map((s, i) => (
        <div key={i} style={{ flex: s.value / total, background: s.color, borderRadius: 999, minWidth: 2 }} />
      ))}
    </div>
  );
}

function DotGrid({ filled = 22, total = 30, color = "var(--terra)", muted = "var(--surface-sunken)" }) {
  const arr = Array.from({ length: total });
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 4 }}>
      {arr.map((_, i) => (
        <div key={i} style={{
          width: "100%", aspectRatio: "1 / 1", borderRadius: "50%",
          background: i < filled ? color : muted,
          opacity: i < filled ? (0.55 + 0.45 * (1 - i / filled)) : 1,
        }} />
      ))}
    </div>
  );
}

function Gauge({ value, max = 100, color = "var(--olive)", label }) {
  const r = 56, sw = 10;
  const c = Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div style={{ position: "relative", width: 140, height: 88 }}>
      <svg width="140" height="88" viewBox="0 0 140 80">
        <path d={`M 14 70 A ${r} ${r} 0 0 1 126 70`} fill="none" stroke="var(--surface-sunken)" strokeWidth={sw} strokeLinecap="round" />
        <path d={`M 14 70 A ${r} ${r} 0 0 1 126 70`} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round"
              strokeDasharray={`${c * pct} ${c}`} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", paddingTop: 26, textAlign: "center" }}>
        <div>
          <div className="serif" style={{ fontSize: 28, letterSpacing: "-0.02em", lineHeight: 1 }}>{value}<span style={{ color: "var(--ink-3)", fontSize: 16 }}>%</span></div>
          {label && <div className="muted" style={{ fontSize: 10, marginTop: 2, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</div>}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { AreaChart, Sparkline, Donut, BarChart, MiniBar, HBar, StackedBar, DotGrid, Gauge });

function ConcentricBubbles({ rings, color = "var(--terra)" }) {
  // rings: [{ label, value }] biggest first; rendered as nested circles centered on bottom
  const max = rings[0].value;
  return (
    <div className="rings">
      {rings.map((r, i) => {
        const size = (r.value / max) * 100;
        return (
          <div key={i} className="ring" style={{
            width: `${size}%`,
            height: `${size}%`,
            left: `${(100 - size) / 2}%`,
            bottom: 0,
            background: `color-mix(in oklch, ${color} ${Math.max(20, 30 + i * 14)}%, white)`,
            color: i === rings.length - 1 ? "white" : "var(--terra-deep)",
          }}>
            <span className="lbl"><span className="c">$</span><strong style={{ color: "inherit", fontWeight: 400 }}>{r.label}</strong></span>
          </div>
        );
      })}
    </div>
  );
}

function DomeDonut({ value, label = "Growth rate", color = "var(--terra)", subColor = "#5a4a3e" }) {
  // Dark circular surface with a partial arc, % in center white.
  const size = 180, thickness = 12, r = (size - thickness - 16) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / 100));
  return (
    <div className="dome">
      <svg width={size} height={size} style={{ position: "absolute", inset: 0 }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={subColor} strokeWidth={thickness} opacity="0.7" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          transform={`rotate(-90 ${size/2} ${size/2})`}
        />
      </svg>
      <div style={{ textAlign: "center" }}>
        <div className="serif" style={{ fontSize: 38, letterSpacing: "-0.02em", lineHeight: 1 }}>{value}<span style={{ color: "rgba(255,255,255,0.55)", fontSize: 22 }}>%</span></div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>{label}</div>
      </div>
    </div>
  );
}

function BarsMini({ data, hi = -1, color = "var(--terra)" }) {
  const max = Math.max(...data) || 1;
  return (
    <div className="bars">
      {data.map((v, i) => (
        <div key={i} className={`b ${i === hi ? "hi" : v < max * 0.4 ? "dim" : ""}`} style={{ height: `${(v / max) * 100}%` }} />
      ))}
    </div>
  );
}

function WiggleLine({ data, color = "var(--terra)", height = 56 }) {
  const W = 320, H = height;
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const xs = data.map((_, i) => 4 + (i * (W - 8)) / (data.length - 1));
  const ys = data.map(v => H - 4 - ((v - min) / range) * (H - 8));
  let path = `M ${xs[0]} ${ys[0]}`;
  for (let i = 1; i < xs.length; i++) {
    const cx = (xs[i-1] + xs[i]) / 2;
    path += ` C ${cx} ${ys[i-1]}, ${cx} ${ys[i]}, ${xs[i]} ${ys[i]}`;
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height, display: "block" }} preserveAspectRatio="none">
      <path d={path} fill="none" stroke={color} strokeWidth="2.2" />
    </svg>
  );
}

Object.assign(window, { ConcentricBubbles, DomeDonut, BarsMini, WiggleLine });
