// Minimal token-styled screen (Brief section 8: the handoff has no
// sign-up/login screens; build the smallest functional version, no
// invented navigation). Plain structure only: T-002's token system has
// not merged yet, so this deliberately carries no color values or
// invented styling of its own.

import { FormEvent, useState } from "react";
import { ApiError, Role, login, register } from "./api";

type Mode = "register" | "login";

export function AuthForms({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [mode, setMode] = useState<Mode>("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<Role>("coach");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "register") {
        await register({ email, password, display_name: displayName, role });
      } else {
        await login({ email, password });
      }
      onAuthenticated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong, try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="auth-forms">
      <form onSubmit={handleSubmit} className="auth-form">
        <h2>{mode === "register" ? "Register" : "Log in"}</h2>
        {mode === "register" && (
          <label>
            Name
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
            />
          </label>
        )}
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
          />
        </label>
        {mode === "register" && (
          <fieldset>
            <legend>I am a</legend>
            <label>
              <input
                type="radio"
                name="role"
                value="coach"
                checked={role === "coach"}
                onChange={() => setRole("coach")}
              />
              Coach
            </label>
            <label>
              <input
                type="radio"
                name="role"
                value="player"
                checked={role === "player"}
                onChange={() => setRole("player")}
              />
              Player
            </label>
          </fieldset>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting}>
          {mode === "register" ? "Create account" : "Log in"}
        </button>
      </form>
      <button
        type="button"
        className="mode-toggle"
        onClick={() => {
          setMode(mode === "register" ? "login" : "register");
          setError(null);
        }}
      >
        {mode === "register" ? "Already have an account? Log in" : "Need an account? Register"}
      </button>
    </section>
  );
}
