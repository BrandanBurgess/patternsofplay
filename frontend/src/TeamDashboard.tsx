// Minimal token-styled landing screen after auth + team setup are done.
// Shows the join code only to the coach, per the demo path (Brief section
// 6: "coach... sees a join code") and the acceptance criteria in section 5.

import { MembershipOut, UserOut } from "./api";

export function TeamDashboard({
  user,
  memberships,
  onLogout,
}: {
  user: UserOut;
  memberships: MembershipOut[];
  onLogout: () => void;
}) {
  const membership = memberships[0];
  const isCoach = membership.role_on_team === "coach";

  return (
    <section className="team-dashboard">
      <h2>{membership.team.name}</h2>
      <p>
        Signed in as {user.display_name} ({membership.role_on_team})
      </p>
      {isCoach && (
        <p className="join-code">
          Join code: <strong>{membership.team.join_code}</strong>
        </p>
      )}
      <button type="button" onClick={onLogout}>
        Log out
      </button>
    </section>
  );
}
