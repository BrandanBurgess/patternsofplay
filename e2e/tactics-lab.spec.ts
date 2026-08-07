// Tactics Lab journey for the Formations page (T-106, doc 06 sections 5.1,
// 5.2, 5.4). Runs under both Playwright projects: desktop landscape at
// 1440x900 and iPhone 13 at 390x844, where the board renders PORTRAIT and
// the meta bar collapses to an icon row whose controls open bottom sheets.
// No feature is desktop-only, so every assertion below runs at both
// viewports; the only difference is that a phone opens a control's sheet
// before touching what is inside it.
//
// Covers the ticket's DoD lines:
//   selecting each phase and seeing the board morph and the caption change;
//   turning opposition on, picking an opponent formation and phase, and
//   seeing computed ratios appear;
//   opening a rotation and seeing its risk line;
//   toggling the grid and seeing a breach check.
// Plus the two rules the epic exists for: a computed ratio is never
// mistakable for the seeded fallback, and a breach reads as a check rather
// than an error.

import { test, expect, assertCleanPage, registerCoach, registerPlayer } from "./fixtures";
import type { Page } from "@playwright/test";

/** True on the phone project, where doc 06 section 5.4 collapses the meta
 *  bar to icons and every control opens a bottom sheet. Detected from the
 *  DOM (the Phase icon exists only in the icon row) rather than from the
 *  project name, so the test follows the layout the app actually chose. */
async function isPhone(page: Page): Promise<boolean> {
  return (await page.getByTestId("formations-phase-toggle").count()) > 0;
}

async function openFormations(page: Page) {
  await page.getByTestId("nav-formations").click();
  await expect(page.getByTestId("formations-meta-bar")).toContainText("4-3-3");
  await expect(page.locator("[data-token-id]")).toHaveCount(11);
}

async function tokenTransform(page: Page, id: string): Promise<string | null> {
  return page.locator(`[data-token-id="${id}"]`).getAttribute("transform");
}

/** Selects a phase, opening the phone's Phase sheet first if there is one,
 *  and leaving the board unobstructed afterwards. */
async function selectPhase(page: Page, key: string) {
  if (await isPhone(page)) {
    await page.getByTestId("formations-phase-toggle").click();
    await expect(page.getByTestId("formations-phase-panel")).toBeVisible();
  }
  await page.getByTestId(`formations-phase-${key}`).click();
  if (await page.getByTestId("formations-phase-close").count()) {
    await page.getByTestId("formations-phase-close").click();
  }
}

