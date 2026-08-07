// Sessions journey (T-042, Brief step 23, PNG 21-23, 26, 28). Runs under
// both Playwright projects (desktop landscape, iPhone 13 portrait) and
// covers the "Roles and sessions" DoD line from Brief section 5:
//
//   "Session receipts: Mark as watched increments the coach's x/y counter
//    and flips that player's row to Viewed; players never see receipt data
//    in any payload."
//
// plus the design README's Sessions spec: draft with reorder/remove items,
// "+ Add from library" picker with mini-board thumbnails over both presets
// and My patterns, coach note, send, gold SENT pill with the viewed
// counter, and the player's read-only view with Watch deep-links.

import {
  test,
  expect,
  assertCleanPage,
  registerCoach,
  registerPlayer,
  watchPage,
} from "./fixtures";
import type { Page } from "@playwright/test";

async function recordAPattern(page: Page, name: string) {
  await page.getByTestId("record").click();
  const token = page.locator('[data-token-id="home-4"]');
  const box = (await token.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 - 40, { steps: 10 });
  await page.mouse.up();
  await page.getByTestId("stop-record").click();
  await page.getByTestId("record-name").fill(name);
  await page.getByTestId("save-pattern").click();
  await expect(page.getByTestId("saved-pattern").filter({ hasText: name })).toHaveCount(1);
}

