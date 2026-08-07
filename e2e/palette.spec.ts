// Brand palette journey (T-071). Runs under both Playwright projects
// (iPhone 13 portrait, desktop 1440x900) per playwright.config.ts, so every
// assertion below is made twice, once per viewport, with the board rendering
// portrait on the phone.
//
// Covers the Screens DoD line (Brief section 5) as amended by the founder
// palette directive of 2026-08-07:
//   "Each page matches its PNGs across the three themes on desktop and phone
//    frames; gold is the only interactive color; red never appears as a call
//    to action."
// The directive supersedes the second half of that line: the brand red is now
// the ONLY interactive colour, shield gold (--warn) carries advisories and
// read-only status, and the status red never fills a control. What survives
// unchanged is the pitch: green turf, gold "the pass is on", red "blocked".
//
// And it covers the invariant the whole ticket exists for: changing --accent
// must not be able to change what the pitch or a lane looks like. Test one
// proves that in a real browser by overriding the chrome accent at runtime.
// frontend/src/styles/tokens.test.ts proves the same split statically.

import { test, expect, assertCleanPage, registerCoach, registerPlayer } from "./fixtures";
import type { Locator, Page } from "@playwright/test";

const THEMES = ["pitch", "dark", "board"] as const;

const VB = {
  landscape: { width: 1050, height: 680 },
  portrait: { width: 700, height: 1000 },
} as const;
type Orientation = keyof typeof VB;

const LANE_KEY = "home-2|home-9";

/** Resolves a CSS custom property to the rgb() string the browser paints. */
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

function parseRgb(value: string): [number, number, number] {
  const m = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  expect(m, `not an rgb value: ${value}`).not.toBeNull();
  return [Number(m![1]), Number(m![2]), Number(m![3])];
}

// Phone emulation shrinks the visual viewport after any input focus and never
// restores it, so point-based clicks can land on the wrong element (see the
// same note in e2e/roster.spec.ts). Dispatching targets the element directly.
async function robustClick(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  await locator.dispatchEvent("click");
}

async function orientationOf(page: Page): Promise<Orientation> {
  return (await page.locator(".board-wrap").getAttribute("data-orientation")) as Orientation;
}

async function modelToClient(page: Page, m: { x: number; y: number }) {
  const o = await orientationOf(page);
  const box = (await page.getByTestId("board").boundingBox())!;
  const vb = VB[o];
  const p =
    o === "portrait"
      ? { px: (m.y / 100) * vb.width, py: ((100 - m.x) / 100) * vb.height }
      : { px: (m.x / 100) * vb.width, py: (m.y / 100) * vb.height };
  return { x: box.x + (p.px / vb.width) * box.width, y: box.y + (p.py / vb.height) * box.height };
}

