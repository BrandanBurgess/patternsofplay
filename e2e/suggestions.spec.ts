// Playstyle suggestion flow (Brief step 22, PNG 24/25/27; T-041). Runs
// under both Playwright projects (mobile portrait, desktop landscape) per
// playwright.config.ts. Covers the Roles-and-sessions DoD line verbatim:
//   "Suggestion flow round-trips: player submits, sees pending; coach
//    approves; note appears merged on the profile; dismiss clears it."
// plus the role check contract (skill: verify-ui) that approve/dismiss are
// absent from a player's DOM, not merely hidden, and a three-theme pass.
//
// Player row linkage: backend/app/routers/roster.py claims a roster row
// for a player the first time they GET /api/roster (RosterPage's own
// page-load fetch), if their display_name uniquely matches an unclaimed
// row's name. Every test here registers the player with a displayName
// equal to the coach-created roster row's name so the claim fires and the
// player's own row is identifiable ("(you)").

import { test, expect, assertCleanPage, registerCoach, registerPlayer } from "./fixtures";
import type { Locator, Page } from "@playwright/test";

function trackIssues(page: Page) {
  const issues = { consoleErrors: [] as string[], failedRequests: [] as string[], serverErrors: [] as string[] };
  page.on("console", (m) => m.type() === "error" && issues.consoleErrors.push(m.text()));
  page.on("requestfailed", (r) => issues.failedRequests.push(`${r.method()} ${r.url()}`));
  page.on("response", (r) => r.status() >= 500 && issues.serverErrors.push(`${r.status()} ${r.url()}`));
  return issues;
}

// Same rationale as e2e/roster.spec.ts's robustClick: Chromium's mobile
// touch emulation shrinks the visual viewport once a text input focuses
// and never restores it, which can misdirect a plain coordinate click on
// this form-heavy page. Dispatching the event targets the element
// directly instead.
async function robustClick(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  await locator.dispatchEvent("click");
}

async function goToRoster(page: Page) {
  await robustClick(page.getByTestId("nav-roster"));
  await expect(page.getByTestId("nav-roster")).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Roster" })).toBeVisible();
}

async function addPlayer(
  page: Page,
  opts: {
    name: string;
    jersey: string;
    roleCode: string;
    flank: "left" | "right" | "center";
    awr: "low" | "med" | "high";
    dwr: "low" | "med" | "high";
  }
) {
  await robustClick(page.getByTestId("roster-add-player"));
  await page.getByTestId("player-name").fill(opts.name);
  await page.getByTestId("player-jersey").fill(opts.jersey);
  await page.getByTestId("player-role").selectOption(opts.roleCode);
  await page.getByTestId("player-flank").selectOption(opts.flank);
  await page.getByTestId("player-awr").selectOption(opts.awr);
  await page.getByTestId("player-dwr").selectOption(opts.dwr);
  await robustClick(page.getByTestId("player-save"));
  await expect(page.getByTestId("player-save")).toHaveCount(0);
}

const SUGGESTION_TEXT =
  "Could we try me as a touchline winger for a session, cutting inside onto my strong foot.";
const SECOND_SUGGESTION_TEXT = "Maybe drop me deeper next session to link up the midfield.";

