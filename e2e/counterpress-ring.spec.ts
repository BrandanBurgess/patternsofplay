// The counterpress ring (T-112, doc 06 sections 0, 2.3, 5.1). Runs under
// both Playwright projects: desktop landscape at 1440x900 and iPhone 13 at
// 390x844, where the board renders PORTRAIT and the meta bar collapses to
// an icon row.
//
// WHY THIS FILE EXISTS. Doc 06 section 0 approved a six zone Rondo Map on
// all six formations as a founder decision. T-106 shipped five, because
// section 5.1 says the ring renders only "when a ball is placed or a phase
// with a defined ball position is active" and this page has neither. It was
// never shown section 2.3, which defines the ring as a circle of radius 18
// centred on the ball OR, when no ball is placed, on the centroid of our
// three most advanced players. That fallback is unconditional, so the ring
// is always renderable and section 2.3 resolves the contradiction.
//
// Covers this ticket's DoD lines:
//   the Rondo Map shows six zones on all six formations;
//   the ring renders as a circle and never as its seeded polygon;
//   the ring MOVES when the phase changes, which is the teaching point;
//   its chip shows a seeded ratio with opposition off and a computed one
//   with opposition on, and the two are never mistakable;
//   the ring does not steal taps from the polygon zones underneath it.

import { test, expect, assertCleanPage, registerCoach } from "./fixtures";
import type { Page } from "@playwright/test";

/** True on the phone project, where doc 06 section 5.4 collapses the meta
 *  bar to icons and every control opens a bottom sheet. Detected from the
 *  DOM rather than from the project name, so the test follows the layout
 *  the app actually chose. */
async function isPhone(page: Page): Promise<boolean> {
  return (await page.getByTestId("formations-phase-toggle").count()) > 0;
}

async function openFormations(page: Page) {
  await page.getByTestId("nav-formations").click();
  await expect(page.getByTestId("formations-meta-bar")).toContainText("4-3-3");
  await expect(page.locator("[data-token-id]")).toHaveCount(11);
}

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

/** The ring's centre and radius in normalized render space, straight off
 *  the ellipse's own attributes. The layer's viewBox is 0 0 100 100 with
 *  preserveAspectRatio="none", so these numbers ARE the render coordinates
 *  the page computed, with no pixel measurement to go fuzzy on us. */
async function ringGeometry(page: Page) {
  return page.getByTestId("formations-rondo-ring").evaluate((el) => ({
    cx: Number(el.getAttribute("cx")),
    cy: Number(el.getAttribute("cy")),
    rx: Number(el.getAttribute("rx")),
    ry: Number(el.getAttribute("ry")),
  }));
}

function ringChip(page: Page) {
  return page.locator('[data-chip-zone="counterpress_ring"]');
}

/**
 * Tap the ring's LINE.
 *
 * Deliberately not `locator.click()`: that aims at the element's bounding
 * box centre, and the centre of this ellipse is its interior, which is
 * exactly the part the page refuses to hit test. Aiming at the middle of
 * the box's left edge puts the pointer on the ring itself, which is the
 * only place a tap on the ring is meant to land, and is also the assertion
 * that the affordance is the line rather than the disc.
 */
async function tapRingLine(page: Page) {
  const box = await page.getByTestId("formations-rondo-ring").boundingBox();
  expect(box, "the ring must be on screen to be tapped").not.toBeNull();
  await page.mouse.click(box!.x + 1, box!.y + box!.height / 2);
}

