// Cross-device round trip (T-050, Brief section 5 Phone DoD): "All board
// surfaces render portrait per the mapping; a pattern saved on desktop
// replays correctly on phone and vice versa."
//
// e2e/recorder.spec.ts already proves the coordinate mapping survives an
// orientation flip inside ONE page (resize across the breakpoint). This
// proves the whole round trip across TWO DEVICES: a coach records on a
// 1440x900 browser, and the same coach, signed in on a separate iPhone 13
// browser, replays it from the server and every token lands on the same
// stored model coordinates, rendered through the portrait mapping.
//
// It runs once (under the desktop project only) because it drives both
// viewports itself; running it again under the mobile project would just
// swap which context is created first.

import { test, expect, assertCleanPage, registerCoach, signIn, watchPage } from "./fixtures";
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

function parseTranslate(transform: string) {
  const m = /translate\(([-\d.]+)\s+([-\d.]+)\)/.exec(transform)!;
  return { px: Number(m[1]), py: Number(m[2]) };
}

async function readModel(page: Page, id: string): Promise<Model> {
  const el = page.locator(`[data-token-id="${id}"]`);
  return {
    x: Number(await el.getAttribute("data-model-x")),
    y: Number(await el.getAttribute("data-model-y")),
  };
}

/** Drags a token to a model coordinate on whichever orientation the page
 * is currently rendering (the mapping is render-only, so the target pixel
 * differs per device while the stored model coordinate does not). */
async function dragTokenTo(page: Page, id: string, m: Model) {
  const orientation = (await page
    .locator(".board-wrap")
    .getAttribute("data-orientation")) as Orientation;
  const box = (await page.getByTestId("board").boundingBox())!;
  const vb = VB[orientation];
  const target = expectedPixel(m, orientation);
  const tokenBox = (await page.locator(`[data-token-id="${id}"]`).boundingBox())!;
  await page.mouse.move(tokenBox.x + tokenBox.width / 2, tokenBox.y + tokenBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + (target.px / vb.width) * box.width,
    box.y + (target.py / vb.height) * box.height,
    { steps: 12 }
  );
  await page.mouse.up();
}

test.describe("cross-device: record on desktop, replay on a phone", () => {
  test("token positions round-trip through the server, rendered portrait", async ({
    browser,
    page,
    issues,
    viewport,
  }) => {
    test.skip((viewport?.width ?? 1440) <= 700, "this journey drives both viewports itself");

    // --- Device 1: the coach's laptop --------------------------------------
    const { email } = await registerCoach(page, { teamName: "Cross Device FC" });
    await expect(page.locator(".board-wrap")).toHaveAttribute("data-orientation", "landscape");

    await page.getByTestId("record").click();
    await dragTokenTo(page, "home-2", { x: 46, y: 14 });
    await dragTokenTo(page, "home-7", { x: 74, y: 22 });
    await dragTokenTo(page, "ball", { x: 46, y: 14 });
    const recorded = {
      "home-2": await readModel(page, "home-2"),
      "home-7": await readModel(page, "home-7"),
      ball: await readModel(page, "ball"),
    };
    await page.getByTestId("stop-record").click();
    await page.getByTestId("record-name").fill("Wide overload, right");
    await page.getByTestId("save-pattern").click();
    await expect(
      page.getByTestId("saved-pattern").filter({ hasText: "Wide overload, right" })
    ).toHaveCount(1);

    // --- Device 2: the same coach's phone -----------------------------------
    const phoneContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const phone = await phoneContext.newPage();
    watchPage(phone, issues);
    await signIn(phone, email);
    await expect(phone.locator(".board-wrap")).toHaveAttribute("data-orientation", "portrait");

    const savedOnPhone = phone
      .getByTestId("saved-pattern")
      .filter({ hasText: "Wide overload, right" });
    await expect(savedOnPhone).toHaveCount(1);
    await savedOnPhone.getByRole("button", { name: "Replay" }).click();
    await expect(phone.locator(".board-root")).toHaveAttribute("data-playing", "false", {
      timeout: 20000,
    });

    for (const [id, want] of Object.entries(recorded)) {
      const got = await readModel(phone, id);
      // Model coordinates are device-independent (CLAUDE.md rule 8).
      expect(got.x, `${id} model x`).toBeCloseTo(want.x, 0);
      expect(got.y, `${id} model y`).toBeCloseTo(want.y, 0);

      // And the phone RENDERS them through the portrait mapping
      // (left = y, top = 100 - x), which is the half of the contract a
      // model-coordinate check alone would not catch.
      const expected = expectedPixel(got, "portrait");
      const drawn = parseTranslate(
        (await phone.locator(`[data-token-id="${id}"]`).getAttribute("transform"))!
      );
      expect(drawn.px, `${id} rendered px`).toBeCloseTo(expected.px, 0);
      expect(drawn.py, `${id} rendered py`).toBeCloseTo(expected.py, 0);
    }

    await assertCleanPage(phone, issues);
    await assertCleanPage(page, issues);
    await phoneContext.close();
  });
});
