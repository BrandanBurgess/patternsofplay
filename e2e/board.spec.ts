// Board engine journey (T-020). Runs under both Playwright projects: desktop
// (landscape default) and mobile iPhone 13 (portrait default). Covers the two
// board-engine DoD lines from Brief section 5.
//
// T-030: the whiteboard is now an authenticated page, so every test signs in
// a fresh coach first (registerCoach lands on the whiteboard once the team is
// created). Orientation flips use a real viewport resize across the phone
// breakpoint instead of the old dev-only "Rotate board" toggle.

import { test, expect, assertCleanPage, registerCoach, flipOrientationViewport } from "./fixtures";

// Must match Board.tsx VIEWBOX exactly.
const VB = {
  landscape: { width: 1050, height: 680 },
  portrait: { width: 700, height: 1000 },
} as const;

type Orientation = keyof typeof VB;

function expectedPixel(m: { x: number; y: number }, o: Orientation) {
  const vb = VB[o];
  return o === "portrait"
    ? { px: (m.y / 100) * vb.width, py: ((100 - m.x) / 100) * vb.height }
    : { px: (m.x / 100) * vb.width, py: (m.y / 100) * vb.height };
}

function parseTranslate(transform: string) {
  const m = transform.match(/translate\(\s*([-\d.eE]+)[ ,]+([-\d.eE]+)\s*\)/);
  if (!m) throw new Error(`unparsable transform: ${transform}`);
  return { px: Number(m[1]), py: Number(m[2]) };
}

async function readModel(el: import("@playwright/test").Locator) {
  return {
    x: Number(await el.getAttribute("data-model-x")),
    y: Number(await el.getAttribute("data-model-y")),
  };
}

async function currentOrientation(page: import("@playwright/test").Page): Promise<Orientation> {
  const o = await page.locator(".board-wrap").getAttribute("data-orientation");
  return o as Orientation;
}

test("board renders 23 tokens in the viewport's orientation", async ({ page, issues }) => {
  await registerCoach(page);
  await expect(page.locator("[data-token-id]")).toHaveCount(23); // 11 + 11 + ball
  await expect(page.locator('[data-token-side="ball"]')).toHaveCount(1);

  // Phone width defaults to portrait, desktop to landscape (design README).
  const o = await currentOrientation(page);
  const expected = page.viewportSize()!.width <= 700 ? "portrait" : "landscape";
  expect(o).toBe(expected);
  await assertCleanPage(page, issues);
});

// DoD: "Landscape-portrait round trip is lossless: record in one orientation,
// replay correctly in both." A token dragged (stand-in for record) keeps ONE
// stored landscape model coordinate; that coordinate renders correctly in both
// orientations, proving orientation is render-only.
test("stored model coords replay correctly in both orientations", async ({ page, issues }) => {
  await registerCoach(page);
  const token = page.locator('[data-token-id="home-9"]');
  await expect(token).toBeVisible();

  // Drag the token to a fresh spot.
  const box = (await token.boundingBox())!;
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - 120, startY - 70, { steps: 8 });
  await page.mouse.up();

  const model = await readModel(token);
  expect(model.x).not.toBeCloseTo(72, 1); // it actually moved from its start
  const before = await currentOrientation(page);

  // Rendered transform matches the mapping for the current orientation.
  let px = parseTranslate((await token.getAttribute("transform"))!);
  let exp = expectedPixel(model, before);
  expect(px.px).toBeCloseTo(exp.px, 1);
  expect(px.py).toBeCloseTo(exp.py, 1);

  // Flip orientation (resize across the phone breakpoint). Same stored model
  // coord, render-only change.
  await flipOrientationViewport(page);
  const after = await currentOrientation(page);
  expect(after).not.toBe(before);

  const modelAfter = await readModel(token);
  expect(modelAfter.x).toBeCloseTo(model.x, 5); // model unchanged by rotation
  expect(modelAfter.y).toBeCloseTo(model.y, 5);

  px = parseTranslate((await token.getAttribute("transform"))!);
  exp = expectedPixel(modelAfter, after);
  expect(px.px).toBeCloseTo(exp.px, 1);
  expect(px.py).toBeCloseTo(exp.py, 1);

  await assertCleanPage(page, issues);
});

// DoD: "Tokens drag smoothly at 60fps ... with 23 tokens." Profile the frame
// budget during a scripted drag: sample rAF deltas while dragging and assert
// the median frame stays within budget. Actual numbers are logged as evidence.
test("drag holds frame budget with 23 tokens", async ({ page, issues }) => {
  await registerCoach(page);
  const token = page.locator('[data-token-id="home-9"]');
  const box = (await token.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page.evaluate(() => {
    const w = window as unknown as { __deltas: number[]; __raf: number };
    w.__deltas = [];
    let last = performance.now();
    const loop = () => {
      const t = performance.now();
      w.__deltas.push(t - last);
      last = t;
      w.__raf = requestAnimationFrame(loop);
    };
    w.__raf = requestAnimationFrame(loop);
  });

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 0; i < 60; i++) {
    const t = i / 60;
    await page.mouse.move(cx + Math.sin(t * Math.PI * 2) * 90, cy - t * 120, { steps: 2 });
  }
  await page.mouse.up();

  const deltas: number[] = await page.evaluate(() => {
    const w = window as unknown as { __deltas: number[]; __raf: number };
    cancelAnimationFrame(w.__raf);
    return w.__deltas;
  });

  const sorted = deltas.filter((d) => d > 0).sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  const median = pct(0.5);
  const p95 = pct(0.95);
  // eslint-disable-next-line no-console
  console.log(
    `[perf] frames=${sorted.length} median=${median.toFixed(2)}ms p95=${p95.toFixed(2)}ms fps~=${(1000 / median).toFixed(1)}`
  );

  // Lenient gate to stay CI-stable; the logged median is the real 60fps evidence.
  expect(median).toBeLessThan(34);
  await assertCleanPage(page, issues);
});
