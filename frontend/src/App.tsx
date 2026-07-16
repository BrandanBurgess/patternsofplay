import { useCallback, useEffect, useState } from "react";
import ThemeSwitcher from "./theme/ThemeSwitcher";
import Board from "./board/Board";
import type { Orientation } from "./board/coords";
import { MeOut, fetchMe, logout as apiLogout } from "./api";
import { AuthForms } from "./AuthForms";
import { TeamDashboard } from "./TeamDashboard";
import { TeamOnboarding } from "./TeamOnboarding";
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
  const [me, setMe] = useState<MeOut | null>(null);
  const preferred = usePreferredOrientation();
  const [override, setOverride] = useState<Orientation | null>(null);
  const orientation = override ?? preferred;

  const refreshMe = useCallback(async () => {
    setMe(await fetchMe());
  }, []);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  const handleLogout = useCallback(async () => {
    await apiLogout();
    await refreshMe();
  }, [refreshMe]);

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <h1 className="app-brand">Patterns of Play</h1>
        <ThemeSwitcher />
      </header>
      <main className="app-main">
        {/* Temporary board mount until the whiteboard page proper lands in
            T-030. Kept outside the auth gate so the board journeys stay
            exercisable without an account, and above the auth flow so its
            content swaps never shift the board's layout mid-gesture. */}
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
        {me === null && <p className="app-status">Loading...</p>}
        {me !== null && me.user === null && <AuthForms onAuthenticated={refreshMe} />}
        {me !== null && me.user !== null && me.memberships.length === 0 && (
          <TeamOnboarding role={me.user.role} onTeamReady={refreshMe} />
        )}
        {me !== null && me.user !== null && me.memberships.length > 0 && (
          <TeamDashboard user={me.user} memberships={me.memberships} onLogout={handleLogout} />
        )}
      </main>
    </div>
  );
}
