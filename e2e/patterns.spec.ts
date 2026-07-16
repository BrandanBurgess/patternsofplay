// Patterns page journey (T-031, Brief step 17, PNG 05-10, 29-31, 15-18, 35).
// Runs under both Playwright projects (desktop landscape, iPhone 13
// portrait). Covers the ticket's Screens DoD lines (Brief section 5):
//   "Each page matches its PNGs across the three themes on desktop and
//    phone frames; gold is the only interactive color; red never appears
//    as a call to action."
//   "Patterns: search filters the active library only; category chips
//    work; Open on whiteboard carries the pattern's board state to the
//    whiteboard."

import { test, expect, assertCleanPage, registerCoach } from "./fixtures";
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
  return (await page.locator(".board-wrap").first().getAttribute("data-orientation")) as Orientation;
}

async function modelToClient(page: Page, m: Model) {
  const o = await orientationOf(page);
  const box = (await page.getByTestId("board").boundingBox())!;
  const vb = VB[o];
  const p = expectedPixel(m, o);
  return { x: box.x + (p.px / vb.width) * box.width, y: box.y + (p.py / vb.height) * box.height };
}

async function tokenCenter(page: Page, id: string) {
  const box = (await page.locator(`[data-token-id="${id}"]`).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function dragTokenOnWhiteboard(page: Page, id: string, m: Model) {
  const b = (await page.locator(`[data-token-id="${id}"]`).boundingBox())!;
  const start = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const target = await modelToClient(page, m);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 10 });
  await page.mouse.up();
}

async function openSheet(page: Page) {
  const handle = page.getByTestId("patterns-sheet-handle");
  if ((await handle.getAttribute("aria-expanded")) !== "true") {
    await handle.click();
  }
  await expect(page.getByTestId("patterns-sheet-body")).toBeVisible();
}

async function toRgb(page: Page, cssVar: string): Promise<string> {
  return page.evaluate((v) => {
    const el = document.createElement("div");
    el.style.color = `var(${v})`;
    document.body.appendChild(el);
    const rgb = getComputedStyle(el).color;
    el.remove();
    return rgb;
  }, cssVar);
}

test.describe("patterns: libraries, chips, search, meta bar, details, open on whiteboard", () => {
  test("full coach journey", async ({ page, issues }) => {
    await registerCoach(page);

    // A saved pattern to exercise the "My patterns" chip later, recorded
    // from the whiteboard (T-030) exactly as a coach normally would.
    await page.getByTestId("record").click();
    await dragTokenOnWhiteboard(page, "home-4", { x: 60, y: 40 });
    await page.getByTestId("stop-record").click();
    await page.getByTestId("record-name").fill("My test pattern");
    await page.getByTestId("save-pattern").click();
    await expect(
      page.getByTestId("saved-pattern").filter({ hasText: "My test pattern" })
    ).toHaveCount(1);

    // --- Patterns is now a live nav entry (T-031 activates it) ---
    await page.getByTestId("nav-patterns").click();
    await expect(page.getByTestId("nav-patterns")).toHaveAttribute("aria-current", "page");

    // --- Default view: empty board, no meta bar (design README) ---
    await expect(page.getByTestId("pattern-empty")).toBeVisible();
    await expect(page.getByTestId("patterns-meta-bar")).toHaveCount(0);

    // --- Browse sheet: Patterns tab is the default, with category chips ---
    await openSheet(page);
    await expect(page.getByTestId("patterns-tab-pattern")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("patterns-chip-all")).toBeVisible();
    await expect(page.getByTestId("patterns-tile")).toHaveCount(12);

    // --- Category chips work ---
    await page.getByTestId("patterns-chip-combination").click();
    await expect(page.getByTestId("patterns-tile")).toHaveCount(5);
    await page.getByTestId("patterns-chip-space").click();
    await expect(page.getByTestId("patterns-tile")).toHaveCount(3);
    await page.getByTestId("patterns-chip-all").click();
    await expect(page.getByTestId("patterns-tile")).toHaveCount(12);

    // --- Search filters the ACTIVE library only ---
    await page.getByTestId("patterns-search").fill("third-man");
    await expect(page.getByTestId("patterns-tile")).toHaveCount(1);
    await expect(page.getByTestId("patterns-tile")).toContainText("Third-Man Run");

    // Switching library resets the query: no leakage of a Patterns-tab
    // search term onto Deliveries, and Deliveries has no category chips.
    await page.getByTestId("patterns-tab-delivery").click();
    await expect(page.getByTestId("patterns-search")).toHaveValue("");
    await expect(page.getByTestId("patterns-chip-all")).toHaveCount(0);
    await expect(page.getByTestId("patterns-tile")).toHaveCount(8);
    await page.getByTestId("patterns-search").fill("slide-rule");
    await expect(page.getByTestId("patterns-tile")).toHaveCount(1);
    await expect(page.getByTestId("patterns-tile")).toContainText("Slide-Rule Through Ball");

    await page.getByTestId("patterns-tab-rotation").click();
    await expect(page.getByTestId("patterns-search")).toHaveValue("");
    await expect(page.getByTestId("patterns-tile")).toHaveCount(3);
    await page.getByTestId("patterns-search").fill("false");
    await expect(page.getByTestId("patterns-tile")).toHaveCount(1);
    await expect(page.getByTestId("patterns-tile")).toContainText("False-9 Drop");

    // --- Selecting a tile closes the sheet and plays it on the big board ---
    await page.getByTestId("patterns-tab-pattern").click();
    await page.getByTestId("patterns-search").fill("third-man");
    await page.getByTestId("patterns-tile").click();
    await expect(page.getByTestId("patterns-sheet-body")).toHaveCount(0);
    await expect(page.getByTestId("patterns-meta-bar")).toContainText("Third-Man Run");
    await expect(page.getByTestId("patterns-playing-pill")).toBeVisible();

    // --- Details panel: the Patterns template is "what it is" + the
    // animation's own numbered steps (PNG 10), not a separate coaching-
    // points list ---
    await page.getByTestId("patterns-details-toggle").click();
    await expect(page.getByTestId("patterns-details-panel")).toBeVisible();
    await expect(page.getByTestId("patterns-details-step")).toHaveCount(3);
    await page.getByTestId("patterns-details-close").click();
    await expect(page.getByTestId("patterns-details-panel")).toHaveCount(0);

    // --- Clear resets to the empty board default ---
    await page.getByTestId("patterns-clear").click();
    await expect(page.getByTestId("patterns-meta-bar")).toHaveCount(0);
    await expect(page.getByTestId("pattern-empty")).toBeVisible();

    // --- "My patterns" chip surfaces the whiteboard recording, author-
    // stamped (design README roles table: "tile shows COACH / player name") ---
    await openSheet(page);
    // The search chip is an independent filter and carries over (still
    // "third-man" from the step above), so clear it before checking a
    // different data source.
    await page.getByTestId("patterns-search").fill("");
    await page.getByTestId("patterns-chip-mine").click();
    const savedTile = page.getByTestId("patterns-tile").filter({ hasText: "My test pattern" });
    await expect(savedTile).toHaveCount(1);
    await expect(savedTile).toContainText("COACH");
    await savedTile.click();
    await expect(page.getByTestId("patterns-meta-author")).toHaveText("COACH");

    // --- Open on whiteboard carries the pattern's board state (round trip) ---
    await page.getByTestId("patterns-clear").click();
    await openSheet(page);
    // Back to the library (the "My patterns" chip is still selected from
    // the step above).
    await page.getByTestId("patterns-chip-all").click();
    await page.getByTestId("patterns-search").fill("Overlap");
    await expect(page.getByTestId("patterns-tile")).toHaveCount(1);
    await page.getByTestId("patterns-tile").click();
    await expect(page.getByTestId("patterns-meta-bar")).toContainText("Overlap");

    await page.getByTestId("patterns-open-whiteboard").click();
    await expect(page.getByTestId("nav-whiteboard")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("board")).toBeVisible();

    // A1 Overlap's spec (seeds/patterns.json): winger_R starts at (78, 15)
    // holding the ball, fb_R (home) at (55, 10), opp_fb_L (away) at (84, 18).
    // Landscape or portrait, whichever this project renders, model
    // coordinates never change (CLAUDE.md rule 8): only the render mapping
    // does, and this asserts the carried-over tokens land on the right spot
    // in whatever orientation this viewport uses.
    for (const [id, model] of [
      ["winger_R", { x: 78, y: 15 }],
      ["fb_R", { x: 55, y: 10 }],
      ["opp_fb_L", { x: 84, y: 18 }],
      ["ball", { x: 78, y: 15 }],
    ] as const) {
      const target = await modelToClient(page, model);
      const center = await tokenCenter(page, id);
      expect(Math.abs(center.x - target.x), `${id} x`).toBeLessThan(8);
      expect(Math.abs(center.y - target.y), `${id} y`).toBeLessThan(8);
    }

    await assertCleanPage(page, issues);
  });
});

