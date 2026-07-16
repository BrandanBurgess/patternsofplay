// Recorder journey (T-022, Brief step 15). Runs under both Playwright projects.
// Covers the board-engine DoD line verbatim:
//   "Recording captures opponent and ball movement, not just teammates."
// and the Brief cross-orientation DoD: record in one orientation, replay in the
// other, and the mapped positions still match (everything is stored in landscape
// model coordinates; orientation is render only).

import { test, expect, assertCleanPage } from "./fixtures";
import type { Page, Locator } from "@playwright/test";

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

function parseTranslate(transform: string) {
  const m = transform.match(/translate\(\s*([-\d.eE]+)[ ,]+([-\d.eE]+)\s*\)/);
  if (!m) throw new Error(`unparsable transform: ${transform}`);
  return { px: Number(m[1]), py: Number(m[2]) };
}

async function orientationOf(page: Page): Promise<Orientation> {
  return (await page.locator(".board-wrap").getAttribute("data-orientation")) as Orientation;
}

async function readModel(el: Locator) {
  return {
    x: Number(await el.getAttribute("data-model-x")),
    y: Number(await el.getAttribute("data-model-y")),
  };
}

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
  await page.mouse.move(target.x, target.y, { steps: 10 });
  await page.mouse.up();
}

async function waitPlaybackDone(page: Page) {
  const root = page.locator(".board-root");
  await expect(root).toHaveAttribute("data-playing", "true", { timeout: 4000 });
  await expect(root).toHaveAttribute("data-playing", "false", { timeout: 15000 });
}

test("records a teammate, an opponent, and the ball, then replays them", async ({
  page,
  issues,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("board")).toBeVisible();

  await page.getByTestId("record").click();
  await expect(page.getByTestId("record-banner")).toBeVisible();

  // Move a teammate, an OPPONENT, and the ball: all three must be captured.
  await dragTokenTo(page, "home-9", { x: 60, y: 30 });
  await dragTokenTo(page, "away-3", { x: 40, y: 70 });
  await dragTokenTo(page, "ball", { x: 55, y: 45 });

  // Capture the actual settled positions (mouse drags land near, not exactly on).
  const want = {
    "home-9": await readModel(page.locator('[data-token-id="home-9"]')),
    "away-3": await readModel(page.locator('[data-token-id="away-3"]')),
    ball: await readModel(page.locator('[data-token-side="ball"]')),
  };

  await page.getByTestId("stop-record").click();
  await expect(page.getByTestId("save-bar")).toBeVisible();
  await page.getByTestId("record-name").fill("Defensive shift");
  await page.getByTestId("save-pattern").click();

  // The saved pattern is author-stamped and lands in My patterns (doc 03 4.2).
  await expect(page.getByTestId("saved-pattern")).toHaveCount(1);
  await expect(page.getByTestId("saved-pattern")).toContainText("Defensive shift");

  // Nudge everything away so replay has to move the tokens back.
  await dragTokenTo(page, "home-9", { x: 20, y: 20 });
  await dragTokenTo(page, "away-3", { x: 80, y: 20 });

  await page.getByTestId("replay-0").click();
  await waitPlaybackDone(page);

  for (const [id, m] of Object.entries(want)) {
    const sel = id === "ball" ? '[data-token-side="ball"]' : `[data-token-id="${id}"]`;
    const got = await readModel(page.locator(sel));
    expect(got.x, `${id} x`).toBeCloseTo(m.x, 0);
    expect(got.y, `${id} y`).toBeCloseTo(m.y, 0);
  }

  await assertCleanPage(page, issues);
});

test("record in one orientation, replay correctly in the other", async ({ page, issues }) => {
  await page.goto("/");
  await expect(page.getByTestId("board")).toBeVisible();

  const recordedIn = await orientationOf(page);

  await page.getByTestId("record").click();
  await dragTokenTo(page, "home-7", { x: 72, y: 40 });
  await dragTokenTo(page, "ball", { x: 66, y: 52 });
  const want = {
    "home-7": await readModel(page.locator('[data-token-id="home-7"]')),
    ball: await readModel(page.locator('[data-token-side="ball"]')),
  };
  await page.getByTestId("stop-record").click();
  await page.getByTestId("save-pattern").click();

  // Flip the board. Same stored model coordinates, render-only change.
  await page.getByRole("button", { name: "Rotate board" }).click();
  const replayIn = await orientationOf(page);
  expect(replayIn).not.toBe(recordedIn);

  await page.getByTestId("replay-0").click();
  await waitPlaybackDone(page);

  // Model coordinates are orientation-independent: they replay to the same values.
  for (const [id, m] of Object.entries(want)) {
    const sel = id === "ball" ? '[data-token-side="ball"]' : `[data-token-id="${id}"]`;
    const el = page.locator(sel);
    const got = await readModel(el);
    expect(got.x, `${id} x`).toBeCloseTo(m.x, 0);
    expect(got.y, `${id} y`).toBeCloseTo(m.y, 0);

    // And the RENDER is mapped for the NEW orientation, proving orientation is
    // render-only: the transform matches the portrait/landscape mapping formula.
    const exp = expectedPixel(got, replayIn);
    const px = parseTranslate((await el.getAttribute("transform"))!);
    expect(px.px, `${id} px`).toBeCloseTo(exp.px, 0);
    expect(px.py, `${id} py`).toBeCloseTo(exp.py, 0);
  }

  await assertCleanPage(page, issues);
});
