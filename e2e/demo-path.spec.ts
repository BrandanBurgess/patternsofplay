// The demo path (T-051, Brief section 6): the acceptance narrative, start
// to finish, as one journey. Quoting the Brief verbatim, because this file
// exists to be checkable against it line by line:
//
//   "coach signs up, creates a team, adds six players with roles and
//    sliders; opens Formations, loads 4-3-3, taps the pivot keystone;
//    toggles the Rondo Map and taps the first-line zone; opens Patterns,
//    searches 'third man', plays A5 on the board; opens the whiteboard,
//    drags a build-out, records it, saves as 'Our build-out vs press';
//    creates a session with A5 plus the recording and a note, sends it;
//    switches to a player account on a phone, opens the session, watches
//    A5 portrait, marks watched; back on the coach account the receipt
//    counter reads 1 of N."
//
// It runs under BOTH Playwright projects, so the coach half runs once at
// 1440x900 and once at 390x844. The player half always runs in its own
// 390x844 context ("switches to a player account on a phone"), which is
// also what makes "watches A5 portrait" a real assertion rather than an
// accident of which project happens to be running.

import {
  test,
  expect,
  assertCleanPage,
  registerCoach,
  registerPlayer,
  watchPage,
} from "./fixtures";
import type { Locator, Page } from "@playwright/test";

// Chromium's mobile emulation shrinks the visual viewport once a text
// input is focused and never restores it, so a coordinate-based click can
// land on the wrong element on a form-heavy page below the fold. Same
// mitigation e2e/roster.spec.ts already documents and uses.
async function tap(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  await locator.dispatchEvent("click");
}

async function setSlider(page: Page, key: string, value: number) {
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
    pace: number;
  }
) {
  await tap(page.getByTestId("roster-add-player"));
  await page.getByTestId("player-name").fill(opts.name);
  await page.getByTestId("player-jersey").fill(opts.jersey);
  await page.getByTestId("player-role").selectOption(opts.roleCode);
  await page.getByTestId("player-flank").selectOption(opts.flank);
  await page.getByTestId("player-awr").selectOption(opts.awr);
  await page.getByTestId("player-dwr").selectOption(opts.dwr);
  await setSlider(page, "pace", opts.pace);
  await tap(page.getByTestId("player-save"));
  await expect(page.getByTestId("player-save")).toHaveCount(0);
}

/** Drags a token by a pixel offset on whichever orientation is rendering.
 * The demo narrative's "drags a build-out" is about the gesture and what
 * it records, not about landing on an exact coordinate, so this stays
 * deliberately simple; e2e/cross-device.spec.ts is where exact model
 * coordinates are pinned. */
async function dragToken(page: Page, id: string, dx: number, dy: number) {
  const box = (await page.locator(`[data-token-id="${id}"]`).boundingBox())!;
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 12 });
  await page.mouse.up();
}

