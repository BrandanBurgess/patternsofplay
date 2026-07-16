import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Orientation } from "./board/coords";
import { MeOut, fetchMe, logout as apiLogout } from "./api";
import { AuthForms } from "./AuthForms";
import { AppShell, type NavKey } from "./AppShell";
import { TeamOnboarding } from "./TeamOnboarding";
import { WhiteboardPage } from "./pages/WhiteboardPage";
import { PatternsPage } from "./pages/PatternsPage";
import { RosterPage } from "./pages/RosterPage";
import ThemeSwitcher from "./theme/ThemeSwitcher";
import "./App.css";

// Nav entries live so far (T-031 Patterns, T-033 Roster alongside T-030's
// Whiteboard); Formations/Identity join this list as their own
// tickets land, without AppShell.tsx itself needing another edit.
const ENABLED_NAV_KEYS: readonly NavKey[] = ["whiteboard", "patterns", "roster"];

// Portrait on phone-width viewports, landscape otherwise (design README: all
// boards render portrait on phone). Derived purely from viewport width, no
// manual override: this is how a real device actually decides it.
const PORTRAIT_QUERY = "(max-width: 700px)";

function usePreferredOrientation(): Orientation {
  const initial: Orientation =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(PORTRAIT_QUERY).matches
        ? "portrait"
        : "landscape"
      : "landscape";
  const [orientation, setOrientation] = useState<Orientation>(initial);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(PORTRAIT_QUERY);
    const onChange = () => setOrientation(mq.matches ? "portrait" : "landscape");
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return orientation;
}

// The pre-team-ready chrome (loading / signed-out / onboarding): same
// topbar shape as the full AppShell (T-002's theme switcher must work
// before an account exists), just without the sidebar there is nothing yet
// to navigate.
function MinimalShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="app-topbar">
        <h1 className="app-brand">
          <span className="app-brand-dot" aria-hidden="true" />
          Patterns of Play
        </h1>
        <ThemeSwitcher />
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}

export default function App() {
  const [me, setMe] = useState<MeOut | null>(null);
  const [page, setPage] = useState<NavKey>("whiteboard");
  const orientation = usePreferredOrientation();

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

  if (me === null) {
    return (
      <MinimalShell>
        <p className="app-status">Loading...</p>
      </MinimalShell>
    );
  }

  if (me.user === null) {
    return (
      <MinimalShell>
        <AuthForms onAuthenticated={refreshMe} />
      </MinimalShell>
    );
  }

  if (me.memberships.length === 0) {
    return (
      <MinimalShell>
        <TeamOnboarding role={me.user.role} onTeamReady={refreshMe} />
      </MinimalShell>
    );
  }

  const membership = me.memberships[0];

  // The whiteboard is now an authenticated page (sign in to save; the PNGs
  // assume a signed-in coach). Player recordings are still allowed
  // (Brief section 3 table), just author-stamped with their own name.
  return (
    <AppShell
      user={me.user}
      membership={membership}
      active={page}
      enabledKeys={ENABLED_NAV_KEYS}
      onNavigate={setPage}
      onLogout={handleLogout}
    >
      {page === "patterns" ? (
        <PatternsPage orientation={orientation} onOpenOnWhiteboard={() => setPage("whiteboard")} />
      ) : page === "roster" ? (
        <RosterPage role={membership.role_on_team} />
      ) : (
        <WhiteboardPage orientation={orientation} role={membership.role_on_team} />
      )}
    </AppShell>
  );
}
