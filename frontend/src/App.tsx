import { useEffect, useState } from "react";
import ThemeSwitcher from "./theme/ThemeSwitcher";
import "./App.css";

export default function App() {
  const [apiStatus, setApiStatus] = useState("checking");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((r) => r.json())
      .then((d: { status: string }) => {
        if (!cancelled) setApiStatus(d.status);
      })
      .catch(() => {
        if (!cancelled) setApiStatus("unreachable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <h1 className="app-brand">Patterns of Play</h1>
        <ThemeSwitcher />
      </header>
      <main className="app-main">
        <p className="app-status">API status: {apiStatus}</p>
      </main>
    </div>
  );
}
