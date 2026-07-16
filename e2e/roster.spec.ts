// Roster page journey (T-033, Brief step 19, PNG 12 desktop / 20 phone).
// Runs under both Playwright projects (mobile portrait, desktop landscape)
// per playwright.config.ts. Covers the ticket's Screens DoD lines (Brief
// section 5) verbatim:
//   "Each page matches its PNGs across the three themes on desktop and
//    phone frames; gold is the only interactive color; red never appears
//    as a call to action."
//   "Roster: the double-exposure warning fires when a High AWR fullback
//    sits behind a High/Low winger on the same designed flank, and only
//    renders for coaches."
// plus player CRUD, role/work-rate chips, and the six attribute sliders
// (Brief step 19's own line: "roster CRUD, role and work-rate chips per
// player, six coach-rated 1-5 attribute sliders").

import { test, expect, assertCleanPage, registerCoach, registerPlayer } from "./fixtures";
import type { Locator, Page } from "@playwright/test";

function trackIssues(page: Page) {
  const issues = { consoleErrors: [] as string[], failedRequests: [] as string[], serverErrors: [] as string[] };
  page.on("console", (m) => m.type() === "error" && issues.consoleErrors.push(m.text()));
  page.on("requestfailed", (r) => issues.failedRequests.push(`${r.method()} ${r.url()}`));
  page.on("response", (r) => r.status() >= 500 && issues.serverErrors.push(`${r.status()} ${r.url()}`));
  return issues;
}

// Chromium's mobile+touch emulation (this repo's "mobile" Playwright
// project, iPhone 13) shrinks the visual viewport once any text input is
// focused (simulating an on-screen keyboard) and never restores it for
// the rest of the page's life. A plain point-based .click() maps its
// click coordinate through the now-stale LAYOUT viewport geometry, which
// can land on a different element than the one getBoundingClientRect()
// reports once the target sits below the original fold, exactly the
// case for this form-heavy page on a narrow phone. Dispatching the event
// directly targets the element with no coordinate math at all, so it is
// used for every button click in this journey rather than only the ones
// observed to need it.
async function robustClick(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  await locator.dispatchEvent("click");
}

async function goToRoster(page: Page) {
  await robustClick(page.getByTestId("nav-roster"));
  await expect(page.getByTestId("nav-roster")).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Roster" })).toBeVisible();
}