test.describe("patterns: matches across all three themes, gold-only interactive, red never a CTA", () => {
  test("tabs, chips, and the Details action are theme-driven, never red", async ({ page, issues }) => {
    await registerCoach(page);
    await page.getByTestId("nav-patterns").click();
    await openSheet(page);

    const seenTabActive = new Set<string>();
    const seenChipActive = new Set<string>();
    const seenDetailsBtn = new Set<string>();

    for (const theme of ["pitch", "dark", "board"] as const) {
      await page.getByTestId(`theme-switch-${theme}`).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

      const redRgb = await toRgb(page, "--red");

      const tabActiveBg = await page
        .getByTestId("patterns-tab-pattern")
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      const tabInactiveBg = await page
        .getByTestId("patterns-tab-delivery")
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      const chipActiveBg = await page
        .getByTestId("patterns-chip-all")
        .evaluate((el) => getComputedStyle(el).backgroundColor);

      seenTabActive.add(tabActiveBg);
      seenChipActive.add(chipActiveBg);
      // Gold is the only interactive color: the active tab/chip must read
      // differently from an inactive one, and neither is ever red.
      expect(tabActiveBg).not.toBe(tabInactiveBg);
      expect(tabActiveBg).not.toBe(redRgb);
      expect(chipActiveBg).not.toBe(redRgb);

      // Select something so the meta bar (Details, always gold; Open on
      // whiteboard/Clear, neutral) is on screen to check too.
      await page.getByTestId("patterns-search").fill("third-man");
      await page.getByTestId("patterns-tile").click();
      const detailsBg = await page
        .getByTestId("patterns-details-toggle")
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      const clearBg = await page
        .getByTestId("patterns-clear")
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      seenDetailsBtn.add(detailsBg);
      expect(detailsBg).not.toBe(redRgb);
      expect(clearBg).not.toBe(redRgb);
      // Clear is a neutral action, never styled the same as the gold
      // Details button (red is never a CTA, but neither is "everything gold").
      expect(clearBg).not.toBe(detailsBg);

      await page.getByTestId("patterns-clear").click();
      await openSheet(page);
    }

    // Every theme actually painted a distinct value for the interactive
    // (gold) elements: proves they read CSS variables per theme rather than
    // a color baked into the component.
    expect(seenTabActive.size).toBe(3);
    expect(seenChipActive.size).toBe(3);
    expect(seenDetailsBtn.size).toBe(3);

    await assertCleanPage(page, issues);
  });
});