test.describe("sessions: coach builds and sends, player watches and marks watched", () => {
  test("the full classroom loop", async ({ browser, page, issues }) => {
    // The coach records something of their own first, so the picker has
    // both sources to offer (presets and My patterns).
    const { joinCode } = await registerCoach(page, { teamName: "Sessions FC" });
    await recordAPattern(page, "Our build-out vs press");

    // A player must be on the team before the send: receipts are written
    // for every recipient AT send time (doc 03 section 6).
    const playerContext = await browser.newContext({
      viewport: page.viewportSize() ?? undefined,
    });
    const playerPage = await playerContext.newPage();
    watchPage(playerPage, issues);
    await registerPlayer(playerPage, joinCode, { displayName: "Jordan T." });

    // --- Coach: the draft builder ---------------------------------------
    await page.getByTestId("nav-sessions").click();
    await expect(page.getByTestId("nav-sessions")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("sessions-empty")).toBeVisible();

    await page.getByTestId("sessions-new-title").fill("Tuesday, wide overloads");
    await page.getByTestId("sessions-create").click();
    await expect(page.getByTestId("session-detail-title")).toHaveText("Tuesday, wide overloads");
    await expect(page.getByTestId("session-draft-pill")).toBeVisible();
    await expect(page.getByTestId("session-items-empty")).toBeVisible();
    // An empty session cannot be sent.
    await expect(page.getByTestId("session-send")).toBeDisabled();

    await page.getByTestId("session-note-input").fill("Watch both before training on Tuesday.");
    await page.getByTestId("session-note-save").click();

    // Picker: library presets, each with a mini-board thumbnail.
    await page.getByTestId("session-add-item").click();
    await expect(page.getByTestId("session-picker")).toBeVisible();
    await page.getByTestId("session-picker-search").fill("third-man");
    await expect(page.getByTestId("session-picker-row")).toHaveCount(1);
    await expect(page.getByTestId("session-picker-row").locator("svg.tile-thumb")).toBeVisible();
    await page.getByTestId("session-picker-row").click();
    await expect(page.getByTestId("session-item")).toHaveCount(1);

    // Picker: My patterns, the coach's own recording.
    await page.getByTestId("session-picker-tab-saved").click();
    await page.getByTestId("session-picker-search").fill("build-out");
    await expect(page.getByTestId("session-picker-row")).toHaveCount(1);
    await page.getByTestId("session-picker-row").click();
    await expect(page.getByTestId("session-item")).toHaveCount(2);
    await page.getByTestId("session-add-item").click(); // close the picker

    const itemNames = page.getByTestId("session-item").locator(".sessions-item-name");
    await expect(itemNames.nth(0)).toContainText("Third-Man Run");
    await expect(itemNames.nth(1)).toHaveText("Our build-out vs press");

    // Reorder, then put it back (design README: "reorder/remove items").
    await page.getByTestId("session-item-up").nth(1).click();
    await expect(itemNames.nth(0)).toHaveText("Our build-out vs press");
    await page.getByTestId("session-item-down").nth(0).click();
    await expect(itemNames.nth(0)).toContainText("Third-Man Run");

    // Remove works, and re-adding restores the pair.
    await page.getByTestId("session-item-remove").nth(1).click();
    await expect(page.getByTestId("session-item")).toHaveCount(1);
    await page.getByTestId("session-add-item").click();
    await page.getByTestId("session-picker-tab-saved").click();
    await page.getByTestId("session-picker-row").filter({ hasText: "build-out" }).click();
    await expect(page.getByTestId("session-item")).toHaveCount(2);

    // The recipient shows as "Will receive" before the send.
    await expect(page.getByTestId("session-receipt")).toHaveCount(1);
    await expect(page.getByTestId("session-receipt-state")).toHaveText("Will receive");

    // --- Send -------------------------------------------------------------
    await page.getByTestId("session-send").click();
    await expect(page.getByTestId("session-sent-pill")).toBeVisible();
    await expect(page.getByTestId("session-viewed-counter")).toHaveText("0 of 1 viewed");
    await expect(page.getByTestId("session-receipt-state")).toHaveText("Not yet");
    // A sent session is a record, not a draft: no builder controls remain.
    await expect(page.getByTestId("session-add-item")).toHaveCount(0);
    await expect(page.getByTestId("session-item-remove")).toHaveCount(0);
    await expect(page.getByTestId("session-note")).toContainText("Watch both before training");

    // --- Player: read-only, Watch deep-link, Mark as watched ---------------
    await playerPage.getByTestId("nav-sessions").click();
    await expect(playerPage.getByTestId("session-list-item")).toHaveCount(1);
    await expect(playerPage.getByTestId("session-list-item")).toContainText("New");
    await expect(playerPage.getByTestId("session-detail-title")).toHaveText(
      "Tuesday, wide overloads"
    );
    await expect(playerPage.getByTestId("session-note")).toContainText("Watch both before training");

    // Receipts never render for a player (they are absent from the payload).
    await expect(playerPage.getByTestId("session-receipt")).toHaveCount(0);
    await expect(playerPage.getByTestId("session-viewed-counter")).toHaveCount(0);
    await expect(playerPage.getByTestId("session-send")).toHaveCount(0);
    await expect(playerPage.getByTestId("session-add-item")).toHaveCount(0);

    // Watch opens the item on the board, playing.
    await expect(playerPage.getByTestId("session-watch")).toHaveCount(2);
    await playerPage.getByTestId("session-watch").first().click();
    await expect(playerPage.getByTestId("session-watch-view")).toBeVisible();
    await expect(playerPage.getByTestId("session-watch-title")).toContainText("Third-Man Run");
    await expect(playerPage.getByTestId("pattern-board")).toBeVisible();
    // Boards render portrait on a phone viewport and landscape otherwise,
    // on this surface exactly like every other (design README).
    const expectedOrientation =
      (playerPage.viewportSize()?.width ?? 1440) <= 700 ? "portrait" : "landscape";
    await expect(playerPage.locator(".board-wrap")).toHaveAttribute(
      "data-orientation",
      expectedOrientation
    );
    await playerPage.getByTestId("session-watch-back").click();
    await expect(playerPage.getByTestId("session-watch-view")).toHaveCount(0);

    await playerPage.getByTestId("session-mark-watched").click();
    await expect(playerPage.getByTestId("session-watched-state")).toBeVisible();
    await expect(playerPage.getByTestId("session-list-item")).toContainText("Watched");

    // --- Back on the coach account: the counter has moved -----------------
    await page.reload();
    await page.getByTestId("nav-sessions").click();
    await expect(page.getByTestId("session-viewed-counter")).toHaveText("1 of 1 viewed");
    await expect(page.getByTestId("session-receipt-state")).toHaveText("Viewed");

    await assertCleanPage(playerPage, issues);
    await assertCleanPage(page, issues);
    await playerContext.close();
  });
});

test.describe("sessions: a player never sees a draft", () => {
  test("drafts are invisible until they are sent", async ({ browser, page, issues }) => {
    const { joinCode } = await registerCoach(page, { teamName: "Drafts FC" });
    const playerContext = await browser.newContext({
      viewport: page.viewportSize() ?? undefined,
    });
    const playerPage = await playerContext.newPage();
    watchPage(playerPage, issues);
    await registerPlayer(playerPage, joinCode);

    await page.getByTestId("nav-sessions").click();
    await page.getByTestId("sessions-new-title").fill("Matchday prep");
    await page.getByTestId("sessions-create").click();
    await expect(page.getByTestId("session-draft-pill")).toBeVisible();

    await playerPage.getByTestId("nav-sessions").click();
    await expect(playerPage.getByTestId("sessions-empty")).toBeVisible();
    await expect(playerPage.getByTestId("session-list-item")).toHaveCount(0);
    // The player has no way to make one either.
    await expect(playerPage.getByTestId("sessions-create")).toHaveCount(0);
    await expect(playerPage.getByTestId("sessions-new-title")).toHaveCount(0);

    await assertCleanPage(playerPage, issues);
    await playerContext.close();
  });
});
