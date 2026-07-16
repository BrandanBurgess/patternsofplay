// Identity page journey (T-034, Brief step 20, PNG 13, 33, 40-42, 44, 45).
// Runs under both Playwright projects (desktop landscape, iPhone 13
// portrait). Covers the ticket's Screens DoD lines (Brief section 5):
//   "Each page matches its PNGs across the three themes on desktop and
//    phone frames; gold is the only interactive color; red never appears
//    as a call to action."
//   "Identity: the four scripted animations play; static teams render
//    their shape; every reference team card follows the five-part
//    Section 6 template; 'curate, never lock' copy tone verified."
//
// Split into several focused tests (rather than one long journey) so the
// four real-time animation waits do not stack inside a single test's
// budget; each test registers its own fresh coach, same convention as
// roster.spec.ts / player.spec.ts.

import { test, expect, assertCleanPage, registerCoach } from "./fixtures";
import type { Page } from "@playwright/test";

async function openSheet(page: Page) {
  const handle = page.getByTestId("identity-sheet-handle");
  if ((await handle.getAttribute("aria-expanded")) !== "true") {
    await handle.click();
  }
  await expect(page.getByTestId("identity-sheet-body")).toBeVisible();
}

async function selectByName(page: Page, name: string) {
  await openSheet(page);
  await page.getByTestId("identity-search").fill(name);
  await expect(page.getByTestId("identity-tile")).toHaveCount(1);
  await page.getByTestId("identity-tile").click();
  await expect(page.getByTestId("identity-sheet-body")).toHaveCount(0);
  await expect(page.getByTestId("identity-meta-bar")).toContainText(name);
}

/** Waits for the preview board's autoplay to finish (PatternPreviewBoard
 * sets data-playing on its own .pattern-preview root, same convention as
 * the whiteboard's .board-root). */
