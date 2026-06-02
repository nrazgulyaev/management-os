/* Auth prototype — screen components. Exposed on window for app.jsx. */
const { useState } = React;

/* ---------- tiny inline icon set ---------- */
function Ico({ d, size = 16, sw = 1.7, fill }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill || "none"}
      stroke={fill ? "none" : "currentColor"} strokeWidth={sw}
      strokeLinecap="round" strokeLinejoin="round">{d}</svg>
  );
}
const IconArrow = (p) => <Ico {...p} d={<><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></>} />;
const IconMail = (p) => <Ico {...p} d={<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>} />;
const IconLock = (p) => <Ico {...p} d={<><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>} />;
const IconShield = (p) => <Ico {...p} d={<><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /><path d="M9.5 12l1.8 1.8L15 10" /></>} />;
const IconUp = (p) => <Ico {...p} d={<><path d="M7 17L17 7" /><path d="M8 7h9v9" /></>} />;
const IconCheck = (p) => <Ico {...p} d={<path d="M5 12.5l4.5 4.5L19 7" />} />;
const IconBack = (p) => <Ico {...p} d={<><path d="M19 12H5" /><path d="M11 6l-6 6 6 6" /></>} />;
const IconKey = (p) => <Ico {...p} d={<><circle cx="8" cy="15" r="4" /><path d="M11 12l8-8" /><path d="M17 6l2 2" /><path d="M15 8l2 2" /></>} />;

/* ---------- brand mark (geometric roofline) ---------- */
function BrandMark({ size = 26, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M16 4 L28 14 H24 L16 8 L8 14 H4 Z" fill={color} />
      <path d="M16 13 L25 20 H21.5 L16 16 L10.5 20 H7 Z" fill={color} opacity="0.62" />
      <path d="M16 21 L22 25.5 H10 Z" fill={color} opacity="0.34" />
    </svg>
  );
}

function Logo({ plat }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
      <BrandMark color="var(--accent)" />
      <div style={{ lineHeight: 1.1 }}>
        <div style={{ fontFamily: "var(--display-font)", fontSize: 20, color: "var(--ink)", letterSpacing: "-0.01em" }}>{plat.wordmark}</div>
        <div className="label" style={{ fontSize: 9.5, marginTop: 1 }}>{plat.wordmarkSub}</div>
      </div>
    </div>
  );
}

/* ---------- form atoms ---------- */
function Field({ label, icon, ...rest }) {
  return (
    <label className="field" style={{ gap: 7 }}>
      <span className="field-label">{label}</span>
      <div style={{ position: "relative" }}>
        {icon && <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "var(--ink-4)", display: "inline-flex" }}>{icon}</span>}
        <input className="input" style={{ paddingLeft: icon ? 40 : 14, height: 46 }} {...rest} />
      </div>
    </label>
  );
}

function PrimaryBtn({ children, onClick }) {
  return (
    <button className="btn btn-accent btn-lg" onClick={onClick}
      style={{ width: "100%", justifyContent: "center", marginTop: 4, height: 48 }}>
      {children}
    </button>
  );
}

function TextLink({ children, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: "none", border: 0, padding: 0, cursor: "pointer",
      fontFamily: "var(--sans-font)", fontSize: 13.5, color: "var(--ink-2)",
      textDecoration: "underline", textUnderlineOffset: 3, textDecorationColor: "var(--line-strong)",
    }}>{children}</button>
  );
}

