import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import App from "./App";

beforeEach(() => {
  // App calls GET /api/auth/me on mount to decide which screen to show.
  // Stub it out so this unit test exercises only the app shell, not the
  // network; the auth/join flow itself is covered by the e2e journey.
  // /me is a 200 probe even when signed out (see backend app/deps.py).
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ user: null, memberships: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("renders the app shell heading", async () => {
  render(<App />);
  expect(
    screen.getByRole("heading", { name: "Patterns of Play" })
  ).toBeDefined();
  await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/auth/me", expect.anything()));
});
