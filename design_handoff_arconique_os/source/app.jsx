/* Arconique OS — main app */

const { useState, useEffect } = React;

function App() {
  const [app, setApp] = useState(() => localStorage.getItem("arc.app") || "mgmt");
  const [route, setRoute] = useState(() => localStorage.getItem("arc.route") || "overview");

  useEffect(() => { localStorage.setItem("arc.app", app); }, [app]);
  useEffect(() => { localStorage.setItem("arc.route", route); }, [route]);

  return (
    <div className="app-root">
      <Sidebar app={app} setApp={setApp} route={route} setRoute={setRoute} />
      <div className="main">
        <TopBar app={app} />
        <div className="content">
          {app === "mgmt" ? <ManagementApp route={route} /> : <DevelopmentApp route={route} />}
        </div>
      </div>
      <MobileTabbar app={app} route={route} setRoute={setRoute} />
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