test.describe("tactics lab: phase morph, opposition, live counts, rotations, grid", () => {
  test("full coach journey", async ({ page, issues }) => {
    await registerCoach(page);
    await openFormations(page);
    const phone = await isPhone(page);

    // ------------------------------------------------------------------
    // DoD: selecting each phase morphs the board and changes the caption.
    // ------------------------------------------------------------------
    const caption = page.getByTestId("formations-phase-caption");
    await expect(caption).toContainText("base shape");
    const baseGk = await tokenTransform(page, "gk");

    // With the ball: seeds/formation_phases.json puts the 4-3-3 keeper at
    // x 14 in possession against x 5 at base, so the keeper is a token that
    // demonstrably walks in every phase rather than one that happens to sit
    // still.
    await selectPhase(page, "in_possession");
    await expect(caption).toContainText("Trigger:");
    await expect.poll(() => tokenTransform(page, "gk")).not.toBe(baseGk);
    const ipGk = await tokenTransform(page, "gk");
    const ipCaption = (await caption.textContent()) ?? "";

    // Without the ball: a different shape again, and a different caption.
    await selectPhase(page, "out_of_possession");
    await expect.poll(() => tokenTransform(page, "gk")).not.toBe(ipGk);
    await expect(caption).not.toHaveText(ipCaption);
    await expect(caption).toContainText("Trigger:");
    const oopGk = await tokenTransform(page, "gk");

    // Rest defence.
    await selectPhase(page, "rest_defence");
    await expect.poll(() => tokenTransform(page, "gk")).not.toBe(oopGk);
    await expect(caption).toContainText("Trigger:");

    // Back to base closes the loop, and all eleven are still on the board:
    // a morph binds by slot, it never drops or duplicates a player.
    await selectPhase(page, "base");
    await expect.poll(() => tokenTransform(page, "gk")).toBe(baseGk);
    await expect(page.locator('[data-token-side="home"]')).toHaveCount(11);

    // ------------------------------------------------------------------
    // The seeded fallback chip, BEFORE any opposition is placed. Doc 06
    // section 5.1: muted, and the seeded ratio only.
    // ------------------------------------------------------------------
    await page.getByTestId("formations-rondo-toggle").click();
    // SIX zones (doc 06 section 0), and only five of them are polygons: the
    // counterpress ring is a circle around the ball (doc 06 section 2.3),
    // so it is not a `rondo-zone` and never will be.
    await expect(page.getByTestId("rondo-zone")).toHaveCount(5);
    await expect(page.getByTestId("formations-rondo-ring")).toHaveCount(1);
    // The ring's seeded polygon is still never drawn. That polygon bounds
    // the half of the pitch the ring is coached in; it is not the zone, and
    // filling it would show an eleven-a-side count in the same language as
    // a real 4v2.
    await expect(page.locator('[data-zone-key="counterpress_ring"]')).toHaveCount(0);

    const chips = page.getByTestId("formations-zone-chip");
    await expect(chips).toHaveCount(6);
    for (const chip of await chips.all()) {
      await expect(chip).toHaveAttribute("data-source", "seeded");
    }
    const seededColor = await chips
      .first()
      .evaluate((el) => getComputedStyle(el).color);

    // The zone card says out loud that this is a coached rondo, not a count.
    await page.locator('[data-zone-key="midfield_box"]').click();
    await expect(page.getByTestId("formations-zone-fallback")).toContainText(
      "not a count of what is on the board"
    );
    await page.getByTestId("formations-zone-close").click();

    // ------------------------------------------------------------------
    // DoD: turn opposition on, pick an opponent formation and phase, and
    // see COMPUTED ratios appear.
    // ------------------------------------------------------------------
    await page.getByTestId("formations-opposition-toggle").click();
    await expect(page.getByTestId("formations-opposition-panel")).toBeVisible();

    await page.getByTestId("formations-opponent-formation").selectOption("442");
    // The opponent phase picker opens on an out-of-possession variant,
    // because that is the one that matters (doc 06 section 5.1). It is a
    // real seeded variant, not the empty "their base shape" option.
    await expect(page.getByTestId("formations-opponent-phase")).not.toHaveValue("");
    await page.getByTestId("formations-opponent-phase").selectOption({ index: 1 });

    // Twenty two tokens: our eleven plus theirs, in the opponent colour the
    // board already defines, mirrored into our frame by the board engine.
    await expect(page.locator('[data-token-side="away"]')).toHaveCount(11);

    // A seeded pair (4-3-3 against 4-4-2) carries a coached route, so the
    // route line is NOT flagged inferred and the edges are rendered.
    await expect(page.getByTestId("formations-read")).toBeVisible();
    await expect(page.getByTestId("formations-read-route")).toHaveAttribute("data-inferred", "false");
    await expect(page.getByTestId("formations-read-unseeded")).toHaveCount(0);
    await expect(page.getByTestId("formations-read-our-edges")).toBeVisible();
    // Every card names which superiority it is talking about (doc 06 2.1).
    await expect(page.getByTestId("formations-read-spare")).toContainText(/superiority/i);

    await page.getByTestId("formations-opposition-close").click();

    // Now the chips are COMPUTED, and visibly so: a different data-source,
    // a verdict, and a different colour from the muted fallback above. All
    // six, the ring included: countZone reads a circle the same way it
    // reads a polygon.
    await expect(chips).toHaveCount(6);
    for (const chip of await chips.all()) {
      await expect(chip).toHaveAttribute("data-source", "computed");
      await expect(chip).toHaveAttribute("data-verdict", /superiority|parity|inferiority/);
      await expect(chip).toHaveText(/\d+v\d+/);
    }
    const computedColor = await chips.first().evaluate((el) => getComputedStyle(el).color);
    expect(computedColor, "a computed ratio must not look like a seeded one").not.toBe(seededColor);

    // The tapped zone card carries the computed read, naming the superiority.
    await page.locator('[data-zone-key="midfield_box"]').click();
    await expect(page.getByTestId("formations-zone-fallback")).toHaveCount(0);
    await expect(page.getByTestId("formations-zone-read")).toContainText(
      /Numerical superiority|Numerical inferiority|Parity/
    );
    await page.getByTestId("formations-zone-close").click();

    // ------------------------------------------------------------------
    // An UNSEEDED pair. Doc 06 section 2.8: render the computed numbers,
    // say plainly there is no coached read, and label the route inferred.
    // formation_matchups seeds the 15 unordered pairs of six formations, so
    // a formation against ITSELF is the pair nobody wrote a card for.
    // ------------------------------------------------------------------
    await page.getByTestId("formations-opposition-toggle").click();
    await page.getByTestId("formations-opponent-formation").selectOption("433");
    await expect(page.getByTestId("formations-read-unseeded")).toContainText("no coached read yet");
    await expect(page.getByTestId("formations-read-route")).toHaveAttribute("data-inferred", "true");
    await expect(page.getByTestId("formations-read-route")).toContainText("probably");
    // The numbers are still real: the counts are computed either way.
    await expect(page.getByTestId("formations-read-spare")).toBeVisible();
    await page.getByTestId("formations-opposition-close").click();
    await expect(chips.first()).toHaveAttribute("data-source", "computed");

    // ------------------------------------------------------------------
    // DoD: open a rotation and see its risk line, with equal visual weight
    // to the gain (doc 06 section 5.1: "the risk line is not a footnote").
    // ------------------------------------------------------------------
    await page.getByTestId("formations-rotations-toggle").click();
    await expect(page.getByTestId("formations-rotations-panel")).toBeVisible();
    // Mutual exclusion: opening Rotations closes the Rondo map overlay,
    // the ring with it.
    await expect(page.getByTestId("rondo-zone")).toHaveCount(0);
    await expect(page.getByTestId("formations-zone-chip")).toHaveCount(0);
    await expect(page.getByTestId("formations-rondo-ring")).toHaveCount(0);

    const rotationItems = page.getByTestId("formations-rotation-item");
    expect(await rotationItems.count()).toBeGreaterThan(0);
    await rotationItems.first().click();
    await expect(page.getByTestId("formations-rotation-card")).toBeVisible();
    await expect(page.getByTestId("formations-rotation-trigger")).not.toBeEmpty();
    await expect(page.getByTestId("formations-rotation-moves")).not.toBeEmpty();
    await expect(page.getByTestId("formations-rotation-points")).not.toBeEmpty();

    const gain = page.getByTestId("formations-rotation-gain");
    const risk = page.getByTestId("formations-rotation-risk");
    await expect(risk).toBeVisible();
    await expect(risk).toContainText(/\w/);
    const style = async (loc: typeof gain) =>
      loc.locator("p").last().evaluate((el) => {
        const s = getComputedStyle(el);
        return { fontSize: s.fontSize, color: s.color, opacity: s.opacity };
      });
    const gainStyle = await style(gain);
    const riskStyle = await style(risk);
    expect(riskStyle, "the risk line is not a footnote").toEqual(gainStyle);
    const gainBox = await gain.boundingBox();
    const riskBox = await risk.boundingBox();
    expect(Math.abs((gainBox?.width ?? 0) - (riskBox?.width ?? 1))).toBeLessThanOrEqual(1);

    // The rotation plays on the board: its animation spec is a vignette of
    // the players who move, plus the ball.
    await expect(page.locator('[data-token-side="ball"]')).toHaveCount(1);

    // ------------------------------------------------------------------
    // DoD: toggle the grid and see a breach CHECK, never an error.
    // ------------------------------------------------------------------
    await page.getByTestId("formations-grid-toggle").click();
    await expect(page.getByTestId("formations-grid-panel")).toBeVisible();
    // Mutual exclusion again: only one of Rondo, Rotations and Grid.
    await expect(page.getByTestId("formations-rotations-panel")).toHaveCount(0);
    // The eleven are back: closing the rotation restored the phase scene.
    await expect(page.locator('[data-token-side="home"]')).toHaveCount(11);

    await expect(page.getByTestId("formations-grid-layer")).toBeVisible();
    const checks = page.getByTestId("formations-grid-check");
    // The 4-3-3 base shape breaches on the centre lane and both wide lanes
    // (seeds/formations.json against doc 06 section 2.2's guidelines), so
    // there is always something to read here.
    expect(await checks.count()).toBeGreaterThan(0);
    await expect(page.getByTestId("formations-grid-band").first()).toBeVisible();
    const checkText = (await checks.allTextContents()).join(" ");
    expect(checkText).toContain("?");
    expect(checkText.toLowerCase()).not.toContain("invalid");
    expect(checkText.toLowerCase()).not.toContain("wrong");
    expect(checkText.toLowerCase()).not.toContain("error");

    await page.getByTestId("formations-grid-close").click();
    await expect(page.getByTestId("formations-grid-layer")).toHaveCount(0);

    await assertCleanPage(page, issues);
  });
});

