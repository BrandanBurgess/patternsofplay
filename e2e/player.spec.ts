// Animation player journey (T-022, Brief step 14). Runs under both Playwright
// projects. Covers the board-engine DoD line verbatim:
//   "Animation player runs a declarative spec and a raw recording; a pass into a
//    moving runner connects because waypoints chase the bound player."
// The raw-recording half is covered in recorder.spec.ts; here we prove the
// DECLARATIVE demo spec runs and its bound ball waypoint lands on the moving
// runner (home-2) at that runner's final position.
//
// T-030: the whiteboard is now an authenticated page; registerCoach signs in
// and lands on it. The toolbar's Play button runs this same demo spec (see
// Board.tsx's doc comment on that interpretation); Restart is a small
// secondary control shown once a playback exists, not part of the 5-icon
// PNG toolbar.

import { test, expect, assertCleanPage, registerCoach } from "./fixtures";
import type { Page, Locator } from "@playwright/test";

// The demo's overlapping fullback (home-2) finishes here (demoSpec.ts).
const RUNNER_FINAL = { x: 88, y: 6 };

async function readModel(el: Locator) {
  return {
    x: Number(await el.getAttribute("data-model-x")),
    y: Number(await el.getAttribute("data-model-y")),
  };
}

async function waitPlaybackDone(page: Page) {
  const root = page.locator(".board-root");
  await expect(root).toHaveAttribute("data-playing", "true", { timeout: 4000 });
  await expect(root).toHaveAttribute("data-playing", "false", { timeout: 15000 });
}

test("plays the declarative demo spec and connects the pass to the moving runner", async ({
  page,
  issues,
}) => {
  await registerCoach(page);

  await page.getByTestId("play-demo").click();

  // While it plays, the trace shows numbered route badges and a caption.
  await expect(page.locator("[data-badge-n]").first()).toBeVisible({ timeout: 4000 });
  await expect(page.getByTestId("anim-caption")).not.toBeEmpty();

  await waitPlaybackDone(page);

  // The runner reached its final spot, and the ball connected: same position.
  const ball = await readModel(page.locator('[data-token-side="ball"]'));
  const runner = await readModel(page.locator('[data-token-id="home-2"]'));
  expect(runner.x).toBeCloseTo(RUNNER_FINAL.x, 1);
  expect(runner.y).toBeCloseTo(RUNNER_FINAL.y, 1);
  expect(ball.x).toBeCloseTo(runner.x, 1); // pass into the moving runner connects
  expect(ball.y).toBeCloseTo(runner.y, 1);

  // Two passes leave two ordered route badges.
  await expect(page.locator("[data-badge-n]")).toHaveCount(2);

  await assertCleanPage(page, issues);
});

test("restart replays the spec from the top", async ({ page, issues }) => {
  await registerCoach(page);
  await page.getByTestId("play-demo").click();
  await waitPlaybackDone(page);

  await page.getByTestId("restart").click();
  await waitPlaybackDone(page);

  const ball = await readModel(page.locator('[data-token-side="ball"]'));
  expect(ball.x).toBeCloseTo(RUNNER_FINAL.x, 1);
  expect(ball.y).toBeCloseTo(RUNNER_FINAL.y, 1);

  await assertCleanPage(page, issues);
});
