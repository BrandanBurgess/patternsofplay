// Permission gating journey (T-040, Brief step 21). Runs under both
// Playwright projects (mobile iPhone 13 portrait, desktop landscape) per
// playwright.config.ts, so every assertion below is proven on both
// viewports without any viewport-specific code path.
//
// This file is the UI half of the Brief section 3 permission table audit;
// backend/tests/test_permissions.py is the API half, one test per row.
// Per the verify-ui skill's role-check contract: "if the surface differs
// by role, journey runs both roles; assert coach-only elements are ABSENT
// from the DOM for players (not hidden)." Every assertion here uses
// toHaveCount(0), never toBeHidden()/not.toBeVisible(), for exactly that
// reason: a disabled-but-present control would fail these checks the same
// as an absent one, but a hidden-by-CSS control would wrongly pass them.
//
// Coverage against the table (row -> what this file proves for the PLAYER
// role; the coach-role positive case for each of these already has its own
// full journey in whiteboard.spec.ts / roster.spec.ts and is not repeated
// here to avoid duplicating those journeys' maintenance surface):
//   - Delete a saved pattern: absent on Whiteboard for a player, even for
//     a pattern the player authored themselves.
//   - Roster: fit-warning banner, Add player, Edit, Delete all absent for
//     a player; "(view only)" tag present on sliders/work rates.
//   - Pattern library, formations, identity: a player can reach and use
//     the same view/play surfaces a coach can (no row denies this), swept
//     across all three of those pages in one pass.
//   - Ambient coach-only chrome (the join-code block in the topbar) is
//     absent for a player on every one of the five pages, not just the
//     one it happens to be tested on elsewhere (auth-teams.spec.ts checks
//     it once, right after joining; this file checks it does not reappear
//     on navigation to any other page).

import { test, expect, assertCleanPage, registerCoach, registerPlayer } from "./fixtures";
import type { Page } from "@playwright/test";

// Same reasoning as roster.spec.ts's own robustClick: the mobile project's
// touch+keyboard emulation shrinks the visual viewport once a text input
// is focused and never restores it, which can make a plain coordinate
// click land on the wrong element once the page has scrolled. Dispatching
// the event directly targets the element with no coordinate math.
async function robustClick(page: Page, testId: string) {
  const locator = page.getByTestId(testId);
  await locator.scrollIntoViewIfNeeded();
  await locator.dispatchEvent("click");
}

async function goToPage(page: Page, key: "whiteboard" | "patterns" | "roster" | "formations" | "identity") {
  await robustClick(page, `nav-${key}`);
  await expect(page.getByTestId(`nav-${key}`)).toHaveAttribute("aria-current", "page");
}

// Same model->client mapping whiteboard.spec.ts/patterns.spec.ts use (the
// VB constants those files hardcode cancel out algebraically into plain
// x/100, y/100 fractions of the board's own bounding box once portrait's
// axis swap is applied, so this drops the unused constants and keeps only
// the fractions that actually matter).
async function dragTokenTo(page: Page, id: string, m: { x: number; y: number }) {
  const orientation = await page.locator(".board-wrap").first().getAttribute("data-orientation");
  const box = (await page.getByTestId("board").boundingBox())!;
  const fx = orientation === "portrait" ? m.y / 100 : m.x / 100;
  const fy = orientation === "portrait" ? (100 - m.x) / 100 : m.y / 100;
  const target = { x: box.x + fx * box.width, y: box.y + fy * box.height };

  const b = (await page.locator(`[data-token-id="${id}"]`).boundingBox())!;
  const start = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 10 });
  await page.mouse.up();
}

/** Every selector below is a control or data block the Brief section 3
 * table marks coach-only somewhere in the app. Asserted absent, as a full
 * sweep, on whichever page is currently active in `page`. Most of these
 * selectors only ever render on one particular page (e.g. fit-warning
 * only on Roster), so most of these counts are trivially zero on the other
 * four pages; that is the point, this is a blanket sweep proving none of
 * them leak onto a page they were not designed for either. */