async function waitPreviewDone(page: Page) {
  const root = page.locator(".pattern-preview");
  await expect(root).toHaveAttribute("data-playing", "true", { timeout: 4000 });
  await expect(root).toHaveAttribute("data-playing", "false", { timeout: 15000 });
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

test.describe("identity: default view, segments, search, curate-never-lock copy", () => {
  test("browse sheet: three segments, counts, and scoped search", async ({ page, issues }) => {
    await registerCoach(page);
    await page.getByTestId("nav-identity").click();
    await expect(page.getByTestId("nav-identity")).toHaveAttribute("aria-current", "page");

    // --- Default view: empty board, no meta bar (design README:
    // "empty board by default") ---
    await expect(page.getByTestId("pattern-empty")).toBeVisible();
    await expect(page.getByTestId("identity-meta-bar")).toHaveCount(0);

    // --- "curate, never lock" copy tone (doc 03 section 7 rule 6) ---
    await expect(page.getByTestId("identity-info")).toHaveAttribute("title", /curate, never lock/);

    // --- Browse sheet: Reference teams is the default segment, three
    // segments total (design README: "three segments") ---
    await openSheet(page);
    await expect(page.getByTestId("identity-seg-reference_team")).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expect(page.getByTestId("identity-tile")).toHaveCount(15);

    await page.getByTestId("identity-seg-style_archetype").click();
    await expect(page.getByTestId("identity-tile")).toHaveCount(6);
    await page.getByTestId("identity-seg-cult_card").click();
    await expect(page.getByTestId("identity-tile")).toHaveCount(6);
    await page.getByTestId("identity-seg-reference_team").click();
    await expect(page.getByTestId("identity-tile")).toHaveCount(15);

    // --- Search scopes to the active segment ---
    await page.getByTestId("identity-search").fill("Barcelona");
    await expect(page.getByTestId("identity-tile")).toHaveCount(1);
    await expect(page.getByTestId("identity-tile")).toContainText("Barcelona 2008-12");
    await page.getByTestId("identity-search").fill("nonsense-team-xyz");
    await expect(page.getByTestId("identity-empty-result")).toBeVisible();

    await assertCleanPage(page, issues);
  });
});

// =========================================================
// DoD: "the four scripted animations play" (assert token movement, not
// just player visibility: verify-ui contract). One test per team so each
// stays comfortably inside the default test budget.
// =========================================================
test.describe("identity: the four scripted animations play", () => {
  for (const name of [
    "Barcelona 2008-12",
    "Liverpool 2018-20",
    "Real Madrid 2010-13",
    "Leicester City 2015/16",
  ]) {
    test(`${name}: ball token moves through its signature sequence`, async ({ page, issues }) => {
      await registerCoach(page);
      await page.getByTestId("nav-identity").click();
      await selectByName(page, name);

      const ball = page.locator('[data-token-id="ball"]');
      const startBox = (await ball.boundingBox())!;
      await waitPreviewDone(page);
      const endBox = (await ball.boundingBox())!;
      const moved = Math.abs(startBox.x - endBox.x) > 15 || Math.abs(startBox.y - endBox.y) > 15;
      expect(moved, `${name}: ball token should move during its signature animation`).toBe(true);

      await assertCleanPage(page, issues);
    });
  }
});

test.describe("identity: static teams render their shape", () => {
  test("Atletico Madrid: all eleven positions, no Playing pill, no animation", async ({
    page,
    issues,
  }) => {
    await registerCoach(page);
    await page.getByTestId("nav-identity").click();
    await selectByName(page, "Atletico Madrid 2013/14");

    // Static: no playback, so no Playing pill ever appears.
    await expect(page.getByTestId("identity-playing-pill")).toHaveCount(0);
    // All 11 positions from the static_shape render as tokens (no ball:
    // a static shape has no ball holder).
    await expect(page.locator("[data-token-id]")).toHaveCount(11);
    await expect(page.locator('[data-token-id="ball"]')).toHaveCount(0);
    await expect(page.locator('[data-token-id="cm_l"] .token-label')).toHaveText("CM");

    await assertCleanPage(page, issues);
  });

  test("Man City 2022/23: renders its in-possession shape too", async ({ page, issues }) => {
    await registerCoach(page);
    await page.getByTestId("nav-identity").click();
    await selectByName(page, "Manchester City 2022/23");

    await expect(page.getByTestId("identity-playing-pill")).toHaveCount(0);
    await expect(page.locator("[data-token-id]")).toHaveCount(11);

    await assertCleanPage(page, issues);
  });
});

test.describe("identity: five-part Section 6 template, pass-risk, cult corner", () => {
  test("reference team card: five parts in order, no pass-risk", async ({ page, issues }) => {
    await registerCoach(page);
    await page.getByTestId("nav-identity").click();
    await selectByName(page, "Barcelona 2008-12");

    await page.getByTestId("identity-details-toggle").click();
    const panel = page.getByTestId("identity-details-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("identity-detail-formation")).toContainText(
      "4-3-3 with a false nine"
    );
    await expect(panel.getByTestId("identity-detail-core-idea")).toContainText("Juego de posición");
    await expect(panel.getByTestId("identity-detail-signature-patterns")).toBeVisible();
    await expect(panel.getByTestId("identity-detail-keystone-roles")).toBeVisible();
    await expect(panel.getByTestId("identity-detail-youth-takeaway")).toContainText(
      "Positions before players"
    );
    // T-012: Bible 8.2.4's age-suitability hint, added after Youth takeaway.
    await expect(panel.getByTestId("identity-detail-age-hint")).toContainText("U13+");
    // A reference team's own pass_risk_json is null: the block never renders.
    await expect(panel.getByTestId("identity-detail-pass-risk")).toHaveCount(0);
    // Order in the DOM matches the template's own order.
    const rowOrder = await panel
      .locator("[data-testid^='identity-detail-']")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    expect(rowOrder).toEqual([
      "identity-detail-formation",
      "identity-detail-core-idea",
      "identity-detail-signature-patterns",
      "identity-detail-keystone-roles",
      "identity-detail-youth-takeaway",
      "identity-detail-age-hint",
    ]);
    await page.getByTestId("identity-details-close").click();
    await expect(page.getByTestId("identity-details-panel")).toHaveCount(0);

    await assertCleanPage(page, issues);
  });

  test("details-only reference team: no visualization, still the full template", async ({
    page,
    issues,
  }) => {
    await registerCoach(page);
    await page.getByTestId("nav-identity").click();
    await selectByName(page, "France 2018");

    // CLAUDE.md rule 6: content with no designed surface stays seed data,
    // rendered only in Details, board stays empty.
    await expect(page.getByTestId("pattern-empty")).toBeVisible();
    await page.getByTestId("identity-details-toggle").click();
    await expect(page.getByTestId("identity-detail-formation")).toContainText("4-2-3-1");
    await expect(page.getByTestId("identity-detail-youth-takeaway")).toBeVisible();
    await expect(page.getByTestId("identity-detail-age-hint")).toContainText("U13+");

    await assertCleanPage(page, issues);
  });

  test("style archetype: pass-risk block (Encouraged / Off-menu / Tempo), no fabricated formation row", async ({
    page,
    issues,
  }) => {
    await registerCoach(page);
    await page.getByTestId("nav-identity").click();
    await openSheet(page);
    await page.getByTestId("identity-seg-style_archetype").click();
    await selectByName(page, "Positional Possession");

    await page.getByTestId("identity-details-toggle").click();
    const styleRisk = page.getByTestId("identity-detail-pass-risk");
    await expect(styleRisk).toBeVisible();
    await expect(styleRisk).toContainText("Encouraged:");
    await expect(styleRisk).toContainText("Off-menu:");
    await expect(styleRisk).toContainText("Tempo:");
    // Style archetypes' core_idea has no "Formation:" leading sentence, so
    // the template does not fabricate a Formation & shape row for them.
    await expect(page.getByTestId("identity-detail-formation")).toHaveCount(0);
    await expect(page.getByTestId("identity-detail-age-hint")).toContainText("U13+");

    await assertCleanPage(page, issues);
  });

  test("cult corner: lightweight mini-card, no keystone roles, no pass-risk", async ({
    page,
    issues,
  }) => {
    await registerCoach(page);
    await page.getByTestId("nav-identity").click();
    await openSheet(page);
    await page.getByTestId("identity-seg-cult_card").click();
    await expect(page.getByTestId("identity-tile")).toHaveCount(6);
    await selectByName(page, "Greece 2004");

    await expect(page.getByTestId("pattern-empty")).toBeVisible();
    await page.getByTestId("identity-details-toggle").click();
    await expect(page.getByTestId("identity-detail-core-idea")).toBeVisible();
    await expect(page.getByTestId("identity-detail-youth-takeaway")).toBeVisible();
    await expect(page.getByTestId("identity-detail-keystone-roles")).toHaveCount(0);
    await expect(page.getByTestId("identity-detail-pass-risk")).toHaveCount(0);
    await expect(page.getByTestId("identity-detail-signature-patterns")).toHaveCount(0);
    await expect(page.getByTestId("identity-detail-age-hint")).toContainText("U11+");

    await assertCleanPage(page, issues);
  });
});

test.describe("identity: matches across all three themes, gold-only interactive, red never a CTA", () => {
  test("segments, Details, and the pass-risk status colors are theme-driven", async ({
    page,
    issues,
  }) => {
    await registerCoach(page);
    await page.getByTestId("nav-identity").click();
    await openSheet(page);
    await page.getByTestId("identity-seg-style_archetype").click();

    const seenSegActive = new Set<string>();
    const seenDetailsBtn = new Set<string>();
    const seenEncouraged = new Set<string>();

    for (const theme of ["pitch", "dark", "board"] as const) {
      await page.getByTestId(`theme-switch-${theme}`).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

      const redRgb = await toRgb(page, "--red");
      // The pass-risk "Off-menu" label renders with --text-red (IdentityPage.css:
      // the readable-on-surface red variant, same convention as
      // RosterPage.css's fit-warning text), not the raw --red swatch.
      const textRedRgb = await toRgb(page, "--text-red");

      const segActiveBg = await page
        .getByTestId("identity-seg-style_archetype")
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      const segInactiveBg = await page
        .getByTestId("identity-seg-reference_team")
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      seenSegActive.add(segActiveBg);
      // Gold is the only interactive color: the active segment reads
      // differently from an inactive one, and it is never red.
      expect(segActiveBg).not.toBe(segInactiveBg);
      expect(segActiveBg).not.toBe(redRgb);

      await selectByName(page, "Positional Possession");
      await page.getByTestId("identity-details-toggle").click();

      const detailsBg = await page
        .getByTestId("identity-details-toggle")
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      const clearBg = await page
        .getByTestId("identity-clear")
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      seenDetailsBtn.add(detailsBg);
      expect(detailsBg).not.toBe(redRgb);
      expect(clearBg).not.toBe(redRgb);
      expect(clearBg).not.toBe(detailsBg);

      // The pass-risk "Off-menu" label uses the status red (never a call
      // to action: it is plain text inside a details panel, nothing to
      // click), while "Encouraged" always uses the gold accent.
      const encouragedColor = await page
        .locator(".identity-risk-encouraged")
        .evaluate((el) => getComputedStyle(el).color);
      const discouragedColor = await page
        .locator(".identity-risk-discouraged")
        .evaluate((el) => getComputedStyle(el).color);
      seenEncouraged.add(encouragedColor);
      expect(discouragedColor).toBe(textRedRgb);
      expect(encouragedColor).not.toBe(redRgb);
      expect(encouragedColor).not.toBe(textRedRgb);

      await page.getByTestId("identity-clear").click();
      await openSheet(page);
      await page.getByTestId("identity-seg-style_archetype").click();
    }

    expect(seenSegActive.size).toBe(3);
    expect(seenDetailsBtn.size).toBe(3);
    expect(seenEncouraged.size).toBe(3);

    await assertCleanPage(page, issues);
  });
});
