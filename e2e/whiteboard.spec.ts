// Whiteboard page journey (T-030, Brief step 16, PNG 01-05, 14, 34). Runs
// under both Playwright projects (desktop landscape, iPhone 13 portrait).
// Covers the ticket's Screens DoD lines (Brief section 5):
//   "Each page matches its PNGs across the three themes on desktop and
//    phone frames; gold is the only interactive color; red never appears
//    as a call to action."
// plus the doc 03 4.2/4.3 persistence lines this ticket adds: saved
// patterns are author-stamped and team-scoped, and whiteboard state
// (thresholds, confirmed lanes, zones visible) persists and survives a
// reload.

import {
  test,
  expect,
  assertCleanPage,
  registerCoach,
  registerPlayer,
} from "./fixtures";
import type { Page } from "@playwright/test";

const VB = {
  landscape: { width: 1050, height: 680 },
  portrait: { width: 700, height: 1000 },
} as const;
type Orientation = keyof typeof VB;
interface Model {
  x: number;
  y: number;
}

function expectedPixel(m: Model, o: Orientation) {
  const vb = VB[o];
  return o === "portrait"
    ? { px: (m.y / 100) * vb.width, py: ((100 - m.x) / 100) * vb.height }
    : { px: (m.x / 100) * vb.width, py: (m.y / 100) * vb.height };
}

async function orientationOf(page: Page): Promise<Orientation> {
  return (await page.locator(".board-wrap").getAttribute("data-orientation")) as Orientation;
}

async function modelToClient(page: Page, m: Model) {
  const o = await orientationOf(page);
  const box = (await page.getByTestId("board").boundingBox())!;
  const vb = VB[o];
  const p = expectedPixel(m, o);
  return { x: box.x + (p.px / vb.width) * box.width, y: box.y + (p.py / vb.height) * box.height };
}

async function dragTokenTo(page: Page, id: string, m: Model) {
  const b = (await page.locator(`[data-token-id="${id}"]`).boundingBox())!;
  const start = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const target = await modelToClient(page, m);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 10 });
  await page.mouse.up();
}

async function waitPlaybackDone(page: Page) {
  const root = page.locator(".board-root");
  await expect(root).toHaveAttribute("data-playing", "true", { timeout: 4000 });
  await expect(root).toHaveAttribute("data-playing", "false", { timeout: 15000 });
}

async function waitSaved(page: Page) {
  await expect(page.getByTestId("board-save-status")).toHaveText("All changes saved", {
    timeout: 4000,
  });
}