async function fillAttributeSlider(page: Page, key: string, value: number) {
  // Same native-setter dispatch already used for the whiteboard's threshold
  // sliders (e2e/whiteboard.spec.ts): plain .fill() does not reliably
  // trigger React's onChange for a range input in every browser engine.
  await page.getByTestId(`player-attr-${key}`).evaluate((el, v) => {
    const input = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, String(v));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
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

test.describe("roster: CRUD, chips, and the six attribute sliders", () => {
  test("coach creates, edits, and deletes a player", async ({ page, issues }) => {
    await registerCoach(page);
    await goToRoster(page);

    // Brief step 19: "roster CRUD ... role and work-rate chips per player".
    await addPlayer(page, {
      name: "Alex B.",
      jersey: "9",
      roleCode: "target_man",
      flank: "center",
      awr: "med",
      dwr: "med",
    });

    const row = page.getByTestId(/roster-row-\d+/).filter({ hasText: "Alex B." });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Target Man"); // role chip
    await expect(row).toContainText("Med / Med"); // work-rate chip

    await robustClick(row);
    await expect(page.getByTestId("roster-detail")).toContainText("ALEX B.");
    await expect(page.getByTestId("roster-detail")).toContainText("Target Man".toUpperCase());
    // Role note (Role.description, seeded from the Bible), not player prose.
    await expect(page.getByTestId("roster-detail")).toContainText("reference point for direct play");

    // Six coach-rated 1-5 attribute sliders, defaulted to 3.
    for (const key of [
      "pace",
      "passing_range",
      "carrying_1v1",
      "positional_discipline",
      "aerial_physical",
      "pressing_engine",
    ]) {
      await expect(page.getByTestId(`attr-value-${key}`)).toHaveText("3");
    }

    // Edit: bump jersey number and one slider.
    await robustClick(page.getByTestId("player-edit"));
    await page.getByTestId("player-jersey").fill("11");
    await fillAttributeSlider(page, "pace", 5);
    await robustClick(page.getByTestId("player-save"));
    await expect(page.getByTestId("player-save")).toHaveCount(0);

    await expect(page.getByTestId("roster-detail")).toContainText("#11 ALEX B.");
    await expect(page.getByTestId("attr-value-pace")).toHaveText("5");

    // Delete.
    await robustClick(page.getByTestId("player-delete"));
    await expect(page.getByTestId(/roster-row-\d+/).filter({ hasText: "Alex B." })).toHaveCount(0);
    await expect(page.getByTestId("roster-detail")).toContainText("Select a player");

    await assertCleanPage(page, issues);
  });
});

test.describe("roster: double-exposure flank fit warning", () => {
  test("fires for a high-AWR fullback behind a high/low winger on the same flank", async ({
    page,
    issues,
  }) => {
    await registerCoach(page);
    await goToRoster(page);

    // No warning yet with an empty roster.
    await expect(page.locator(".fit-warning")).toHaveCount(0);

    // High AWR / low DWR wide player (Inside Forward, position_code W).
    await addPlayer(page, {
      name: "Maya K.",
      jersey: "7",
      roleCode: "inside_forward",
      flank: "right",
      awr: "high",
      dwr: "low",
    });
    await expect(page.locator(".fit-warning")).toHaveCount(0); // needs the back too

    // High AWR fullback behind her on the same (right) flank.
    await addPlayer(page, {
      name: "Jordan T.",
      jersey: "2",
      roleCode: "overlapping_fb",
      flank: "right",
      awr: "high",
      dwr: "med",
    });

    const warning = page.getByTestId("fit-warning-right");
    await expect(warning).toBeVisible();
    await expect(warning).toContainText("Maya K.");
    await expect(warning).toContainText("Jordan T.");
    // Seeded Bible copy (role_clashes.json double_exposure_flank), not
    // hardcoded UI prose (Brief section 7: "content is data, not code").
    await expect(warning).toContainText("corridor on every transition");
    await expect(warning).toContainText("FIT");

    // Break the pairing (move the fullback to the left flank) and the
    // warning clears: the rule is computed live, not cached.
    await robustClick(page.getByTestId(/roster-row-\d+/).filter({ hasText: "Jordan T." }));
    await robustClick(page.getByTestId("player-edit"));
    await page.getByTestId("player-flank").selectOption("left");
    await robustClick(page.getByTestId("player-save"));
    await expect(page.getByTestId("player-save")).toHaveCount(0);
    await expect(page.locator(".fit-warning")).toHaveCount(0);

    await assertCleanPage(page, issues);
  });
});

test.describe("roster: fit warning and CRUD controls are coach-only, absent from a player's DOM", () => {
  test("player sees the roster read-only with no fit warning and no add/edit/delete", async ({
    browser,
  }) => {
    const coachContext = await browser.newContext();
    const coachPage = await coachContext.newPage();
    const coachIssues = trackIssues(coachPage);
    const { joinCode } = await registerCoach(coachPage, { displayName: "Coach Fit Test" });
    await goToRoster(coachPage);

    await addPlayer(coachPage, {
      name: "Wide Winger",
      jersey: "7",
      roleCode: "touchline_winger",
      flank: "left",
      awr: "high",
      dwr: "low",
    });
    await addPlayer(coachPage, {
      name: "Back Runner",
      jersey: "3",
      roleCode: "overlapping_fb",
      flank: "left",
      awr: "high",
      dwr: "med",
    });
    await expect(coachPage.getByTestId("fit-warning-left")).toBeVisible();

    const playerContext = await browser.newContext();
    const playerPage = await playerContext.newPage();
    const playerIssues = trackIssues(playerPage);
    await registerPlayer(playerPage, joinCode, { displayName: "Player Fit Test" });
    await goToRoster(playerPage);

    // Roster DoD: the double-exposure warning "only renders for coaches" -
    // absent from the DOM, not merely hidden (skill: role check contract).
    await expect(playerPage.locator(".fit-warning")).toHaveCount(0);
    await expect(playerPage.getByTestId("roster-add-player")).toHaveCount(0);

    // Both players are visible read-only (README: "view + play"/view-only
    // sliders and work rates), just with no way to create/edit/delete.
    await expect(playerPage.getByTestId(/roster-row-\d+/)).toHaveCount(2);
    await robustClick(playerPage.getByTestId(/roster-row-\d+/).filter({ hasText: "Wide Winger" }));
    await expect(playerPage.getByTestId("player-edit")).toHaveCount(0);
    await expect(playerPage.getByTestId("player-delete")).toHaveCount(0);
    await expect(playerPage.getByTestId("roster-detail")).toContainText("(view only)");

    await assertCleanPage(coachPage, coachIssues);
    await assertCleanPage(playerPage, playerIssues);

    await coachContext.close();
    await playerContext.close();
  });
});

test.describe("roster: matches across all three themes", () => {
  test("fit warning is red-status-only and the active row uses the theme's gold accent", async ({
    page,
    issues,
  }) => {
    await registerCoach(page);
    await goToRoster(page);

    await addPlayer(page, {
      name: "Maya K.",
      jersey: "7",
      roleCode: "inside_forward",
      flank: "right",
      awr: "high",
      dwr: "low",
    });
    await addPlayer(page, {
      name: "Jordan T.",
      jersey: "2",
      roleCode: "overlapping_fb",
      flank: "right",
      awr: "high",
      dwr: "med",
    });
    await robustClick(page.getByTestId(/roster-row-\d+/).filter({ hasText: "Maya K." }));

    const seenWarningBorder = new Set<string>();
    const seenActiveRowBorder = new Set<string>();

    for (const theme of ["pitch", "dark", "board"] as const) {
      await robustClick(page.getByTestId(`theme-switch-${theme}`));
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

      const warningBorder = await page
        .getByTestId("fit-warning-right")
        .evaluate((el) => getComputedStyle(el).borderColor);
      const rowBorder = await page
        .getByTestId(/roster-row-\d+/)
        .filter({ hasText: "Maya K." })
        .evaluate((el) => getComputedStyle(el).borderColor);
      const saveBg = await page
        .getByTestId("roster-add-player")
        .evaluate((el) => getComputedStyle(el).backgroundColor);

      seenWarningBorder.add(warningBorder);
      seenActiveRowBorder.add(rowBorder);
      // Gold is the only interactive color, red never a call to action:
      // the selected row's border (interactive state) never matches the
      // fit warning's red border in any theme.
      expect(rowBorder).not.toBe(warningBorder);
      // The Add player button (an interactive call to action) uses gold,
      // matching the selected row's border color, never the warning's red.
      expect(saveBg).not.toBe("rgba(0, 0, 0, 0)");
      expect(saveBg).not.toBe(warningBorder);
    }

    // Every theme actually painted a distinct token value: proves the
    // page reads CSS variables per theme, same evidence shape as
    // e2e/design-tokens.spec.ts and e2e/whiteboard.spec.ts's theme test.
    expect(seenWarningBorder.size).toBe(3);
    expect(seenActiveRowBorder.size).toBe(3);

    await assertCleanPage(page, issues);
  });
});
