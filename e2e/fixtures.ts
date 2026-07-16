// e2e/fixtures.ts . self-verification contract (skill: verify-ui)
// Every journey imports { test, expect, assertCleanPage } from here.
import { test as base, expect, Page } from "@playwright/test";

type Issues = { consoleErrors: string[]; failedRequests: string[]; serverErrors: string[] };

export const test = base.extend<{ issues: Issues }>({
  issues: async ({ page }, use) => {
    const issues: Issues = { consoleErrors: [], failedRequests: [], serverErrors: [] };
    page.on("console", (m) => m.type() === "error" && issues.consoleErrors.push(m.text()));
    page.on("requestfailed", (r) => issues.failedRequests.push(`${r.method()} ${r.url()}`));
    page.on("response", (r) => r.status() >= 500 && issues.serverErrors.push(`${r.status()} ${r.url()}`));
    await use(issues);
  },
});

export { expect };

export async function assertCleanPage(page: Page, issues: Issues) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  expect(overflow, "horizontal overflow").toBe(false);
  expect(issues.consoleErrors, "console errors").toEqual([]);
  expect(issues.failedRequests, "failed requests").toEqual([]);
  expect(issues.serverErrors, "5xx responses").toEqual([]);
}

// ---------------------------------------------------------------------------
// Auth helpers (T-030): the whiteboard is now an authenticated page, so
// every board/lane/zone/player/recorder journey needs a signed-in account
// before it can reach the board. Centralized here so each spec file states
// its intent (registerCoach / registerPlayer) instead of re-deriving the
// register-then-create-team flow.
// ---------------------------------------------------------------------------

const PASSWORD = "correct-horse-battery";

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/** Registers a fresh coach, creates a team, and waits for the whiteboard
 * board to render. Returns the team's join code (coach-only, per the
 * README roles table) for tests that also need a player on the same team. */
export async function registerCoach(
  page: Page,
  opts: { displayName?: string; teamName?: string } = {}
): Promise<{ email: string; joinCode: string }> {
  const email = uniqueEmail("coach");
  await page.goto("/");
  await page.getByLabel("Name").fill(opts.displayName ?? "Coach Test");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("radio", { name: "Coach" }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Team name").fill(opts.teamName ?? `Team ${Date.now()}`);
  await page.getByRole("button", { name: "Create team" }).click();
  await expect(page.getByTestId("board")).toBeVisible();
  const joinCode = (await page.locator(".join-code strong").textContent())?.trim() ?? "";
  return { email, joinCode };
}

/** Registers a fresh player and joins the given team's join code, waiting
 * for the whiteboard board to render. */
export async function registerPlayer(
  page: Page,
  joinCode: string,
  opts: { displayName?: string } = {}
): Promise<{ email: string }> {
  const email = uniqueEmail("player");
  await page.goto("/");
  await page.getByLabel("Name").fill(opts.displayName ?? "Player Test");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("radio", { name: "Player" }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Join code").fill(joinCode);
  await page.getByRole("button", { name: "Join team" }).click();
  await expect(page.getByTestId("board")).toBeVisible();
  return { email };
}

/** Flips the board's rendered orientation by resizing the viewport across
 * the phone/desktop breakpoint (design README: portrait on phone,
 * landscape otherwise). Replaces the old dev-only "Rotate board" toggle
 * (throwaway scaffolding removed in T-030) with the real mechanism.
 *
 * App.tsx derives orientation from a matchMedia "change" listener, which
 * fires asynchronously after the resize (unlike the old toggle's
 * synchronous state update), so this waits for the DOM to actually reflect
 * the flip before returning: otherwise a caller that reads orientation
 * immediately after resizing can observe the pre-flip value. */
export async function flipOrientationViewport(page: Page): Promise<void> {
  const size = page.viewportSize()!;
  const wasPortrait = size.width <= 700;
  const target = wasPortrait ? { width: 1440, height: 900 } : { width: 390, height: 844 };
  await page.setViewportSize(target);
  const expected = wasPortrait ? "landscape" : "portrait";
  await expect(page.locator(".board-wrap")).toHaveAttribute("data-orientation", expected, {
    timeout: 4000,
  });
}
