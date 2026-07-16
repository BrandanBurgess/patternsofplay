import { useEffect, useState } from "react";
import ThemeSwitcher from "./theme/ThemeSwitcher";
import Board from "./board/Board";
import type { Orientation } from "./board/coords";
import "./App.css";

// Portrait on phone-width viewports, landscape otherwise (design README: all
// boards render portrait on phone). A manual toggle lets either orientation be
// exercised on any device, which the round-trip verification relies on.
function usePreferredOrientation(): Orientation {
  const query = "(max-width: 700px)";
  const initial: Orientation =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
        ? "portrait"
        : "landscape"
      : "landscape";
  const [orientation, setOrientation] = useState<Orientation>(initial);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);
    const onChange = () => setOrientation(mq.matches ? "portrait" : "landscape");
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return orientation;
}

export default function App() {
  const [apiStatus, setApiStatus] = useState("checking");
  const preferred = usePreferredOrientation();
  const [override, setOverride] = useState<Orientation | null>(null);
  const orientation = override ?? preferred;

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
        <section className="whiteboard-dev" aria-label="Whiteboard">
          <div className="board-toolbar">
            <button
              type="button"
              onClick={() =>
                setOverride(orientation === "landscape" ? "portrait" : "landscape")
              }
            >
              Rotate board
            </button>
            <span data-testid="orientation-readout">Orientation: {orientation}</span>
          </div>
          <Board orientation={orientation} />
        </section>
      </main>
    </div>
  );
}