async function assertNoCoachOnlyChrome(page: Page) {
  await expect(page.locator(".join-code")).toHaveCount(0);
  // T-043 decision 2/3: both join codes and the head-coach member
  // management toggle are coach-only ambient chrome, same treatment as
  // the join-code block above.
  await expect(page.getByTestId("join-code-player")).toHaveCount(0);
  await expect(page.getByTestId("join-code-coach")).toHaveCount(0);
  await expect(page.getByTestId("team-members-toggle")).toHaveCount(0);
  await expect(page.locator(".fit-warning")).toHaveCount(0);
  await expect(page.getByTestId("roster-add-player")).toHaveCount(0);
  await expect(page.getByTestId("player-edit")).toHaveCount(0);
  await expect(page.getByTestId("player-delete")).toHaveCount(0);
  await expect(page.locator('[data-testid^="delete-pattern-"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
}

test.describe("permissions: player-role visit to every page, coach-only controls and data absent", () => {
  test("whiteboard, patterns, roster, formations, identity", async ({ browser }) => {
    // --- Coach seeds content a player should be able to VIEW but never
    // edit/delete: a saved whiteboard pattern, and a double-exposure
    // roster pair so the fit-warning banner has something to (not) show ---
    const coachContext = await browser.newContext();
    const coachPage = await coachContext.newPage();
    const { joinCode } = await registerCoach(coachPage, { displayName: "Coach Perm Test" });

    await coachPage.getByTestId("record").click();
    await dragTokenTo(coachPage, "home-4", { x: 60, y: 40 });
    await coachPage.getByTestId("stop-record").click();
    await coachPage.getByTestId("record-name").fill("Coach seeded pattern");
    await coachPage.getByTestId("save-pattern").click();
    await expect(
      coachPage.getByTestId("saved-pattern").filter({ hasText: "Coach seeded pattern" })
    ).toHaveCount(1);

    await goToPage(coachPage, "roster");
    async function addPlayerRow(opts: {
      name: string;
      roleCode: string;
      flank: string;
      awr: string;
      dwr: string;
    }) {
      await robustClick(coachPage, "roster-add-player");
      await coachPage.getByTestId("player-name").fill(opts.name);
      await coachPage.getByTestId("player-role").selectOption(opts.roleCode);
      await coachPage.getByTestId("player-flank").selectOption(opts.flank);
      await coachPage.getByTestId("player-awr").selectOption(opts.awr);
      await coachPage.getByTestId("player-dwr").selectOption(opts.dwr);
      await robustClick(coachPage, "player-save");
      await expect(coachPage.getByTestId("player-save")).toHaveCount(0);
    }
    await addPlayerRow({ name: "Wide Winger", roleCode: "touchline_winger", flank: "right", awr: "high", dwr: "low" });
    await addPlayerRow({ name: "Back Runner", roleCode: "overlapping_fb", flank: "right", awr: "high", dwr: "med" });
    await expect(coachPage.getByTestId("fit-warning-right")).toBeVisible();

    // --- Player joins the same team ---
    const playerContext = await browser.newContext();
    const playerPage = await playerContext.newPage();
    const issues = { consoleErrors: [] as string[], failedRequests: [] as string[], serverErrors: [] as string[] };
    playerPage.on("console", (m) => m.type() === "error" && issues.consoleErrors.push(m.text()));
    playerPage.on("requestfailed", (r) => issues.failedRequests.push(`${r.method()} ${r.url()}`));
    playerPage.on("response", (r) => r.status() >= 500 && issues.serverErrors.push(`${r.status()} ${r.url()}`));
    await registerPlayer(playerPage, joinCode, { displayName: "Player Perm Test" });

    // ---------------------------------------------------------------
    // Whiteboard
    // ---------------------------------------------------------------
    // registerPlayer already lands on the Whiteboard (its own board is the
    // sign-in destination), so no extra nav click is needed for this page.
    await expect(playerPage.getByText("(player)")).toBeVisible();
    const coachTile = playerPage.getByTestId("saved-pattern").filter({ hasText: "Coach seeded pattern" });
    await expect(coachTile).toHaveCount(1); // viewable (README: view + play)
    await expect(coachTile.getByTestId("saved-pattern-author")).toHaveText("COACH");
    await assertNoCoachOnlyChrome(playerPage);

    // A player CAN record and save their own pattern (additive-only), and
    // even that pattern's own tile never grows a delete control.
    await playerPage.getByTestId("record").click();
    await dragTokenTo(playerPage, "home-6", { x: 44, y: 44 });
    await playerPage.getByTestId("stop-record").click();
    await playerPage.getByTestId("record-name").fill("Player own pattern");
    await playerPage.getByTestId("save-pattern").click();
    const ownTile = playerPage.getByTestId("saved-pattern").filter({ hasText: "Player own pattern" });
    await expect(ownTile).toHaveCount(1);
    await expect(ownTile.getByTestId("saved-pattern-author")).toHaveText("Player Perm Test");
    await assertNoCoachOnlyChrome(playerPage); // still none, even on the player's OWN tile

    // ---------------------------------------------------------------
    // Patterns (Brief section 3: "Full (view and play)" for both roles)
    // ---------------------------------------------------------------
    await goToPage(playerPage, "patterns");
    await assertNoCoachOnlyChrome(playerPage);
    const handle = playerPage.getByTestId("patterns-sheet-handle");
    if ((await handle.getAttribute("aria-expanded")) !== "true") {
      await robustClick(playerPage, "patterns-sheet-handle");
    }
    await expect(playerPage.getByTestId("patterns-sheet-body")).toBeVisible();
    // The player's own recorded pattern from the whiteboard step above is
    // reachable via the "My patterns" chip, proving view + play, not just
    // the coach-authored presets.
    await robustClick(playerPage, "patterns-chip-mine");
    await expect(
      playerPage.getByTestId("patterns-tile").filter({ hasText: "Player own pattern" })
    ).toHaveCount(1);

    // ---------------------------------------------------------------
    // Roster (Brief section 3: fit warnings coach-only, view-only for a
    // player, own row marked "(you)", no add/edit/delete control)
    // ---------------------------------------------------------------
    await goToPage(playerPage, "roster");
    await assertNoCoachOnlyChrome(playerPage);
    await expect(playerPage.getByTestId(/roster-row-\d+/)).toHaveCount(2);
    const rosterRow = playerPage.getByTestId(/roster-row-\d+/).filter({ hasText: "Wide Winger" });
    await rosterRow.scrollIntoViewIfNeeded();
    await rosterRow.dispatchEvent("click");
    // Whichever row this is, its detail panel must show the view-only tag
    // and never an edit/delete action (already swept by
    // assertNoCoachOnlyChrome above, re-asserted after selecting a row
    // since the detail panel only mounts once a row is selected).
    await expect(playerPage.getByTestId("roster-detail")).toContainText("(view only)");
    await assertNoCoachOnlyChrome(playerPage);

    // ---------------------------------------------------------------
    // Formations (Brief section 3: "Full (view and play)" for both roles)
    // ---------------------------------------------------------------
    await goToPage(playerPage, "formations");
    await assertNoCoachOnlyChrome(playerPage);
    await expect(playerPage.getByTestId("formations-meta-bar")).toContainText("4-3-3");
    // A keystone tap shows its keycard for a player exactly as it does for
    // a coach: full view + play, nothing gated on this page.
    await playerPage.locator('[data-token-id="six"]').click();
    await expect(playerPage.getByTestId("formations-keycard")).toBeVisible();

    // ---------------------------------------------------------------
    // Identity (Brief section 3: "Full (view and play)" for both roles)
    // ---------------------------------------------------------------
    await goToPage(playerPage, "identity");
    await assertNoCoachOnlyChrome(playerPage);
    const idHandle = playerPage.getByTestId("identity-sheet-handle");
    if ((await idHandle.getAttribute("aria-expanded")) !== "true") {
      await robustClick(playerPage, "identity-sheet-handle");
    }
    await expect(playerPage.getByTestId("identity-sheet-body")).toBeVisible();
    await robustClick(playerPage, "identity-sheet-handle");

    await assertCleanPage(playerPage, issues);

    await coachContext.close();
    await playerContext.close();
  });
});