test.describe("tactics lab: a player gets the whole lab, because none of it is coach-only", () => {
  // Every route this page calls is library world (formation phases,
  // matchups, rotations): no team_id, no coach gate, visible to both roles
  // by design (backend/app/routers/tactics.py). Nothing here is fit-warning
  // or receipt shaped. This journey exists so that stays true: the moment
  // someone wires a coach-only call into this page (T-107's archetype
  // suggestion ranking is the obvious candidate), a player hits a 403 and
  // assertCleanPage fails on the failed request rather than the page
  // quietly rendering a hole.
  //
  // T-107 landed the obvious candidate: the personnel panel's suggestion
  // ranking and unit balance read. This journey now walks into that panel
  // too (e2e/personnel-panel.spec.ts owns the full role-split coverage;
  // this is the narrower "does the ORIGINAL tripwire still mean what it
  // said" check, in the file that made the promise).
  test("player role reaches every control with no failed request", async ({
    page,
    issues,
    browser,
  }) => {
    const coachPage = await browser.newPage();
    const { joinCode } = await registerCoach(coachPage);
    await coachPage.close();

    await registerPlayer(page, joinCode);
    await openFormations(page);

    await selectPhase(page, "out_of_possession");
    await expect(page.getByTestId("formations-phase-caption")).toContainText("Trigger:");

    await page.getByTestId("formations-opposition-toggle").click();
    await page.getByTestId("formations-opponent-formation").selectOption("352");
    await expect(page.getByTestId("formations-read")).toBeVisible();
    await page.getByTestId("formations-opposition-close").click();

    await page.getByTestId("formations-rotations-toggle").click();
    await expect(page.getByTestId("formations-rotation-item").first()).toBeVisible();
    await page.getByTestId("formations-rotations-close").click();

    await page.getByTestId("formations-grid-toggle").click();
    await expect(page.getByTestId("formations-grid-check").first()).toBeVisible();
    await page.getByTestId("formations-grid-close").click();

    // T-107: the personnel panel opens for a player (assignment and the
    // archetype picker are open-to-both-roles reads), but its coach-only
    // suggestion list, footedness note, and unit balance section are
    // absent from the DOM, and none of their requests ever fire (or this
    // 403s and assertCleanPage below catches it as a failed request).
    await page.getByTestId("formations-sheet-handle").click();
    await page.getByTestId("formations-sheet-tab-personnel").click();
    await expect(page.getByTestId("personnel-panel")).toBeVisible();
    await expect(page.getByTestId("personnel-slot").first()).toBeVisible();
    await expect(page.getByTestId("personnel-suggestions")).toHaveCount(0);
    await expect(page.getByTestId("personnel-foot-note")).toHaveCount(0);
    await expect(page.getByTestId("personnel-balance")).toHaveCount(0);
    await page.getByTestId("formations-sheet-handle").click();

    await assertCleanPage(page, issues);
  });
});