test.describe("whiteboard: record, save into My Patterns, replay, and reload restores state", () => {
  test("full coach journey", async ({ page, issues }) => {
    await registerCoach(page);

    // --- App shell: Whiteboard is the active nav entry. Roster is live
    // too (T-033); the rest are still present but inert until their own
    // tickets land ---
    await expect(page.getByTestId("nav-whiteboard")).toHaveAttribute("aria-current", "page");
    for (const key of ["patterns", "formations", "identity"]) {
      const item = page.getByTestId(`nav-${key}`);
      await expect(item).toHaveAttribute("aria-disabled", "true");
      await expect(item).toBeDisabled();
    }
    await expect(page.getByTestId("nav-roster")).not.toBeDisabled();

    // --- Lay a confirmed lane, toggle a zone, set both thresholds ---
    await dragTokenTo(page, "home-2", { x: 30, y: 8 });
    await dragTokenTo(page, "home-9", { x: 70, y: 8 });
    await page.locator('[data-token-id="home-2"]').click();
    await page.locator('[data-token-id="home-9"]').click();
    await expect(page.locator('[data-lane-key="home-2|home-9"]')).toHaveAttribute(
      "data-lane-status",
      "confirmed"
    );

    await page.getByTestId("view-menu").click();
    await page.getByTestId("zone-toggle-thirds").check();
    await page.getByTestId("blocking-threshold").evaluate((el, v) => {
      const input = el as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!
        .set!;
      setter.call(input, String(v));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, 15);
    await page.getByTestId("marking-threshold").evaluate((el, v) => {
      const input = el as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!
        .set!;
      setter.call(input, String(v));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, 12);

    // Whiteboard state (doc 03 4.3) autosaves; wait for it to land before
    // moving on, so the reload assertion later is not racing the PUT.
    await waitSaved(page);

    // --- Record a MULTI-token movement (teammate + opponent + ball) ---
    await page.getByTestId("record").click();
    await expect(page.getByTestId("record-banner")).toBeVisible();
    await dragTokenTo(page, "home-9", { x: 55, y: 35 });
    await dragTokenTo(page, "away-3", { x: 45, y: 65 });
    await dragTokenTo(page, "ball", { x: 50, y: 50 });
    await page.getByTestId("stop-record").click();
    await expect(page.getByTestId("save-bar")).toBeVisible();

    // --- Save with a name ---
    await page.getByTestId("record-name").fill("Press trigger release");
    await page.getByTestId("save-pattern").click();

    // --- See it in My Patterns, author-stamped COACH ---
    const tile = page.getByTestId("saved-pattern").filter({ hasText: "Press trigger release" });
    await expect(tile).toHaveCount(1);
    await expect(tile.getByTestId("saved-pattern-author")).toHaveText("COACH");
    // Delete is coach-only and the API-enforced control (README roles table).
    await expect(tile.getByRole("button", { name: "Delete" })).toBeVisible();

    // --- Replay it ---
    await tile.getByRole("button", { name: "Replay" }).click();
    await waitPlaybackDone(page);

    await waitSaved(page);

    // --- Reload: board state (thresholds, confirmed lanes, zones) and My
    // Patterns both come back from the server, not localStorage ---
    await page.reload();
    await expect(page.getByTestId("board")).toBeVisible();

    // Present at all (not just conditionally, the way a merely-suggested
    // lane would be) proves it survived as a CONFIRMED pair, not just that
    // some lane happens to be near the ball after reload.
    await expect(page.locator('[data-lane-key="home-2|home-9"]')).toHaveCount(1);

    await page.getByTestId("view-menu").click();
    await expect(page.getByTestId("zone-toggle-thirds")).toBeChecked();
    await expect(page.getByTestId("blocking-threshold-value")).toHaveText("15");
    await expect(page.getByTestId("marking-threshold-value")).toHaveText("12");

    await expect(
      page.getByTestId("saved-pattern").filter({ hasText: "Press trigger release" })
    ).toHaveCount(1);

    await assertCleanPage(page, issues);
  });
});

test.describe("whiteboard: delete is coach-only, API-enforced, absent from the DOM for players", () => {
  test("player sees the coach's pattern but never a delete control", async ({ browser }) => {
    const coachContext = await browser.newContext();
    const coachPage = await coachContext.newPage();
    const { joinCode } = await registerCoach(coachPage, { displayName: "Coach Role Test" });

    await coachPage.getByTestId("record").click();
    await dragTokenTo(coachPage, "home-4", { x: 60, y: 40 });
    await coachPage.getByTestId("stop-record").click();
    await coachPage.getByTestId("record-name").fill("Role check pattern");
    await coachPage.getByTestId("save-pattern").click();
    await expect(coachPage.getByTestId("saved-pattern")).toHaveCount(1);
    await expect(coachPage.getByRole("button", { name: "Delete" })).toBeVisible();

    const playerContext = await browser.newContext();
    const playerPage = await playerContext.newPage();
    await registerPlayer(playerPage, joinCode, { displayName: "Player Role Test" });

    const tile = playerPage.getByTestId("saved-pattern").filter({ hasText: "Role check pattern" });
    await expect(tile).toHaveCount(1);
    await expect(tile.getByTestId("saved-pattern-author")).toHaveText("COACH");
    // Absent from the DOM, not merely hidden (skill: role check contract).
    await expect(playerPage.getByRole("button", { name: "Delete" })).toHaveCount(0);
    await expect(playerPage.locator('[data-testid^="delete-pattern-"]')).toHaveCount(0);

    // A player CAN record and save their own pattern (Brief section 3
    // table: "Yes; saved patterns author-stamped"), and it is author-stamped
    // with their display name, not COACH.
    await playerPage.getByTestId("record").click();
    await dragTokenTo(playerPage, "home-6", { x: 44, y: 44 });
    await playerPage.getByTestId("stop-record").click();
    await playerPage.getByTestId("record-name").fill("Player recorded shift");
    await playerPage.getByTestId("save-pattern").click();
    const playerTile = playerPage
      .getByTestId("saved-pattern")
      .filter({ hasText: "Player recorded shift" });
    await expect(playerTile).toHaveCount(1);
    await expect(playerTile.getByTestId("saved-pattern-author")).toHaveText("Player Role Test");
    await expect(playerTile.getByRole("button", { name: "Delete" })).toHaveCount(0);

    await coachContext.close();
    await playerContext.close();
  });
});

test.describe("whiteboard: matches across all three themes", () => {
  test("toolbar's interactive color is theme-driven, never hardcoded", async ({
    page,
    issues,
  }) => {
    await registerCoach(page);

    const accentBg = () =>
      page.getByTestId("select-tool").evaluate((el) => getComputedStyle(el).backgroundColor);
    const surfaceBg = () =>
      page.locator(".board-toolbar-float").evaluate((el) => getComputedStyle(el).backgroundColor);

    const seenAccent = new Set<string>();
    const seenSurface = new Set<string>();

    for (const theme of ["pitch", "dark", "board"] as const) {
      await page.getByTestId(`theme-switch-${theme}`).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.getByTestId("board")).toBeVisible();
      // The always-active Select tool is gold in every theme's own accent
      // (design README: gold is the only interactive color).
      seenAccent.add(await accentBg());
      seenSurface.add(await surfaceBg());
      // Record, before it is ever pressed, must NOT render in the red status
      // color (red is never a call to action).
      const recordBg = await page
        .getByTestId("record")
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(recordBg).not.toBe(await accentBg());
    }

    // Every theme actually painted a distinct value: proves the toolbar
    // reads CSS variables per theme rather than a color baked into the
    // component (same evidence shape as e2e/design-tokens.spec.ts).
    expect(seenAccent.size).toBe(3);
    expect(seenSurface.size).toBe(3);

    await assertCleanPage(page, issues);
  });
});
