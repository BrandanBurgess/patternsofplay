// Phone pass (T-050, Brief step 24, PNG 14-20, 23, 28, 34-36, 43-45).
//
// The rest of the suite already runs every journey under BOTH Playwright
// projects, and assertCleanPage fails any page that overflows horizontally,
// so this file is not another copy of those journeys. It pins the things
// that are specifically PHONE contracts and that no other spec asserts:
//
//   - the sidebar collapses to the 52px icon rail (labels gone, icons kept)
//   - every one of the six pages renders portrait boards with no overflow
//   - the swipe-up sheets and the board's view menu open AND close by tap
//   - the player's session Watch view plays portrait on a phone
//
// It runs only under the mobile project; on desktop each test skips, since
// every assertion here is about the phone breakpoint.

import { test, expect, assertCleanPage, registerCoach, registerPlayer, watchPage } from "./fixtures";
import type { Page } from "@playwright/test";

const PAGES = ["whiteboard", "patterns", "sessions", "formations", "roster", "identity"] as const;

test.beforeEach(({ viewport }) => {
  test.skip((viewport?.width ?? 1440) > 700, "phone-breakpoint contracts only");
});

async function hasOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
}

test.describe("phone: icon rail, portrait boards, no overflow", () => {
  test("every page fits the iPhone 13 frame", async ({ page, issues }) => {
    await registerCoach(page, { teamName: "Phone FC" });

    // The rail: icons only, no labels, and narrow (design README: "sidebar
    // collapses to a 52px vertical icon rail").
    const rail = page.locator(".app-sidebar");
    const railBox = (await rail.boundingBox())!;
    expect(railBox.width).toBeLessThanOrEqual(56);
    await expect(page.locator(".app-nav-label").first()).toBeHidden();
    for (const key of PAGES) {
      await expect(page.getByTestId(`nav-${key}`)).toBeVisible();
    }

    for (const key of PAGES) {
      await page.getByTestId(`nav-${key}`).click();
      await expect(page.getByTestId(`nav-${key}`)).toHaveAttribute("aria-current", "page");
      expect(await hasOverflow(page), `${key} overflows horizontally`).toBe(false);

      // Every page that renders a board renders it PORTRAIT here. Roster is
      // the one page in the nav with no board at all.
      const board = page.locator(".board-wrap");
      if ((await board.count()) > 0) {
        await expect(board.first()).toHaveAttribute("data-orientation", "portrait");
        const box = (await board.first().boundingBox())!;
        // 7:10 portrait pitch (700x1000 viewBox), taller than it is wide.
        expect(box.height).toBeGreaterThan(box.width);
        expect(box.width).toBeLessThanOrEqual(390);
      }
    }

    await assertCleanPage(page, issues);
  });
});

test.describe("phone: sheets and menus are reachable and dismissible by touch", () => {
  test("each swipe-up sheet and the board view menu opens and closes on tap", async ({
    page,
    issues,
  }) => {
    await registerCoach(page, { teamName: "Sheets FC" });

    const sheets: [(typeof PAGES)[number], string, string][] = [
      ["patterns", "patterns-sheet-handle", "patterns-sheet-body"],
      ["formations", "formations-sheet-handle", "formations-sheet-body"],
      ["identity", "identity-sheet-handle", "identity-sheet-body"],
    ];

    for (const [navKey, handle, body] of sheets) {
      await page.getByTestId(`nav-${navKey}`).click();
      const handleEl = page.getByTestId(handle);
      await expect(handleEl).toBeVisible();
      // tap(), not click(): this is the touch path a phone actually takes.
      await handleEl.tap();
      await expect(page.getByTestId(body)).toBeVisible();
      expect(await hasOverflow(page), `${navKey} sheet overflows`).toBe(false);
      await handleEl.tap();
      await expect(page.getByTestId(body)).toHaveCount(0);
    }

    // The board's view menu is pinned to the viewport top on phone (it
    // would otherwise blanket a narrow portrait pitch); it must still open
    // and close by tap and never push the page sideways.
    await page.getByTestId("nav-whiteboard").click();
    await page.getByTestId("view-menu").tap();
    await expect(page.getByTestId("zone-toggle-thirds")).toBeVisible();
    expect(await hasOverflow(page)).toBe(false);
    await page.getByTestId("zone-toggle-thirds").tap();
    await expect(page.getByTestId("zone-toggle-thirds")).toBeChecked();
    await page.getByTestId("view-menu").tap();
    await expect(page.getByTestId("zone-toggle-thirds")).toHaveCount(0);

    // The head coach's Manage team panel is the other overlay on this
    // screen, and it is anchored near the right edge.
    await page.getByTestId("team-members-toggle").tap();
    await expect(page.getByTestId("team-members-panel")).toBeVisible();
    expect(await hasOverflow(page)).toBe(false);
    await page.getByTestId("team-members-toggle").tap();
    await expect(page.getByTestId("team-members-panel")).toHaveCount(0);

    await assertCleanPage(page, issues);
  });
});

test.describe("phone: a player watches a session item portrait", () => {
  test("the Watch deep-link plays on a portrait board", async ({ browser, page, issues }) => {
    const { joinCode } = await registerCoach(page, { teamName: "Watch FC" });
    const playerContext = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
    const playerPage = await playerContext.newPage();
    watchPage(playerPage, issues);
    await registerPlayer(playerPage, joinCode);

    await page.getByTestId("nav-sessions").click();
    await page.getByTestId("sessions-new-title").fill("Phone session");
    await page.getByTestId("sessions-create").click();
    await page.getByTestId("session-add-item").tap();
    await page.getByTestId("session-picker-search").fill("third-man");
    await page.getByTestId("session-picker-row").tap();
    await page.getByTestId("session-send").tap();
    await expect(page.getByTestId("session-sent-pill")).toBeVisible();

    await playerPage.getByTestId("nav-sessions").click();
    await playerPage.getByTestId("session-watch").first().tap();
    await expect(playerPage.getByTestId("pattern-board")).toBeVisible();
    await expect(playerPage.locator(".board-wrap")).toHaveAttribute("data-orientation", "portrait");
    expect(await hasOverflow(playerPage)).toBe(false);
    await playerPage.getByTestId("session-watch-back").tap();
    await playerPage.getByTestId("session-mark-watched").tap();
    await expect(playerPage.getByTestId("session-watched-state")).toBeVisible();

    await assertCleanPage(playerPage, issues);
    await playerContext.close();
  });
});
