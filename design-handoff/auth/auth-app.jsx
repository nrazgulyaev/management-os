/* Auth prototype — app shell, navigator, router. Loaded last. */
const { useState, useEffect } = React;

const SWATCH = {
  management: "#C4583C", owner: "#BC9A5C", development: "#FF6B35",
  investor: "#3D5A7A", buyer: "#E48A6E", platform: "#5B9DFF",
};

function Done({ plat, go }) {
  return (
    <div className="auth-done" data-product={plat.dataProduct}>
      <div className="auth-done-card">
        <div className="auth-done-ring">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
        </div>
        <h1 style={{ fontFamily: "var(--display-font)", fontWeight: 400, fontSize: 32, color: "var(--ink)", margin: 0, letterSpacing: "-0.02em" }}>You're in.</h1>
        <p className="body" style={{ marginTop: 10, color: "var(--ink-3)", fontSize: 15 }}>Signed in to {plat.label}. Redirecting to your workspace…</p>
        <button className="btn btn-secondary" style={{ marginTop: 22 }} onClick={() => go("signin")}>Back to sign in</button>
      </div>
    </div>
  );
}

function App() {
  const saved = (() => { try { return JSON.parse(localStorage.getItem("arc-auth") || "{}"); } catch (e) { return {}; } })();
  const [platform, setPlatform] = useState(saved.platform || "management");
  const [screen, setScreen] = useState(saved.screen || "signin");
  const [tone, setTone] = useState(saved.tone || "warm");

  useEffect(() => {
    localStorage.setItem("arc-auth", JSON.stringify({ platform, screen, tone }));
  }, [platform, screen, tone]);

  const plat = AUTH_PLATFORMS[platform];
  const go = (s) => setScreen(s === null ? "done" : s);

  let body;
  if (screen === "done") {
    body = <Done plat={plat} go={go} />;
  } else {
    const Comp = AUTH_SCREEN_COMPONENTS[screen] || AUTH_SCREEN_COMPONENTS.signin;
    body = <Comp key={platform + screen + tone} plat={plat} tone={tone} go={go} />;
  }

  return (
    <>
      <div className="nav">
        <div className="nav-brand"><span className="dot"></span>Auth suite</div>
        <div className="nav-tabs">
          {AUTH_PLATFORM_ORDER.map((k) => (
            <button key={k} className={"nav-tab" + (platform === k ? " on" : "")}
              onClick={() => { setPlatform(k); if (screen === "done") setScreen("signin"); }}>
              <span className="sw" style={{ background: SWATCH[k] }}></span>{AUTH_PLATFORMS[k].label}
            </button>
          ))}
        </div>
        <div className="nav-spacer"></div>
        <div className="nav-group">
          <span className="nav-label">Screen</span>
          <div className="nav-screens">
            {AUTH_SCREENS.map((s) => (
              <button key={s.key} className={screen === s.key ? "on" : ""} onClick={() => setScreen(s.key)}>{s.label}</button>
            ))}
          </div>
        </div>
        <div className="nav-group">
          <span className="nav-label">Tone</span>
          <div className="nav-seg">
            {AUTH_TONE_ORDER.map((k) => (
              <button key={k} className={tone === k ? "on" : ""} onClick={() => setTone(k)}>{AUTH_TONES[k].label}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="auth-canvas">{body}</div>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