test.describe("demo path: the Brief section 6 acceptance narrative", () => {
  test("runs end to end, coach on this viewport and player on a phone", async ({
    browser,
    page,
    issues,
  }) => {
    // --- "coach signs up, creates a team" ---------------------------------
    const { joinCode } = await registerCoach(page, {
      displayName: "Coach Demo",
      teamName: "Demo Path FC",
    });
    await expect(page.getByTestId("board")).toBeVisible();

    // The player joins now, before the send: receipts are written for every
    // recipient at send time (doc 03 section 6), so the recipient has to be
    // on the team by then. On their own phone, per the narrative.
    const phoneContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const playerPage = await phoneContext.newPage();
    watchPage(playerPage, issues);
    await registerPlayer(playerPage, joinCode, { displayName: "Player Demo" });

    // --- "adds six players with roles and sliders" -------------------------
    await tap(page.getByTestId("nav-roster"));
    const squad: Parameters<typeof addPlayer>[1][] = [
      { name: "Ben W.", jersey: "1", roleCode: "sweeper_keeper", flank: "center", awr: "med", dwr: "high", pace: 2 },
      { name: "Marco S.", jersey: "2", roleCode: "overlapping_fb", flank: "right", awr: "high", dwr: "high", pace: 5 },
      { name: "Dev P.", jersey: "5", roleCode: "ball_playing_cb", flank: "center", awr: "med", dwr: "high", pace: 3 },
      { name: "Nils B.", jersey: "4", roleCode: "single_pivot", flank: "center", awr: "med", dwr: "high", pace: 2 },
      { name: "Jordan T.", jersey: "7", roleCode: "touchline_winger", flank: "right", awr: "high", dwr: "low", pace: 5 },
      { name: "Sam O.", jersey: "9", roleCode: "runner_in_behind", flank: "center", awr: "high", dwr: "low", pace: 5 },
    ];
    for (const player of squad) await addPlayer(page, player);
    await expect(page.getByTestId(/roster-row-\d+/)).toHaveCount(6);
    // Marco (right back, AWR high) behind Jordan (right wing, AWR high /
    // DWR low) is the designed double-exposure pair, and it is coach-only.
    await expect(page.getByTestId("fit-warning-right")).toBeVisible();

    // --- "opens Formations, loads 4-3-3, taps the pivot keystone" ----------
    await tap(page.getByTestId("nav-formations"));
    const formationsHandle = page.getByTestId("formations-sheet-handle");
    if ((await formationsHandle.getAttribute("aria-expanded")) !== "true") {
      await tap(formationsHandle);
    }
    await page.getByTestId("formations-search").fill("4-3-3");
    await tap(page.getByTestId("formations-tile").first());
    await expect(page.getByTestId("formations-meta-bar")).toContainText("4-3-3");
    // The pivot: slot "six", the single pivot keystone.
    await page.locator('[data-token-id="six"]').click();
    await expect(page.getByTestId("formations-keycard-title")).toHaveText("The 6 (single pivot)");
    await tap(page.getByTestId("formations-keycard-close"));

    // --- "toggles the Rondo Map and taps the first-line zone" -------------
    await tap(page.getByTestId("formations-rondo-toggle"));
    await expect(page.getByTestId("rondo-zone-layer")).toBeVisible();
    await page.locator('[data-zone-key="first_line"]').click();
    await expect(page.getByTestId("formations-zone-card")).toBeVisible();
    await expect(page.getByTestId("formations-zone-title")).toContainText("4v2");
    await tap(page.getByTestId("formations-rondo-active-toggle"));

    // --- "opens Patterns, searches 'third man', plays A5 on the board" ----
    await tap(page.getByTestId("nav-patterns"));
    const patternsHandle = page.getByTestId("patterns-sheet-handle");
    if ((await patternsHandle.getAttribute("aria-expanded")) !== "true") {
      await tap(patternsHandle);
    }
    // Typed the way a coach says it, unhyphenated (pages/search.ts).
    await page.getByTestId("patterns-search").fill("third man");
    await expect(page.getByTestId("patterns-tile")).toHaveCount(1);
    await tap(page.getByTestId("patterns-tile"));
    await expect(page.getByTestId("patterns-meta-title")).toContainText("A5");
    await expect(page.getByTestId("patterns-playing-pill")).toBeVisible();

    // --- "opens the whiteboard, drags a build-out, records it, saves it" --
    await tap(page.getByTestId("nav-whiteboard"));
    await expect(page.getByTestId("board")).toBeVisible();
    await tap(page.getByTestId("record"));
    await expect(page.getByTestId("record-banner")).toBeVisible();
    await dragToken(page, "home-5", 60, -20); // centre-back steps out
    await dragToken(page, "home-2", 50, 10); // right back pushes on
    await dragToken(page, "ball", 40, -30); // the ball follows the pass
    await tap(page.getByTestId("stop-record"));
    await page.getByTestId("record-name").fill("Our build-out vs press");
    await tap(page.getByTestId("save-pattern"));
    const saved = page.getByTestId("saved-pattern").filter({ hasText: "Our build-out vs press" });
    await expect(saved).toHaveCount(1);
    await expect(saved.getByTestId("saved-pattern-author")).toHaveText("COACH");

    // --- "creates a session with A5 plus the recording and a note, sends" -
    await tap(page.getByTestId("nav-sessions"));
    await page.getByTestId("sessions-new-title").fill("Tuesday, wide overloads");
    await tap(page.getByTestId("sessions-create"));
    await page.getByTestId("session-note-input").fill("Watch both before training on Tuesday.");
    await tap(page.getByTestId("session-note-save"));

    await tap(page.getByTestId("session-add-item"));
    await page.getByTestId("session-picker-search").fill("third man");
    await expect(page.getByTestId("session-picker-row")).toHaveCount(1);
    await tap(page.getByTestId("session-picker-row"));
    await tap(page.getByTestId("session-picker-tab-saved"));
    await page.getByTestId("session-picker-search").fill("build-out");
    await tap(page.getByTestId("session-picker-row"));
    await expect(page.getByTestId("session-item")).toHaveCount(2);

    await tap(page.getByTestId("session-send"));
    await expect(page.getByTestId("session-sent-pill")).toBeVisible();
    await expect(page.getByTestId("session-viewed-counter")).toHaveText("0 of 1 viewed");

    // --- "switches to a player account on a phone, opens the session,
    //      watches A5 portrait, marks watched" ------------------------------
    await playerPage.getByTestId("nav-sessions").click();
    await expect(playerPage.getByTestId("session-detail-title")).toHaveText(
      "Tuesday, wide overloads"
    );
    await expect(playerPage.getByTestId("session-note")).toContainText("Watch both before training");
    // Read-only: no receipt data reaches a player at all.
    await expect(playerPage.getByTestId("session-receipt")).toHaveCount(0);
    await expect(playerPage.getByTestId("session-viewed-counter")).toHaveCount(0);

    const watchA5 = playerPage
      .getByTestId("session-item")
      .filter({ hasText: "Third-Man Run" })
      .getByTestId("session-watch");
    await watchA5.click();
    await expect(playerPage.getByTestId("session-watch-title")).toContainText("Third-Man Run");
    await expect(playerPage.getByTestId("pattern-board")).toBeVisible();
    await expect(playerPage.locator(".board-wrap")).toHaveAttribute("data-orientation", "portrait");
    await playerPage.getByTestId("session-watch-back").click();
    await playerPage.getByTestId("session-mark-watched").click();
    await expect(playerPage.getByTestId("session-watched-state")).toBeVisible();

    // --- "back on the coach account the receipt counter reads 1 of N" -----
    await page.reload();
    await tap(page.getByTestId("nav-sessions"));
    await expect(page.getByTestId("session-viewed-counter")).toHaveText("1 of 1 viewed");
    await expect(page.getByTestId("session-receipt-state")).toHaveText("Viewed");

    await assertCleanPage(playerPage, issues);
    await assertCleanPage(page, issues);
    await phoneContext.close();
  });
});