/* ---------- right brand panel (tone-aware) ---------- */
function BrandPanel({ plat, tone }) {
  if (plat.dark) tone = tone === "editorial" ? "editorial" : "premium";
  const t = plat.testimonial;

  if (tone === "premium") {
    return (
      <div className="auth-panel" style={{ background: "var(--inverted-bg)", color: "var(--inverted-fg)" }}>
        <div className="auth-panel-glow" style={{ background: "radial-gradient(60% 55% at 100% 0%, color-mix(in oklab, var(--accent) 55%, transparent), transparent 65%)" }} />
        <div className="auth-panel-grid" />
        <div className="auth-panel-inner">
          <span className="label" style={{ color: "color-mix(in oklab, var(--inverted-fg) 60%, transparent)" }}>{plat.panelKicker}</span>
          {t ? (
            <>
              <p style={{ fontFamily: "var(--display-font)", fontSize: 30, lineHeight: 1.22, fontWeight: 400, color: "var(--inverted-fg)", margin: "18px 0 0", letterSpacing: "-0.015em" }}>“{t.quote}”</p>
              <p style={{ marginTop: 18, fontSize: 13.5, color: "color-mix(in oklab, var(--inverted-fg) 72%, transparent)" }}>— {t.who}</p>
            </>
          ) : <PlatformStat dark />}
        </div>
      </div>
    );
  }

  if (tone === "editorial") {
    return (
      <div className="auth-panel" style={{ background: "var(--cream-deep, var(--bg-2))" }}>
        <div className="auth-photo" />
        <div className="auth-photo-veil" />
        <div className="auth-panel-inner" style={{ color: "#fff", position: "relative" }}>
          <span className="label" style={{ color: "rgba(255,255,255,0.78)" }}>{plat.panelKicker}</span>
          {t ? (
            <>
              <p style={{ fontFamily: "var(--display-font)", fontSize: 30, lineHeight: 1.22, fontWeight: 400, margin: "18px 0 0", letterSpacing: "-0.015em", textShadow: "0 2px 24px rgba(0,0,0,0.35)" }}>“{t.quote}”</p>
              <p style={{ marginTop: 18, fontSize: 13.5, color: "rgba(255,255,255,0.85)" }}>— {t.who}</p>
            </>
          ) : <PlatformStat />}
          <span className="auth-photo-tag">drop a villa photo here</span>
        </div>
      </div>
    );
  }

  // warm (default)
  return (
    <div className="auth-panel" style={{
      background: "radial-gradient(ellipse at top right, color-mix(in oklab, var(--accent) 22%, transparent), transparent 60%), linear-gradient(180deg, var(--cream-warm, var(--bg-2)), var(--cream, var(--bg)))",
    }}>
      <div className="auth-panel-inner">
        <span className="label">{plat.panelKicker}</span>
        {t ? (
          <>
            <p style={{ fontFamily: "var(--display-font)", fontSize: 30, lineHeight: 1.22, fontWeight: 400, color: "var(--ink)", margin: "18px 0 0", letterSpacing: "-0.015em" }}>“{t.quote}”</p>
            <p style={{ marginTop: 18, fontSize: 13.5, color: "var(--ink-3)" }}>— {t.who}</p>
          </>
        ) : <PlatformStat />}
      </div>
    </div>
  );
}

function PlatformStat({ dark }) {
  const fg = dark ? "var(--inverted-fg)" : "var(--ink)";
  const sub = dark ? "color-mix(in oklab, var(--inverted-fg) 65%, transparent)" : "var(--ink-3)";
  const rows = [["Organizations", "38"], ["Active agents", "112"], ["Uptime · 30d", "99.98%"]];
  return (
    <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 18 }}>
      {rows.map(([k, v]) => (
        <div key={k}>
          <div style={{ fontFamily: "var(--mono-font)", fontVariantNumeric: "tabular-nums", fontSize: 40, color: fg, lineHeight: 1 }}>{v}</div>
          <div className="label" style={{ marginTop: 6, color: sub }}>{k}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------- shell ---------- */
function AuthShell({ plat, tone, footer, children }) {
  return (
    <div className="auth-shell" data-product={plat.dataProduct}>
      <div className="auth-form-col">
        <div className="auth-form-top"><Logo plat={plat} /></div>
        <div className="auth-form-mid">
          <div className="auth-form-box">{children}</div>
        </div>
        <div className="auth-form-foot">
          {footer || <span>© {new Date().getFullYear()} Arconique · {plat.domain}</span>}
        </div>
      </div>
      <BrandPanel plat={plat} tone={tone} />
    </div>
  );
}

function Head({ plat, kicker, title }) {
  return (
    <>
      <span className="label" style={{ color: "var(--accent)" }}>{kicker || plat.badge}</span>
      <h1 style={{
        fontFamily: "var(--display-font)", fontWeight: plat.dataProduct === "development" ? 500 : 400,
        fontSize: plat.calm ? 52 : 46, lineHeight: 1.0, letterSpacing: "-0.025em",
        color: "var(--ink)", margin: "14px 0 0",
      }}>{title}</h1>
    </>
  );
}

/* ===================== SCREENS ===================== */

function SignIn({ plat, tone, go }) {
  return (
    <AuthShell plat={plat} tone={tone}>
      <Head plat={plat} title={<>{plat.headline[0]}<em style={{ fontStyle: "italic", color: "var(--accent)" }}>{plat.headline[1]}</em></>} />
      <p className="body" style={{ marginTop: 12, fontSize: 15, color: "var(--ink-3)", maxWidth: 380 }}>{plat.sub}</p>

      <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 16 }}>
        <Field label="Work email" type="email" name="email" autoComplete="email" placeholder="you@company.com" icon={<IconMail />} />
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
            <span className="field-label">Password</span>
            <TextLink onClick={() => go("forgot")}>Forgot?</TextLink>
          </div>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "var(--ink-4)" }}><IconLock /></span>
            <input className="input" type="password" placeholder="••••••••" autoComplete="current-password" style={{ paddingLeft: 40, height: 46 }} />
          </div>
        </div>
        <label className="check" style={{ fontSize: 13.5 }}>
          <input type="checkbox" defaultChecked /><span className="box"></span>
          Keep me signed in on this device
        </label>
        <PrimaryBtn onClick={() => go(plat.links.mfa ? "mfa" : null)}>
          Continue <IconArrow size={17} />
        </PrimaryBtn>

        {plat.links.sso && (
          <>
            <div className="auth-or"><span>or</span></div>
            <button className="btn btn-secondary btn-lg" style={{ width: "100%", justifyContent: "center", height: 46 }}>
              <IconShield size={16} /> Continue with SSO
            </button>
          </>
        )}
      </div>

      <div className="auth-foot-row">
        {plat.links.signup
          ? <span>New here? <TextLink onClick={() => go("signup")}>Start a trial</TextLink></span>
          : <span style={{ color: "var(--ink-4)" }}>Access is provisioned by your Arconique administrator.</span>}
      </div>
    </AuthShell>
  );
}

