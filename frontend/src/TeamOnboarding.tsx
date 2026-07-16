// Minimal token-styled screens for team creation and join-by-code (Brief
// section 8: no designed surface exists for either; smallest functional
// version, existing component idioms only, no invented navigation).
//
// T-043 (founder decision 2026-07-16): a join code now carries its own
// role (player code vs coach code), so which role an account already has
// no longer decides anything about joining. A coach-role account can
// still ALSO create its own team (team creation stays a coach-account
// action, unchanged), but every account, coach or player, gets the join
// form: a coach-role account needs it to join an existing team as a
// player (or as a second coach), exactly as a player-role account needs
// it to join as a coach if handed the coach code.

import { FormEvent, useState } from "react";
import { ApiError, Role, createTeam, joinTeam } from "./api";

export function TeamOnboarding({
  role,
  onTeamReady,
}: {
  role: Role;
  onTeamReady: () => void;
}) {
  return (
    <div className="team-onboarding">
      {role === "coach" && <CreateTeamForm onTeamReady={onTeamReady} />}
      <JoinTeamForm onTeamReady={onTeamReady} />
    </div>
  );
}

function CreateTeamForm({ onTeamReady }: { onTeamReady: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await createTeam({ name });
      onTeamReady();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the team, try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="team-form">
      <h2>Create your team</h2>
      <label>
        Team name
        <input value={name} onChange={(event) => setName(event.target.value)} required />
      </label>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button type="submit" disabled={submitting}>
        Create team
      </button>
    </form>
  );
}

function JoinTeamForm({ onTeamReady }: { onTeamReady: () => void }) {
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await joinTeam({ join_code: joinCode });
      onTeamReady();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not join, check the code and try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="team-form">
      <h2>Join your team</h2>
      <p className="team-form-hint">
        Enter the code your coach gave you. Your role on the team comes from the code itself, a
        player code or a coach code, not from how you registered.
      </p>
      <label>
        Join code
        <input
          value={joinCode}
          onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
          required
          maxLength={12}
        />
      </label>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button type="submit" disabled={submitting}>
        Join team
      </button>
    </form>
  );
}
