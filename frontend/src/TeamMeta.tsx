// Compact team identity cluster for the app shell topbar (T-030). Team
// creation/join has no designed screen (Brief section 8 gap); this remains
// the smallest functional surface for it (join code, role, logout), just
// relocated from its own landing page into the topbar now that the
// Whiteboard is the landing page. Testids/text kept stable on purpose: the
// T-003 platform DoD journey (e2e/auth-teams.spec.ts) asserts on this exact
// shape (a team-name heading, "(role)" text, ".join-code strong", a "Log
// out" button, and the join-code block ABSENT from the DOM for players).

import { MembershipOut, UserOut } from "./api";

export function TeamMeta({
  user,
  membership,
  onLogout,
}: {
  user: UserOut;
  membership: MembershipOut;
  onLogout: () => void;
}) {
  const isCoach = membership.role_on_team === "coach";

  return (
    <div className="team-meta">
      <div className="team-meta-text">
        <h2 className="team-meta-name">{membership.team.name}</h2>
        <p className="team-meta-role">
          {user.display_name} ({membership.role_on_team})
        </p>
        {isCoach && (
          <p className="join-code">
            Join code: <strong>{membership.team.join_code}</strong>
          </p>
        )}
      </div>
      <button type="button" className="team-meta-logout" onClick={onLogout}>
        Log out
      </button>
    </div>
  );
}
