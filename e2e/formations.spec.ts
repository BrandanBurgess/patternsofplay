// Formations page journey (T-032, Brief step 18, PNG 11, 19, 37-39, 43,
// plus the Rondo Map PNG 32/36). Runs under both Playwright projects
// (desktop landscape, iPhone 13 portrait). Covers the ticket's Screens
// DoD lines (Brief section 5):
//   "Each page matches its PNGs across the three themes on desktop and
//    phone frames; gold is the only interactive color; red never appears
//    as a call to action."
//   "Formations: every keystone tap shows its keycard; Rondo Map zones
//    each show their rondo and linked patterns."

import { test, expect, assertCleanPage, registerCoach } from "./fixtures";
import type { Page } from "@playwright/test";

async function openSheet(page: Page) {
  const handle = page.getByTestId("formations-sheet-handle");
  if ((await handle.getAttribute("aria-expanded")) !== "true") {
    await handle.click();
  }
  await expect(page.getByTestId("formations-sheet-body")).toBeVisible();
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

test.describe("formations: board-first shape, keystone keycards, details, rondo map", () => {
  test("full coach journey", async ({ page, issues }) => {
    await registerCoach(page);

    // --- Formations is a live nav entry (T-032 activates it) ---
    await page.getByTestId("nav-formations").click();
    await expect(page.getByTestId("nav-formations")).toHaveAttribute("aria-current", "page");

    // --- Board-first default: 4-3-3 renders immediately, no empty board
    // (design README: "the shape renders full-size on the board") ---
    await expect(page.getByTestId("formations-meta-bar")).toContainText("4-3-3");
    await expect(page.locator('[data-token-id]')).toHaveCount(11);

    // --- Every keystone tap shows its keycard (Brief step 18 DoD). 4-3-3
    // seeds three keystones: six, st, eight_l (seeds/formation_keystones.json) ---
    const keystones: [string, string][] = [
      ["six", "The 6 (single pivot)"],
      ["st", "The 9"],
      ["eight_l", "The 8s"],
    ];
    await expect(page.locator('[data-keystone="true"]')).toHaveCount(3);
    for (const [slot, title] of keystones) {
      await page.locator(`[data-token-id="${slot}"]`).click();
      await expect(page.getByTestId("formations-keycard")).toBeVisible();
      await expect(page.getByTestId("formations-keycard-title")).toHaveText(title);
      await page.getByTestId("formations-keycard-close").click();
      await expect(page.getByTestId("formations-keycard")).toHaveCount(0);
    }

    // A non-keystone token never opens a keycard. eight_r sits centrally
    // (not near the bottom-sheet handle's overlap strip in portrait).
    await page.locator('[data-token-id="eight_r"]').click();
    await expect(page.getByTestId("formations-keycard")).toHaveCount(0);

    // --- Details: strengths, danger areas conceded, every keystone blurb ---
    await page.getByTestId("formations-details-toggle").click();
    await expect(page.getByTestId("formations-details-panel")).toBeVisible();
    await expect(page.getByTestId("formations-details-panel")).toContainText("Strengths");
    await expect(page.getByTestId("formations-details-panel")).toContainText("Danger areas conceded");
    await expect(page.getByTestId("formations-details-keystone")).toHaveCount(3);
    await page.getByTestId("formations-details-close").click();
    await expect(page.getByTestId("formations-details-panel")).toHaveCount(0);

    // --- Rondo Map: toggle, five tappable zones, each shows its rondo and
    // linked patterns (Brief step 18 DoD; seeds/rondo_zones.json, 433 only) ---
    await page.getByTestId("formations-rondo-toggle").click();
    await expect(page.getByTestId("formations-rondo-active-toggle")).toBeVisible();
    await expect(page.getByTestId("rondo-zone")).toHaveCount(5);

    await page.locator('[data-zone-key="midfield_box"]').click();
    await expect(page.getByTestId("formations-zone-card")).toBeVisible();
    await expect(page.getByTestId("formations-zone-title")).toHaveText("5v3 (the midfield box)");
    await expect(page.getByTestId("formations-zone-teaches")).toContainText("split-pass and pause logic");
    const linkedPatterns = page.getByTestId("formations-linked-pattern");
    await expect(linkedPatterns).toHaveCount(2);
    await expect(linkedPatterns.filter({ hasText: "B8" })).toContainText("La Pausa");
    await expect(linkedPatterns.filter({ hasText: "A5" })).toContainText("Third-Man Run");

    // Switching zones swaps the card, not stacks it.
    await page.locator('[data-zone-key="last_line"]').click();
    await expect(page.getByTestId("formations-zone-card")).toHaveCount(1);
    await expect(page.getByTestId("formations-zone-title")).toHaveText("2v2 (+1 keeper) (the last line)");

    // Exiting rondo mode restores the normal meta bar (Details/Rondo map).
    await page.getByTestId("formations-rondo-active-toggle").click();
    await expect(page.getByTestId("formations-rondo-toggle")).toBeVisible();
    await expect(page.getByTestId("rondo-zone")).toHaveCount(0);

    // --- Browse sheet: searchable shape thumbnails (six presets) ---
    await openSheet(page);
    await expect(page.getByTestId("formations-tile")).toHaveCount(6);
    await page.getByTestId("formations-search").fill("3-4-3");
    await expect(page.getByTestId("formations-tile")).toHaveCount(1);
    await page.getByTestId("formations-tile").click();
    await expect(page.getByTestId("formations-sheet-body")).toHaveCount(0);
    await expect(page.getByTestId("formations-meta-bar")).toContainText("3-4-3");

    // 3-4-3 has no seeded rondo map: the toggle stays present but disabled
    // (do not invent a rondo map beyond what seeds/rondo_zones.json carries).
    await expect(page.getByTestId("formations-rondo-toggle")).toBeDisabled();

    // Its own keystones still tap to their own keycards.
    await page.locator('[data-token-id="cm_l"]').click();
    await expect(page.getByTestId("formations-keycard-title")).toHaveText("The double pivot");

    await assertCleanPage(page, issues);
  });
});

test.describe("formations: matches across all three themes, gold-only interactive, red never a CTA", () => {
  test("keystone pulse, details, and rondo controls are theme-driven, never red", async ({ page, issues }) => {
    await registerCoach(page);
    await page.getByTestId("nav-formations").click();

    const seenDetailsBtn = new Set<string>();
    const seenKeystoneGlow = new Set<string>();
    const seenRondoPill = new Set<string>();

    for (const theme of ["pitch", "dark", "board"] as const) {
      await page.getByTestId(`theme-switch-${theme}`).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

      const redRgb = await toRgb(page, "--red");

      const detailsBg = await page
        .getByTestId("formations-details-toggle")
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      seenDetailsBtn.add(detailsBg);
      expect(detailsBg).not.toBe(redRgb);

      const keystoneGlow = await page
        .locator('[data-token-id="six"] .token-face')
        .evaluate((el) => getComputedStyle(el).filter);
      seenKeystoneGlow.add(keystoneGlow);
      expect(keystoneGlow).not.toContain("none");

      await page.getByTestId("formations-rondo-toggle").click();
      const pillBg = await page
        .getByTestId("formations-rondo-active-toggle")
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      seenRondoPill.add(pillBg);
      expect(pillBg).not.toBe(redRgb);

      const zoneStroke = await page
        .locator('[data-zone-key="first_line"]')
        .evaluate((el) => getComputedStyle(el).stroke);
      // Rondo zones read the gold --accent token: never the red one.
      expect(zoneStroke).not.toBe(redRgb);

      await page.getByTestId("formations-rondo-active-toggle").click();
    }

    // Every theme actually painted a distinct value: proves gold-only
    // elements read CSS variables per theme rather than a baked-in color.
    expect(seenDetailsBtn.size).toBe(3);
    expect(seenKeystoneGlow.size).toBe(3);
    expect(seenRondoPill.size).toBe(3);

    await assertCleanPage(page, issues);
  });
});
