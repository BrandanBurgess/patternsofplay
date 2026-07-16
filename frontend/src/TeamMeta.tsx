// Compact team identity cluster for the app shell topbar (T-030). Team
// creation/join has no designed screen (Brief section 8 gap); this remains
// the smallest functional surface for it (join codes, role, logout), just
// relocated from its own landing page into the topbar now that the
// Whiteboard is the landing page. Testids/text kept stable on purpose: the
// T-003 platform DoD journey (e2e/auth-teams.spec.ts) asserts on this exact
// shape (a team-name heading, "(role)" text, a join-code testid, a "Log
// out" button, and the join-code block ABSENT from the DOM for players).
//
// T-043 (founder decision 2026-07-16): two codes now, player and coach,
// both coach-only (both keys are simply absent on a player's own
// membership.team, per CLAUDE.md rule 5 / app/schemas.py CoachTeamOut),
// plus a coach-only, collapsed-by-default member list: any coach can see
// who is on the team, but remove/role controls render ONLY for the head
// coach (the team's creator, Team.created_by == the signed-in user's own
// id). The API re-enforces the head-coach check independently
// (app/deps.py require_head_coach); this is only the rendering gate.

import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  MembershipOut,
  Role,
  TeamMemberOut,
  UserOut,
  fetchTeamMembers,
  removeTeamMember,
  updateTeamMemberRole,
} from "./api";

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
  const isHeadCoach = isCoach && membership.team.created_by === user.id;

  return (
    <div className="team-meta">
      <div className="team-meta-text">
        <h2 className="team-meta-name">{membership.team.name}</h2>
        <p className="team-meta-role">
          {user.display_name} ({membership.role_on_team})
        </p>
        {isCoach && (
          <div className="join-codes">
            <p className="join-code">
              Player code: <strong data-testid="join-code-player">{membership.team.join_code}</strong>
            </p>
            <p className="join-code">
              Coach code: <strong data-testid="join-code-coach">{membership.team.coach_join_code}</strong>
            </p>
          </div>
        )}
      </div>
      {isCoach && <TeamMembers currentUserId={user.id} isHeadCoach={isHeadCoach} />}
      <button type="button" className="team-meta-logout" onClick={onLogout}>
        Log out
      </button>
    </div>
  );
}

function TeamMembers({
  currentUserId,
  isHeadCoach,
}: {
  currentUserId: number;
  isHeadCoach: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [members, setMembers] = useState<TeamMemberOut[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      setMembers(await fetchTeamMembers());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the team members.");
    }
  }, []);

  useEffect(() => {
    if (expanded) refresh();
  }, [expanded, refresh]);

  const handleRemove = useCallback(
    async (memberId: number) => {
      setBusyId(memberId);
      try {
        await removeTeamMember(memberId);
        await refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not remove this member.");
      } finally {
        setBusyId(null);
      }
    },
    [refresh]
  );

  const handleRoleChange = useCallback(
    async (memberId: number, nextRole: Role) => {
      setBusyId(memberId);
      try {
        await updateTeamMemberRole(memberId, nextRole);
        await refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not change this member's role.");
      } finally {
        setBusyId(null);
      }
    },
    [refresh]
  );

  return (
    <div className="team-members">
      <button
        type="button"
        className="team-members-toggle"
        data-testid="team-members-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        Manage team
      </button>
      {expanded && (
        <div className="team-members-panel" data-testid="team-members-panel">
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <ul className="team-members-list">
            {(members ?? []).map((member) => {
              const isSelf = member.user_id === currentUserId;
              return (
                <li
                  key={member.id}
                  className="team-members-row"
                  data-testid={`team-member-row-${member.id}`}
                >
                  <span className="team-members-name">
                    {member.display_name} ({member.role_on_team}
                    {member.is_head_coach ? ", head coach" : ""}){isSelf ? " (you)" : ""}
                  </span>
                  {isHeadCoach && !isSelf && (
                    <span className="team-members-controls">
                      <button
                        type="button"
                        className="team-members-btn"
                        data-testid={`team-member-toggle-role-${member.id}`}
                        disabled={busyId === member.id}
                        onClick={() =>
                          handleRoleChange(
                            member.id,
                            member.role_on_team === "coach" ? "player" : "coach"
                          )
                        }
                      >
                        Make {member.role_on_team === "coach" ? "player" : "coach"}
                      </button>
                      <button
                        type="button"
                        className="team-members-btn"
                        data-testid={`team-member-remove-${member.id}`}
                        disabled={busyId === member.id}
                        onClick={() => handleRemove(member.id)}
                      >
                        Remove
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