test.describe("tactics lab: themed across all three, gold for edges, red only as status", () => {
  test("chips and controls read theme variables, never a baked-in colour", async ({ page, issues }) => {
    await registerCoach(page);
    await openFormations(page);

    // Place an opposition once, so every theme below is measured against
    // live computed chips rather than the muted fallback.
    await page.getByTestId("formations-opposition-toggle").click();
    await page.getByTestId("formations-opponent-formation").selectOption("442");
    await page.getByTestId("formations-opposition-close").click();
    await page.getByTestId("formations-rondo-toggle").click();
    await expect(page.getByTestId("formations-zone-chip").first()).toHaveAttribute(
      "data-source",
      "computed"
    );

    const seenChip = new Set<string>();
    const seenSegment = new Set<string>();

    for (const theme of ["pitch", "dark", "board"] as const) {
      await page.getByTestId(`theme-switch-${theme}`).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

      const redRgb = await page.evaluate(() => {
        const el = document.createElement("div");
        el.style.color = "var(--red)";
        document.body.appendChild(el);
        const rgb = getComputedStyle(el).color;
        el.remove();
        return rgb;
      });

      const chip = page.getByTestId("formations-zone-chip").first();
      seenChip.add(await chip.evaluate((el) => getComputedStyle(el).color));

      // The interactive controls stay gold: red is a verdict colour on this
      // page and never a call to action.
      const grid = page.getByTestId("formations-grid-toggle");
      const gridColor = await grid.evaluate((el) => getComputedStyle(el).borderTopColor);
      expect(gridColor).not.toBe(redRgb);
      const rondo = page.getByTestId("formations-rondo-active-toggle");
      const rondoBg = await rondo.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(rondoBg).not.toBe(redRgb);
      seenSegment.add(rondoBg);
    }

    // Three themes, three distinct painted values: proves the chip and the
    // active control read CSS variables rather than a hardcoded colour.
    expect(seenChip.size).toBe(3);
    expect(seenSegment.size).toBe(3);

    await assertCleanPage(page, issues);
  });
});