test.describe("counterpress ring: the sixth zone, ball relative and moving", () => {
  test("the ring renders, moves with the phase, and carries seeded then computed ratios", async ({
    page,
    issues,
  }) => {
    await registerCoach(page);
    await openFormations(page);

    // ------------------------------------------------------------------
    // DoD: the Rondo Map shows SIX zones. Five polygons plus the ring,
    // which is a circle and so is deliberately not a `rondo-zone`.
    // ------------------------------------------------------------------
    await page.getByTestId("formations-rondo-toggle").click();
    await expect(page.getByTestId("rondo-zone")).toHaveCount(5);
    await expect(page.getByTestId("formations-rondo-ring")).toHaveCount(1);
    await expect(page.getByTestId("formations-zone-chip")).toHaveCount(6);

    // The ring is a CIRCLE, never the polygon seeded on the same row. That
    // polygon bounds the half of the pitch the ring is coached in.
    await expect(page.locator('[data-zone-key="counterpress_ring"]')).toHaveCount(0);

    // Radius 18 model units, off the seeded column, on both axes of the
    // normalized render space. Equal rx and ry there is what makes the
    // painted shape the same locus pointInCircle counts inside; the board's
    // aspect ratio then stretches it, differently per orientation, which is
    // why it is an ellipse on screen and correct rather than pretty.
    const base = await ringGeometry(page);
    expect(base.rx).toBe(18);
    expect(base.ry).toBe(18);
    expect(base.rx).toBe(base.ry);

    // It sits where the shape is, not on a fixed anchor: the 4-3-3's three
    // most advanced average model (80.3, 50), which renders as (80.3, 50)
    // landscape and (50, 19.7) portrait once left = y and top = 100 - x are
    // applied. Both are the same model point mapped through modelToRender,
    // which is the only place this page knows about orientation.
    const portrait = await isPhone(page);
    if (portrait) {
      expect(base.cx).toBeCloseTo(50, 3);
      expect(base.cy).toBeCloseTo(100 - 80.3333, 2);
    } else {
      expect(base.cx).toBeCloseTo(80.3333, 2);
      expect(base.cy).toBeCloseTo(50, 3);
    }

    // THE PORTRAIT MAPPING, measured rather than assumed. A circle in model
    // space is NOT a circle on screen: the model is a 0-100 square that the
    // board stretches to 1050x680 landscape and 700x1000 portrait, so the
    // painted shape is an ellipse whose axis ratio is the pitch's own. That
    // is the correct rendering, because it is the shape pointInCircle
    // actually counts inside; a screen-perfect circle would disagree with
    // the counting, and would disagree differently in each orientation.
    const ringBox = await page.getByTestId("formations-rondo-ring").boundingBox();
    const boardBox = await page.getByTestId("formations-chip-layer").boundingBox();
    expect(ringBox).not.toBeNull();
    expect(boardBox).not.toBeNull();
    // The measured box includes the painted stroke, one half of
    // .formations-ring's 2px width on each side. Non-scaling stroke is what
    // makes that a flat 2px on both axes rather than something that has to
    // be unscaled per axis.
    const STROKE_PX = 2;
    const drawnW = ringBox!.width - STROKE_PX;
    const drawnH = ringBox!.height - STROKE_PX;
    // Each axis is 36% (2 x radius 18) of the board on that axis.
    expect(Math.abs(drawnW - 0.36 * boardBox!.width)).toBeLessThan(1.5);
    expect(Math.abs(drawnH - 0.36 * boardBox!.height)).toBeLessThan(1.5);
    // Which means the ring's aspect IS the pitch's aspect, and the ring is
    // visibly not a screen circle in either orientation. Landscape is wider
    // than tall, portrait taller than wide, from the same model radius.
    expect(drawnW / drawnH).toBeCloseTo(boardBox!.width / boardBox!.height, 1);
    expect(Math.abs(drawnW - drawnH)).toBeGreaterThan(1);
    if (portrait) {
      expect(drawnH).toBeGreaterThan(drawnW);
    } else {
      expect(drawnW).toBeGreaterThan(drawnH);
    }

    // ------------------------------------------------------------------
    // DoD: the ring MOVES when the phase changes. Doc 06 section 2.3:
    // "It moves. That is the whole teaching point: rest defence is
    // relative to the ball, not to the pitch."
    // ------------------------------------------------------------------
    await selectPhase(page, "in_possession");
    await expect(page.getByTestId("formations-phase-caption")).toContainText("Trigger:");
    const inPossession = await ringGeometry(page);
    // Advancing the front three moves the centre toward their goal, which
    // is +x. Landscape reads that on cx, portrait on cy (top = 100 - x), so
    // the assertion names both rather than assuming a viewport.
    expect(
      `${inPossession.cx},${inPossession.cy}`,
      "the ring must follow the shape into the next phase"
    ).not.toBe(`${base.cx},${base.cy}`);
    if (portrait) {
      expect(inPossession.cy).toBeLessThan(base.cy);
    } else {
      expect(inPossession.cx).toBeGreaterThan(base.cx);
    }
    // The radius never changes: only the centre does.
    expect(inPossession.rx).toBe(base.rx);

    // A phase that pulls the front line BACK moves it the other way, so
    // this is a ring that tracks the shape rather than one that only ever
    // drifts forward.
    await selectPhase(page, "out_of_possession");
    const outOfPossession = await ringGeometry(page);
    if (portrait) {
      expect(outOfPossession.cy).toBeGreaterThan(inPossession.cy);
    } else {
      expect(outOfPossession.cx).toBeLessThan(inPossession.cx);
    }

    // Back to base and the ring comes back to exactly where it started: the
    // centre is a pure function of the shape on the board, with no drift.
    await selectPhase(page, "base");
    expect(await ringGeometry(page)).toEqual(base);

    // ------------------------------------------------------------------
    // DoD: the chip shows a SEEDED ratio with opposition off. Muted, and
    // marked as seeded, exactly like the other five.
    // ------------------------------------------------------------------
    const chip = ringChip(page);
    await expect(chip).toHaveAttribute("data-source", "seeded");
    await expect(chip).toHaveAttribute("data-chip-kind", "ring");
    // seeds/rondo_zones.json canonical_rondo, straight off the wire now
    // that RondoZoneOut carries it. This is the string the page could not
    // reach before T-112, and it is NOT the "4v4+3" spelling buried in
    // rondo_name: proof the chip reads the column rather than the name.
    await expect(chip).toHaveText("4v4 plus 3");
    const seededColor = await chip.evaluate((el) => getComputedStyle(el).color);

    // The ring's card explains that this zone is not a place on the pitch,
    // and reaching it is a tap on the ring's LINE.
    await tapRingLine(page);
    await expect(page.getByTestId("formations-zone-card")).toBeVisible();
    await expect(page.getByTestId("formations-zone-title")).toHaveText("The counterpress ring");
    await expect(page.getByTestId("formations-ring-note")).toContainText("This zone moves");
    await expect(page.getByTestId("formations-ring-note")).toContainText("radius 18");
    await expect(page.getByTestId("formations-zone-fallback")).toContainText(
      "not a count of what is on the board"
    );
    // Its seeded links are the ring's own, not a neighbour's.
    await expect(page.getByTestId("formations-linked-pattern").first()).toBeVisible();
    await page.getByTestId("formations-zone-close").click();

    // ------------------------------------------------------------------
    // DoD: with opposition ON the chip carries a COMPUTED ratio, coloured
    // by verdict, and never looks like the seeded one.
    // ------------------------------------------------------------------
    await page.getByTestId("formations-opposition-toggle").click();
    await page.getByTestId("formations-opponent-formation").selectOption("442");
    await page.getByTestId("formations-opposition-close").click();

    await expect(chip).toHaveAttribute("data-source", "computed");
    await expect(chip).toHaveAttribute("data-verdict", /superiority|parity|inferiority/);
    await expect(chip).toHaveText(/^\d+v\d+/);
    const computedColor = await chip.evaluate((el) => getComputedStyle(el).color);
    expect(computedColor, "a computed ratio must not look like a seeded one").not.toBe(seededColor);

    // The count is a real count of bodies inside the circle, not the
    // seeded label wearing a verdict.
    await expect(chip).not.toHaveText("4v4 plus 3");

    // The card follows the chip: a live read, no fallback sentence.
    await tapRingLine(page);
    await expect(page.getByTestId("formations-zone-fallback")).toHaveCount(0);
    await expect(page.getByTestId("formations-zone-read")).toContainText(
      /Numerical superiority|Numerical inferiority|Parity/
    );
    await page.getByTestId("formations-zone-close").click();

    await assertCleanPage(page, issues);
  });

  // ------------------------------------------------------------------
  // The overlap rule. The ring is a ball-relative reading, not a partition
  // of the pitch, so it crosses the polygon zones by design. It must not
  // swallow their taps: only its LINE is hit tested, and its interior is
  // not hit tested at all.
  // ------------------------------------------------------------------
  test("the ring overlaps the polygon zones without stealing their taps", async ({
    page,
    issues,
  }) => {
    await registerCoach(page);
    await openFormations(page);
    await page.getByTestId("formations-rondo-toggle").click();
    await expect(page.getByTestId("formations-rondo-ring")).toBeVisible();

    // The ring genuinely overlaps: its box crosses the last line's box.
    const ringBox = await page.getByTestId("formations-rondo-ring").boundingBox();
    const lastLineBox = await page.locator('[data-zone-key="last_line"]').boundingBox();
    expect(ringBox).not.toBeNull();
    expect(lastLineBox).not.toBeNull();
    const overlaps =
      ringBox!.x < lastLineBox!.x + lastLineBox!.width &&
      lastLineBox!.x < ringBox!.x + ringBox!.width &&
      ringBox!.y < lastLineBox!.y + lastLineBox!.height &&
      lastLineBox!.y < ringBox!.y + ringBox!.height;
    expect(overlaps, "the ring is expected to cross other zones").toBe(true);

    // A tap at the ring's own CENTRE, which is as deep inside it as a tap
    // gets, still reaches the zone underneath rather than the ring. This is
    // pointer-events: stroke doing its job: the disc is not a target.
    const centre = {
      x: ringBox!.x + ringBox!.width / 2,
      y: ringBox!.y + ringBox!.height / 2,
    };
    const under = await page.evaluate(
      ({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return {
          zoneKey: el?.getAttribute("data-zone-key") ?? null,
          isRing: el?.classList.contains("formations-ring-hit") ?? false,
        };
      },
      centre
    );
    expect(under.isRing, "the ring's interior must not be hit tested").toBe(false);

    // And the zones underneath are still individually tappable, card and
    // all, with the ring drawn across them.
    for (const key of ["midfield_box", "last_line", "first_line"]) {
      await page.locator(`[data-zone-key="${key}"]`).click();
      await expect(page.getByTestId("formations-zone-card")).toHaveCount(1);
      await expect(page.getByTestId("formations-zone-title")).not.toBeEmpty();
      // The ring's own note belongs to the ring alone.
      await expect(page.getByTestId("formations-ring-note")).toHaveCount(0);
      await page.getByTestId("formations-zone-close").click();
    }

    await assertCleanPage(page, issues);
  });

  // ------------------------------------------------------------------
  // Doc 06 section 0: six zones on ALL SIX formations, not just the 4-3-3.
  // That is the approved scope line this ticket restores, so it is checked
  // on every preset rather than on a sample.
  // ------------------------------------------------------------------
  test("every formation carries all six zones, the ring included", async ({ page, issues }) => {
    await registerCoach(page);
    await openFormations(page);

    for (const code of ["433", "4231", "442", "352", "343", "541"]) {
      await page.getByTestId("formations-sheet-handle").click();
      await expect(page.getByTestId("formations-sheet-body")).toBeVisible();
      await page.getByTestId("formations-search").fill(code);
      await page.getByTestId("formations-tile").first().click();
      await expect(page.getByTestId("formations-sheet-body")).toHaveCount(0);

      await page.getByTestId("formations-rondo-toggle").click();
      await expect(page.getByTestId("rondo-zone"), code).toHaveCount(5);
      await expect(page.getByTestId("formations-rondo-ring"), code).toHaveCount(1);
      await expect(page.getByTestId("formations-zone-chip"), code).toHaveCount(6);
      // Every one of the six carries a seeded fallback, so no formation
      // shows a blank chip where a rondo should be.
      for (const c of await page.getByTestId("formations-zone-chip").all()) {
        await expect(c).toHaveAttribute("data-source", "seeded");
        await expect(c).not.toBeEmpty();
      }
      await page.getByTestId("formations-rondo-active-toggle").click();
      await expect(page.getByTestId("formations-rondo-ring")).toHaveCount(0);
    }

    await assertCleanPage(page, issues);
  });

  // ------------------------------------------------------------------
  // Theme check (verify-ui): the ring is a themed surface, so it is drawn
  // once per theme. T-071 moved it off the chrome accent: the ring is zone
  // language drawn on the pitch, so it reads the BOARD token --zone. That
  // is the whole point of the two token layers, because the chrome accent
  // is now the brand red and a red ring would read as a warning.
  // ------------------------------------------------------------------
  test("the ring reads theme variables in all three themes", async ({ page, issues }) => {
    await registerCoach(page);
    await openFormations(page);
    await page.getByTestId("formations-rondo-toggle").click();
    await expect(page.getByTestId("formations-rondo-ring")).toBeVisible();

    const seen = new Set<string>();
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
      const accentRgb = await page.evaluate(() => {
        const el = document.createElement("div");
        el.style.color = "var(--accent)";
        document.body.appendChild(el);
        const rgb = getComputedStyle(el).color;
        el.remove();
        return rgb;
      });
      const zoneRgb = await page.evaluate(() => {
        const el = document.createElement("div");
        el.style.color = "var(--zone)";
        document.body.appendChild(el);
        const rgb = getComputedStyle(el).color;
        el.remove();
        return rgb;
      });

      const stroke = await page
        .getByTestId("formations-rondo-ring")
        .evaluate((el) => getComputedStyle(el).stroke);
      // The ring is gold zone language on the pitch: never the status red,
      // and never the chrome's interactive accent either (T-071).
      expect(stroke).toBe(zoneRgb);
      expect(stroke).not.toBe(redRgb);
      expect(stroke).not.toBe(accentRgb);
      seen.add(stroke);
    }
    // Three themes, three distinct painted values: proves the ring reads a
    // CSS variable rather than a colour baked into the component.
    expect(seen.size).toBe(3);

    await assertCleanPage(page, issues);
  });
});
