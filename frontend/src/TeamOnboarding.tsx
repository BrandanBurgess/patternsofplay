// Minimal token-styled screens for team creation and join-by-code (Brief
// section 8: no designed surface exists for either; smallest functional
// version, existing component idioms only, no invented navigation).

import { FormEvent, useState } from "react";
import { ApiError, Role, createTeam, joinTeam } from "./api";

export function TeamOnboarding({
  role,
  onTeamReady,
}: {
  role: Role;
  onTeamReady: () => void;
}) {
  return role === "coach" ? (
    <CreateTeamForm onTeamReady={onTeamReady} />
  ) : (
    <JoinTeamForm onTeamReady={onTeamReady} />
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