async function dragTokenTo(page: Page, id: string, m: { x: number; y: number }) {
  const b = (await page.locator(`[data-token-id="${id}"]`).boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  const target = await modelToClient(page, m);
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.mouse.up();
}

/** Everything on the pitch whose colour carries a football meaning. */
async function readPitch(page: Page) {
  return {
    turf: await page
      .locator(".board-wrap")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    home: await page
      .locator('[data-token-id="home-2"] .token-face')
      .evaluate((el) => getComputedStyle(el).stroke),
    away: await page
      .locator('[data-token-id="away-11"] .token-face')
      .evaluate((el) => getComputedStyle(el).stroke),
    lane: await page
      .locator(`[data-lane-key="${LANE_KEY}"]`)
      .evaluate((el) => getComputedStyle(el).stroke),
  };
}

test("the pitch, the teams and the lanes never read the chrome accent", async ({
  page,
  issues,
}) => {
  await registerCoach(page);

  // A clean horizontal lane near the top touchline, clear of opponents, then
  // confirm it by clicking the two teammates (same setup as e2e/lanes.spec).
  await dragTokenTo(page, "home-2", { x: 30, y: 8 });
  await dragTokenTo(page, "home-9", { x: 70, y: 8 });
  await page.locator('[data-token-id="home-2"]').click();
  await page.locator('[data-token-id="home-9"]').click();
  const lane = page.locator(`[data-lane-key="${LANE_KEY}"]`);
  await expect(lane).toHaveAttribute("data-lane-status", "confirmed");

  for (const theme of THEMES) {
    await robustClick(page.getByTestId(`theme-switch-${theme}`));
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

    // DoD: "Each page matches its PNGs across the three themes." The pitch
    // is a pitch in every theme: the turf is a green, not a chrome colour.
    const before = await readPitch(page);
    const [r, g, b] = parseRgb(before.turf);
    expect(g, `${theme}: turf must be green, got ${before.turf}`).toBeGreaterThan(r);
    expect(g, `${theme}: turf must be green, got ${before.turf}`).toBeGreaterThan(b);

    // Home and away cannot collapse into one colour, whatever the brand is.
    expect(before.home, `${theme}: home and away collide`).not.toBe(before.away);

    // A confirmed lane ("the pass is on") is not the away/blocked red.
    expect(before.lane, `${theme}: confirmed lane looks like the opposition`).not.toBe(
      before.away
    );

    // THE INVARIANT. Force the chrome's red family to an unmistakable green
    // at the document root, which beats every theme declaration. If any
    // football colour is still wired to the chrome, it moves. Nothing may.
    await page.evaluate(() => {
      const s = document.documentElement.style;
      s.setProperty("--accent", "rgb(0, 255, 0)");
      s.setProperty("--glow", "rgb(0, 255, 0)");
      s.setProperty("--red", "rgb(0, 255, 0)");
      s.setProperty("--accent-ink", "rgb(0, 255, 0)");
    });

    // The override really is live: chrome inside the board panel moved.
    await expect(page.getByTestId("select-tool")).toHaveCSS(
      "background-color",
      "rgb(0, 255, 0)"
    );

    const after = await readPitch(page);
    expect(after.turf, `${theme}: the accent repainted the turf`).toBe(before.turf);
    expect(after.home, `${theme}: the accent repainted the home team`).toBe(before.home);
    expect(after.away, `${theme}: the accent repainted the away team`).toBe(before.away);
    expect(after.lane, `${theme}: the accent repainted a confirmed lane`).toBe(before.lane);

    await page.evaluate(() => {
      const s = document.documentElement.style;
      for (const p of ["--accent", "--glow", "--red", "--accent-ink"]) s.removeProperty(p);
    });
  }

  // A blocked lane is not a confirmed lane. This is the pair a red brand
  // accent would have collapsed: "this pass is on" and "this pass is blocked".
  const confirmed = await lane.evaluate((el) => getComputedStyle(el).stroke);
  await dragTokenTo(page, "away-11", { x: 50, y: 14 });
  await expect(lane).toHaveAttribute("data-lane-status", "blocked");
  const blocked = await lane.evaluate((el) => getComputedStyle(el).stroke);
  expect(blocked, "confirmed and blocked lanes are the same colour").not.toBe(confirmed);
  const interceptDot = page.locator(`[data-lane-dot="${LANE_KEY}"]`);
  await expect(interceptDot).toHaveCount(1);
  expect(await interceptDot.evaluate((el) => getComputedStyle(el).fill)).toBe(blocked);

  await assertCleanPage(page, issues);
});

test("brand red is the only interactive fill and advisories stay gold", async ({
  page,
  issues,
}) => {
  const { joinCode } = await registerCoach(page);

  // Two players that trigger the coach-only double-exposure fit warning: a
  // High-AWR right fullback behind a High-AWR right winger (Brief section 5,
  // Screens, Roster line).
  await robustClick(page.getByTestId("nav-roster"));
  await expect(page.getByRole("heading", { name: "Roster" })).toBeVisible();
  for (const p of [
    { name: "Maya K.", jersey: "7", role: "inside_forward", dwr: "low" },
    { name: "Jordan T.", jersey: "2", role: "overlapping_fb", dwr: "med" },
  ]) {
    await robustClick(page.getByTestId("roster-add-player"));
    await page.getByTestId("player-name").fill(p.name);
    await page.getByTestId("player-jersey").fill(p.jersey);
    await page.getByTestId("player-role").selectOption(p.role);
    await page.getByTestId("player-flank").selectOption("right");
    await page.getByTestId("player-awr").selectOption("high");
    await page.getByTestId("player-dwr").selectOption(p.dwr);
    await robustClick(page.getByTestId("player-save"));
    await expect(page.getByTestId("player-save")).toHaveCount(0);
  }
  const warning = page.getByTestId("fit-warning-right");
  await expect(warning).toBeVisible();

  const seenAccent = new Set<string>();
  const seenWarn = new Set<string>();

  for (const theme of THEMES) {
    await robustClick(page.getByTestId(`theme-switch-${theme}`));
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

    const accent = await toRgb(page, "--accent");
    const warn = await toRgb(page, "--warn");
    const red = await toRgb(page, "--red");
    seenAccent.add(accent);
    seenWarn.add(warn);

    // The three chrome families are three different colours. The whole point
    // of the split: an action, an advisory, and a failure never look alike.
    expect(accent, `${theme}: accent and status red are the same colour`).not.toBe(red);
    expect(accent, `${theme}: accent and warn are the same colour`).not.toBe(warn);

    // DoD: an advisory is never a call to action. The coach-only fit warning
    // wears shield gold, never the interactive brand red.
    const warningBorder = await warning.evaluate((el) => getComputedStyle(el).borderTopColor);
    expect(warningBorder, `${theme}: fit warning is not gold`).toBe(warn);
    expect(warningBorder, `${theme}: fit warning looks like a button`).not.toBe(accent);

    // DoD: the interactive colour is the brand red, and it is a FILL.
    const addBg = await page
      .getByTestId("roster-add-player")
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(addBg, `${theme}: the primary button is not the accent`).toBe(accent);
    expect(addBg, `${theme}: the primary button wears the status red`).not.toBe(red);
    expect(addBg, `${theme}: the primary button wears the advisory gold`).not.toBe(warn);
  }

  // Every theme painted its own value: proves these read the CSS variables
  // rather than a colour baked into a component.
  expect(seenAccent.size).toBe(3);
  expect(seenWarn.size).toBe(3);

  await assertCleanPage(page, issues);

  // DoD (README roles table): fit warnings are coach-only. They are ABSENT
  // from a player's DOM, not merely restyled by this ticket's palette work.
  const playerContext = await page.context().browser()!.newContext({
    viewport: page.viewportSize() ?? undefined,
  });
  const playerPage = await playerContext.newPage();
  await registerPlayer(playerPage, joinCode);
  await robustClick(playerPage.getByTestId("nav-roster"));
  await expect(playerPage.getByRole("heading", { name: "Roster" })).toBeVisible();
  await expect(playerPage.getByTestId("fit-warning-right")).toHaveCount(0);
  await expect(playerPage.locator(".fit-warning")).toHaveCount(0);
  await playerContext.close();
});