function SignUp({ plat, tone, go }) {
  return (
    <AuthShell plat={plat} tone={tone}>
      <Head plat={plat} kicker="Start free · 14 days" title={<>Start your <em style={{ fontStyle: "italic", color: "var(--accent)" }}>trial.</em></>} />
      <p className="body" style={{ marginTop: 12, fontSize: 15, color: "var(--ink-3)", maxWidth: 400 }}>Create your organization. No credit card required during the trial.</p>

      <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="auth-2col">
          <Field label="Your name" placeholder="Jane Operator" />
          <Field label="Work email" type="email" placeholder="you@company.com" icon={<IconMail />} />
        </div>
        <Field label="Password" type="password" placeholder="At least 8 characters" icon={<IconLock />} />
        <Field label="Organization name" placeholder="Acme Villas" />
        <label className="field" style={{ gap: 7 }}>
          <span className="field-label">Workspace</span>
          <div className="auth-slug">
            <input className="input" placeholder="acme" style={{ border: 0, height: 44, borderRadius: 0, background: "transparent", flex: 1 }} />
            <span className="auth-slug-suffix">.arconique.com</span>
          </div>
        </label>
        <label className="field" style={{ gap: 7 }}>
          <span className="field-label">Plan</span>
          <select className="select" style={{ height: 46 }}>
            <option>Standard — 14-day trial</option>
            <option>Pro — 14-day trial</option>
            <option>Enterprise — talk to sales</option>
          </select>
        </label>
        <PrimaryBtn onClick={() => go("signin")}>Create workspace <IconArrow size={17} /></PrimaryBtn>
        <p style={{ fontSize: 12, color: "var(--ink-4)", lineHeight: 1.5, margin: 0 }}>
          By signing up you agree to our <TextLink>Terms</TextLink> and <TextLink>Privacy Policy</TextLink>.
        </p>
      </div>

      <div className="auth-foot-row"><span>Already have an account? <TextLink onClick={() => go("signin")}>Sign in</TextLink></span></div>
    </AuthShell>
  );
}

function Forgot({ plat, tone, go }) {
  return (
    <AuthShell plat={plat} tone={tone}>
      <button className="auth-back" onClick={() => go("signin")}><IconBack size={15} /> Back to sign in</button>
      <Head plat={plat} kicker="Reset access" title={<>Forgot your <em style={{ fontStyle: "italic", color: "var(--accent)" }}>password?</em></>} />
      <p className="body" style={{ marginTop: 12, fontSize: 15, color: "var(--ink-3)", maxWidth: 380 }}>Enter your work email and we'll send a secure reset link. It expires in 30 minutes.</p>
      <div style={{ marginTop: 26, display: "flex", flexDirection: "column", gap: 16 }}>
        <Field label="Work email" type="email" placeholder="you@company.com" icon={<IconMail />} />
        <PrimaryBtn onClick={() => go("reset")}>Send reset link <IconArrow size={17} /></PrimaryBtn>
      </div>
      <div className="auth-foot-row"><span style={{ color: "var(--ink-4)" }}>Didn't get it? Check spam, or contact your administrator.</span></div>
    </AuthShell>
  );
}

