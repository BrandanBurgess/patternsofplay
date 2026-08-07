// Minimal token-styled screen (Brief section 8: the handoff has no
// sign-up/login screens; build the smallest functional version, no
// invented navigation). Structure only, no invented surfaces: the look
// comes entirely from auth.css, which uses the shared token system and the
// same card/pill/gold-primary idiom as every designed screen (T-050).

import { FormEvent, useState } from "react";
import { ApiError, Role, login, register } from "./api";
import "./auth.css";

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
      {/* Decorative (T-070 follow-up): MinimalShell's h1 above this
          screen already exposes "Patterns of Play" as the page's
          accessible name (App.test.tsx and the e2e journeys assert on
          that heading), so this img stays out of the accessibility tree
          instead of re-announcing the same text a second time, the same
          alt="" + aria-hidden pattern AppShell.tsx and App.tsx use for
          the nav/topbar shield mark. */}
      <img className="auth-lockup" src="/logo-lockup.png" alt="" aria-hidden="true" />
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