test.describe("suggestions: full round trip (Brief step 22 DoD)", () => {
  test("player submits, sees pending; coach approves; note merges on the profile; dismiss clears it", async ({
    browser,
  }) => {
    const coachContext = await browser.newContext();
    const coachPage = await coachContext.newPage();
    const coachIssues = trackIssues(coachPage);
    const { joinCode } = await registerCoach(coachPage, { displayName: "Coach Suggest" });
    await goToRoster(coachPage);
    await addPlayer(coachPage, {
      name: "Maya K.",
      jersey: "7",
      roleCode: "inside_forward",
      flank: "right",
      awr: "high",
      dwr: "low",
    });

    const playerContext = await browser.newContext();
    const playerPage = await playerContext.newPage();
    const playerIssues = trackIssues(playerPage);
    await registerPlayer(playerPage, joinCode, { displayName: "Maya K." });
    await goToRoster(playerPage);

    const ownRow = playerPage.getByTestId(/roster-row-\d+/).filter({ hasText: "Maya K." });
    // Claim-by-name-match (backend/app/routers/roster.py) fired on this
    // page's GET /api/roster load: the row is marked "(you)" in the list.
    await expect(ownRow).toContainText("(you)");
    await robustClick(ownRow);

    // DoD: "player submits, sees pending".
    await expect(playerPage.getByTestId("suggestion-composer")).toBeVisible();
    await playerPage.getByTestId("suggestion-text").fill(SUGGESTION_TEXT);
    await robustClick(playerPage.getByTestId("suggestion-send"));
    await expect(playerPage.getByTestId("suggestion-pending-card")).toContainText(SUGGESTION_TEXT);
    await expect(playerPage.getByTestId("suggestion-composer")).toHaveCount(0);

    // Coach sees the gold badge on the row and the review card (README:
    // "coach sees a gold badge on the row and an Approve / Dismiss card").
    await coachPage.reload();
    await goToRoster(coachPage);
    const coachRow = coachPage.getByTestId(/roster-row-\d+/).filter({ hasText: "Maya K." });
    await expect(coachRow.locator(".suggestion-badge")).toHaveCount(1);
    await robustClick(coachRow);
    await expect(coachPage.getByTestId("suggestion-review-card")).toContainText(SUGGESTION_TEXT);
    await expect(coachPage.getByTestId("suggestion-review-card")).toContainText("Maya K.");

    // DoD: "coach approves; note appears merged on the profile".
    await robustClick(coachPage.getByTestId("suggestion-approve"));
    await expect(coachPage.getByTestId("suggestion-review-card")).toHaveCount(0);
    await expect(coachPage.locator(".suggestion-badge")).toHaveCount(0);
    await expect(coachPage.getByTestId("playstyle-note")).toContainText(SUGGESTION_TEXT);

    // The player's own view reflects the merge and the cleared pending
    // state, not just the coach's.
    await playerPage.reload();
    await goToRoster(playerPage);
    await robustClick(playerPage.getByTestId(/roster-row-\d+/).filter({ hasText: "Maya K." }));
    await expect(playerPage.getByTestId("playstyle-note")).toContainText(SUGGESTION_TEXT);
    await expect(playerPage.getByTestId("suggestion-pending-card")).toHaveCount(0);
    await expect(playerPage.getByTestId("suggestion-composer")).toBeVisible();

    // DoD: "dismiss clears it". A second suggestion (allowed now that the
    // first has been reviewed), reviewed the other way.
    await playerPage.getByTestId("suggestion-text").fill(SECOND_SUGGESTION_TEXT);
    await robustClick(playerPage.getByTestId("suggestion-send"));
    await expect(playerPage.getByTestId("suggestion-pending-card")).toContainText(
      SECOND_SUGGESTION_TEXT
    );

    await coachPage.reload();
    await goToRoster(coachPage);
    await robustClick(coachPage.getByTestId(/roster-row-\d+/).filter({ hasText: "Maya K." }));
    await expect(coachPage.getByTestId("suggestion-review-card")).toContainText(
      SECOND_SUGGESTION_TEXT
    );
    await robustClick(coachPage.getByTestId("suggestion-dismiss"));
    await expect(coachPage.getByTestId("suggestion-review-card")).toHaveCount(0);
    await expect(coachPage.locator(".suggestion-badge")).toHaveCount(0);
    // The earlier approved note is untouched by the dismiss (dismiss never
    // merges into the profile).
    await expect(coachPage.getByTestId("playstyle-note")).toContainText(SUGGESTION_TEXT);

    await playerPage.reload();
    await goToRoster(playerPage);
    await robustClick(playerPage.getByTestId(/roster-row-\d+/).filter({ hasText: "Maya K." }));
    await expect(playerPage.getByTestId("suggestion-pending-card")).toHaveCount(0);
    await expect(playerPage.getByTestId("suggestion-composer")).toBeVisible();
    await expect(playerPage.getByTestId("playstyle-note")).toContainText(SUGGESTION_TEXT);
    await expect(playerPage.getByTestId("playstyle-note")).not.toContainText(SECOND_SUGGESTION_TEXT);

    await assertCleanPage(coachPage, coachIssues);
    await assertCleanPage(playerPage, playerIssues);

    await coachContext.close();
    await playerContext.close();
  });
});