function Reset({ plat, tone, go }) {
  const reqs = ["At least 8 characters", "One number or symbol", "Not a previous password"];
  return (
    <AuthShell plat={plat} tone={tone}>
      <Head plat={plat} kicker="Reset access" title={<>Set a new <em style={{ fontStyle: "italic", color: "var(--accent)" }}>password.</em></>} />
      <p className="body" style={{ marginTop: 12, fontSize: 15, color: "var(--ink-3)", maxWidth: 380 }}>Choose a strong password you don't use anywhere else.</p>
      <div style={{ marginTop: 26, display: "flex", flexDirection: "column", gap: 16 }}>
        <Field label="New password" type="password" placeholder="••••••••" icon={<IconLock />} />
        <Field label="Confirm password" type="password" placeholder="••••••••" icon={<IconLock />} />
        <div className="auth-reqs">
          {reqs.map((r) => (
            <div key={r} className="auth-req"><span className="auth-req-dot"><IconCheck size={11} /></span>{r}</div>
          ))}
        </div>
        <PrimaryBtn onClick={() => go("signin")}>Update password <IconArrow size={17} /></PrimaryBtn>
      </div>
    </AuthShell>
  );
}

function MfaVerify({ plat, tone, go }) {
  const [vals, setVals] = useState(["", "", "", "", "", ""]);
  function setAt(i, v) {
    v = v.replace(/\D/g, "").slice(-1);
    const next = vals.slice(); next[i] = v; setVals(next);
    if (v && i < 5) { const el = document.getElementById("otp-" + (i + 1)); if (el) el.focus(); }
  }
  return (
    <AuthShell plat={plat} tone={tone}>
      <button className="auth-back" onClick={() => go("signin")}><IconBack size={15} /> Back to sign in</button>
      <Head plat={plat} kicker="Two-factor" title={<>Enter your <em style={{ fontStyle: "italic", color: "var(--accent)" }}>code.</em></>} />
      <p className="body" style={{ marginTop: 12, fontSize: 15, color: "var(--ink-3)", maxWidth: 380 }}>Open your authenticator app and enter the 6-digit code for {plat.wordmark}.</p>
      <div style={{ marginTop: 26 }}>
        <div className="auth-otp">
          {vals.map((v, i) => (
            <input key={i} id={"otp-" + i} className="auth-otp-cell" inputMode="numeric" maxLength={1}
              value={v} onChange={(e) => setAt(i, e.target.value)} />
          ))}
        </div>
        <PrimaryBtn onClick={() => go(null)}>Verify <IconArrow size={17} /></PrimaryBtn>
        <div style={{ display: "flex", gap: 18, marginTop: 16, fontSize: 13.5 }}>
          <TextLink>Resend code</TextLink>
          <TextLink>Use a recovery code</TextLink>
        </div>
      </div>
    </AuthShell>
  );
}

function AdminBootstrap({ plat, tone, go }) {
  return (
    <AuthShell plat={plat} tone={tone}>
      <Head plat={plat} kicker="First run · create owner" title={<>Claim this <em style={{ fontStyle: "italic", color: "var(--accent)" }}>workspace.</em></>} />
      <p className="body" style={{ marginTop: 12, fontSize: 15, color: "var(--ink-3)", maxWidth: 400 }}>No administrator exists yet. The first account becomes the system owner — with full access and audit responsibility.</p>
      <div className="auth-callout"><span className="auth-callout-ic"><IconKey size={15} /></span>This step is shown only once. Store the recovery codes you'll receive next.</div>
      <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="auth-2col">
          <Field label="Full name" placeholder="Jane Operator" />
          <Field label="Work email" type="email" placeholder="you@company.com" icon={<IconMail />} />
        </div>
        <Field label="Password" type="password" placeholder="At least 12 characters" icon={<IconLock />} />
        <Field label="Confirm password" type="password" placeholder="••••••••" icon={<IconLock />} />
        <label className="check" style={{ fontSize: 13.5, alignItems: "flex-start" }}>
          <input type="checkbox" /><span className="box" style={{ marginTop: 1 }}></span>
          <span>I understand I'm the system owner and will enable two-factor immediately after setup.</span>
        </label>
        <PrimaryBtn onClick={() => go("mfa")}>Create owner account <IconArrow size={17} /></PrimaryBtn>
      </div>
    </AuthShell>
  );
}

const AUTH_SCREEN_COMPONENTS = {
  signin: SignIn, signup: SignUp, forgot: Forgot, reset: Reset, mfa: MfaVerify, bootstrap: AdminBootstrap,
};

Object.assign(window, { AuthShell, BrandPanel, Logo, AUTH_SCREEN_COMPONENTS });
