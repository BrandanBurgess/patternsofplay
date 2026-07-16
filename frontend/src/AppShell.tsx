// The app shell: topbar + sidebar nav (desktop PNGs) / 52px icon rail (phone,
// design README "Screens & interaction conventions"). T-030 is the first real
// page, so this is the minimal navigation the handoff shows: five entries,
// only Whiteboard live. The rest render present but inert (no onClick, no
// href) until their own tickets (T-031..T-034) land, per this ticket's brief:
// "do not invent surfaces beyond what the PNGs show."

import type { ReactNode } from "react";
import ThemeSwitcher from "./theme/ThemeSwitcher";
import { TeamMeta } from "./TeamMeta";
import type { MembershipOut, UserOut } from "./api";
import "./AppShell.css";

function IconWhiteboard() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 13 L9 9.2 L11.3 11.3 L15 7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconPatterns() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 10 H17 M10 3 C7 6.5 7 13.5 10 17 C13 13.5 13 6.5 10 3" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
function IconFormations() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <circle cx="10" cy="4" r="1.8" fill="currentColor" />
      <circle cx="4" cy="12" r="1.8" fill="currentColor" />
      <circle cx="16" cy="12" r="1.8" fill="currentColor" />
      <circle cx="10" cy="17" r="1.8" fill="currentColor" />
    </svg>
  );
}
function IconRoster() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <circle cx="7" cy="6.5" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="14" cy="8" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.5 17 C2.5 13 4.5 11.3 7 11.3 C9.5 11.3 11.5 13 11.5 17" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12.5 12 C14.5 12 17.5 13.2 17.5 17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function IconIdentity() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <path
        d="M10 2 L12.2 7.4 L18 7.9 L13.5 11.7 L14.9 17.4 L10 14.2 L5.1 17.4 L6.5 11.7 L2 7.9 L7.8 7.4 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const NAV_ITEMS = [
  { key: "whiteboard", label: "Whiteboard", icon: <IconWhiteboard /> },
  { key: "patterns", label: "Patterns", icon: <IconPatterns /> },
  { key: "formations", label: "Formations", icon: <IconFormations /> },
  { key: "roster", label: "Roster", icon: <IconRoster /> },
  { key: "identity", label: "Identity", icon: <IconIdentity /> },
] as const;

export type NavKey = (typeof NAV_ITEMS)[number]["key"];

export function AppShell({
  user,
  membership,
  active,
  onLogout,
  children,
}: {
  user: UserOut;
  membership: MembershipOut;
  active: NavKey;
  onLogout: () => void;
  children: ReactNode;
}) {
  return (
    <div className="app-shell">
      <header className="app-topbar">
        <h1 className="app-brand">
          <span className="app-brand-dot" aria-hidden="true" />
          Patterns of Play
        </h1>
        <div className="app-topbar-end">
          <TeamMeta user={user} membership={membership} onLogout={onLogout} />
          <ThemeSwitcher />
        </div>
      </header>
      <div className="app-body">
        <nav className="app-sidebar" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const isActive = item.key === active;
            return (
              <button
                key={item.key}
                type="button"
                className={`app-nav-item${isActive ? " app-nav-item-active" : ""}`}
                data-testid={`nav-${item.key}`}
                aria-current={isActive ? "page" : undefined}
                // Every entry but Whiteboard is inert until its ticket lands
                // (T-031..T-034): present in the rail, no destination yet.
                aria-disabled={isActive ? undefined : "true"}
                disabled={!isActive}
              >
                {item.icon}
                <span className="app-nav-label">{item.label}</span>
              </button>
            );
          })}
        </nav>
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