test.describe("suggestions: approve/dismiss are coach-only, absent from a player's DOM", () => {
  test("player never sees approve or dismiss, even reviewing their own pending suggestion", async ({
    browser,
  }) => {
    const coachContext = await browser.newContext();
    const coachPage = await coachContext.newPage();
    const coachIssues = trackIssues(coachPage);
    const { joinCode } = await registerCoach(coachPage, { displayName: "Coach Absent" });
    await goToRoster(coachPage);
    await addPlayer(coachPage, {
      name: "Alex B.",
      jersey: "9",
      roleCode: "target_man",
      flank: "center",
      awr: "med",
      dwr: "med",
    });

    const playerContext = await browser.newContext();
    const playerPage = await playerContext.newPage();
    const playerIssues = trackIssues(playerPage);
    await registerPlayer(playerPage, joinCode, { displayName: "Alex B." });
    await goToRoster(playerPage);
    await robustClick(playerPage.getByTestId(/roster-row-\d+/).filter({ hasText: "Alex B." }));
    await playerPage
      .getByTestId("suggestion-text")
      .fill("Try me on the shoulder of the last defender more often.");
    await robustClick(playerPage.getByTestId("suggestion-send"));
    await expect(playerPage.getByTestId("suggestion-pending-card")).toBeVisible();

    // Role check contract (skill: verify-ui): coach-only elements absent
    // from the DOM for a player, not merely hidden.
    await expect(playerPage.getByTestId("suggestion-approve")).toHaveCount(0);
    await expect(playerPage.getByTestId("suggestion-dismiss")).toHaveCount(0);
    await expect(playerPage.getByTestId("suggestion-review-card")).toHaveCount(0);
    await expect(playerPage.locator(".suggestion-badge")).toHaveCount(0);

    await assertCleanPage(coachPage, coachIssues);
    await assertCleanPage(playerPage, playerIssues);

    await coachContext.close();
    await playerContext.close();
  });
});

test.describe("suggestions: matches across all three themes", () => {
  test("the composer/pending/review cards use the theme's gold accent border", async ({
    browser,
  }) => {
    const coachContext = await browser.newContext();
    const coachPage = await coachContext.newPage();
    const coachIssues = trackIssues(coachPage);
    const { joinCode } = await registerCoach(coachPage, { displayName: "Coach Theme" });
    await goToRoster(coachPage);
    await addPlayer(coachPage, {
      name: "Maya K.",
      jersey: "7",
      roleCode: "inside_forward",
      flank: "right",
      awr: "high",
      dwr: "low",
    });

    const playerContext = await browser.newContext();
    const playerPage = await playerContext.newPage();
    const playerIssues = trackIssues(playerPage);
    await registerPlayer(playerPage, joinCode, { displayName: "Maya K." });
    await goToRoster(playerPage);
    await robustClick(playerPage.getByTestId(/roster-row-\d+/).filter({ hasText: "Maya K." }));
    await playerPage.getByTestId("suggestion-text").fill(SUGGESTION_TEXT);
    await robustClick(playerPage.getByTestId("suggestion-send"));
    await expect(playerPage.getByTestId("suggestion-pending-card")).toBeVisible();

    await coachPage.reload();
    await goToRoster(coachPage);
    await robustClick(coachPage.getByTestId(/roster-row-\d+/).filter({ hasText: "Maya K." }));
    await expect(coachPage.getByTestId("suggestion-review-card")).toBeVisible();

    const seenReviewBorder = new Set<string>();
    const seenPendingBorder = new Set<string>();

    for (const theme of ["pitch", "dark", "board"] as const) {
      await robustClick(coachPage.getByTestId(`theme-switch-${theme}`));
      await expect(coachPage.locator("html")).toHaveAttribute("data-theme", theme);
      seenReviewBorder.add(
        await coachPage
          .getByTestId("suggestion-review-card")
          .evaluate((el) => getComputedStyle(el).borderColor)
      );

      await robustClick(playerPage.getByTestId(`theme-switch-${theme}`));
      await expect(playerPage.locator("html")).toHaveAttribute("data-theme", theme);
      seenPendingBorder.add(
        await playerPage
          .getByTestId("suggestion-pending-card")
          .evaluate((el) => getComputedStyle(el).borderColor)
      );
    }

    // Every theme actually painted a distinct token value: proves the
    // cards read the accent CSS variable per theme rather than a
    // hardcoded color (same evidence shape as e2e/roster.spec.ts's own
    // three-theme test).
    expect(seenReviewBorder.size).toBe(3);
    expect(seenPendingBorder.size).toBe(3);

    await robustClick(coachPage.getByTestId("suggestion-approve"));
    await expect(coachPage.getByTestId("playstyle-note")).toBeVisible();

    await assertCleanPage(coachPage, coachIssues);
    await assertCleanPage(playerPage, playerIssues);

    await coachContext.close();
    await playerContext.close();
  });
});
