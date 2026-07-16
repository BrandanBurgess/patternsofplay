// Lane graph + marking journey (T-021). Runs under both Playwright projects:
// desktop (landscape default) and iPhone 13 (portrait default), proving the lane
// math is orientation-independent (all logic in landscape model space).
//
// Covers the board-engine DoD line verbatim: "Lanes recompute live during drags;
// confirmed lanes persist; blocked-lane dot sits on the interception point; the
// two thresholds adjust independently."

import { test, expect, assertCleanPage } from "./fixtures";
import type { Locator, Page } from "@playwright/test";

const VB = {
  landscape: { width: 1050, height: 680 },
  portrait: { width: 700, height: 1000 },
} as const;

type Orientation = keyof typeof VB;
interface Model {
  x: number;
  y: number;
}

// Confirmed pair we drive throughout. pairKey sorts lexically: "home-2" < "home-9".
const LANE_KEY = "home-2|home-9";

function expectedPixel(m: Model, o: Orientation) {
  const vb = VB[o];
  return o === "portrait"
    ? { px: (m.y / 100) * vb.width, py: ((100 - m.x) / 100) * vb.height }
    : { px: (m.x / 100) * vb.width, py: (m.y / 100) * vb.height };
}

async function orientationOf(page: Page): Promise<Orientation> {
  return (await page.locator(".board-wrap").getAttribute("data-orientation")) as Orientation;
}

// Convert a landscape model point to on-screen client coordinates. The SVG has
// no internal letterboxing (its element box matches the viewBox aspect), so the
// mapping is a straight linear scale of the board's bounding box.
async function modelToClient(page: Page, m: Model) {
  const o = await orientationOf(page);
  const box = (await page.getByTestId("board").boundingBox())!;
  const vb = VB[o];
  const p = expectedPixel(m, o);
  return { x: box.x + (p.px / vb.width) * box.width, y: box.y + (p.py / vb.height) * box.height };
}

async function dragTokenTo(page: Page, id: string, m: Model) {
  const b = (await page.locator(`[data-token-id="${id}"]`).boundingBox())!;
  const start = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const target = await modelToClient(page, m);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.mouse.up();
}

// Set a range slider the way React expects (native value setter + input event),
// so onChange fires and the overlay recomputes.
async function setThreshold(page: Page, testid: string, value: number) {
  await page.getByTestId(testid).evaluate((el, v) => {
    const input = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )!.set!;
    setter.call(input, String(v));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

function lane(page: Page): Locator {
  return page.locator(`[data-lane-key="${LANE_KEY}"]`);
}
function dot(page: Page): Locator {
  return page.locator(`[data-lane-dot="${LANE_KEY}"]`);
}
function ring(page: Page, tokenId: string): Locator {
  return page.locator(`[data-mark-token="${tokenId}"]`);
}

test("confirm a lane, block it, and adjust both thresholds independently", async ({
  page,
  issues,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("board")).toBeVisible();

  // Lay a clean horizontal lane near the top touchline (y = 8), a region clear of
  // opponents, so the confirmed lane starts unblocked.
  await dragTokenTo(page, "home-2", { x: 30, y: 8 });
  await dragTokenTo(page, "home-9", { x: 70, y: 8 });

  // Confirm the lane: click two teammates. It persists and renders solid gold.
  await page.locator('[data-token-id="home-2"]').click();
  await page.locator('[data-token-id="home-9"]').click();
  await expect(lane(page)).toHaveAttribute("data-lane-status", "confirmed");
  await expect(lane(page)).toHaveAttribute("data-blocked", "false");
  await expect(dot(page)).toHaveCount(0);

  // Block it: drag a defender onto the pass line, 6 model units below the middle.
  await dragTokenTo(page, "away-11", { x: 50, y: 14 });
  await expect(lane(page)).toHaveAttribute("data-blocked", "true");
  await expect(lane(page)).toHaveAttribute("data-lane-status", "blocked");

  // The interception dot sits on the closest point of the segment: (50, 8).
  await expect(dot(page)).toHaveCount(1);
  const expectDot = expectedPixel({ x: 50, y: 8 }, await orientationOf(page));
  expect(Number(await dot(page).getAttribute("cx"))).toBeCloseTo(expectDot.px, 0);
  expect(Number(await dot(page).getAttribute("cy"))).toBeCloseTo(expectDot.py, 0);

  // --- Blocking threshold responds only to the blocking slider ---
  await setThreshold(page, "blocking-threshold", 4); // 6 > 4: no longer blocked
  await expect(lane(page)).toHaveAttribute("data-blocked", "false");
  await expect(dot(page)).toHaveCount(0);
  await setThreshold(page, "blocking-threshold", 8); // 6 <= 8: blocked again
  await expect(lane(page)).toHaveAttribute("data-blocked", "true");
  await expect(dot(page)).toHaveCount(1);

  // No marking yet on home-9.
  await expect(ring(page, "home-9")).toHaveCount(0);

  // Mark home-9: a defender 6 model units away (loose ring, tight band is 5).
  await dragTokenTo(page, "away-9", { x: 76, y: 8 });
  await expect(ring(page, "home-9")).toHaveCount(1);
  await expect(ring(page, "home-9")).toHaveAttribute("data-mark-level", "loose");

  // --- Independence, both directions ---
  // Changing the BLOCKING threshold must not disturb the marking ring.
  await setThreshold(page, "blocking-threshold", 20);
  await expect(ring(page, "home-9")).toHaveCount(1);
  await expect(ring(page, "home-9")).toHaveAttribute("data-mark-level", "loose");

  // Changing the MARKING threshold removes the ring but must not disturb blocking.
  await setThreshold(page, "marking-threshold", 4); // 6 > 4: ring clears
  await expect(ring(page, "home-9")).toHaveCount(0);
  await expect(lane(page)).toHaveAttribute("data-blocked", "true"); // lane untouched

  await assertCleanPage(page, issues);
});
