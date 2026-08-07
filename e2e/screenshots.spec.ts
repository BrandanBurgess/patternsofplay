// Screenshot capture for docs/screenshots/ and the README.
//
// This is a CAPTURE SCRIPT, not a test. It asserts almost nothing: it
// drives the real UI against the `make demo` database and writes PNGs.
// Because it lives in the Playwright testDir alongside the real journeys,
// it skips unless POP_SCREENSHOTS=1, so `make e2e` and `make verify` never
// run it and never rewrite the images. Run it with `make screenshots`,
// which reseeds the demo database first.
//
// Credentials and content come from scripts/seed_demo.py; if that file's
// constants change, change them here too.
//
// Theme: the "pitch" theme (deep pitch green, mown stripes, trophy gold)
// rather than "dark". Every shot here is a football board, and the flat
// grey dark theme with its blue accent reads as a generic dashboard
// instead of a pitch. The three themes all ship and all work; this is a
// marketing choice about which one sells the product at a glance.
//
// Timing: animated surfaces are captured MID-motion, not at frame zero.
// Playback runs at a known duration per surface, so each capture waits a
// beat into the run rather than screenshotting the first frame.

import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

const OUT = "docs/screenshots";
const COACH_EMAIL = "coach@example.com";
const PLAYER_EMAIL = "player@example.com";
const PASSWORD = "demo-pass-2026";
const SESSION_TITLE = "Tuesday, wide overloads";

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

test.describe.configure({ mode: "serial" });

test.beforeEach(() => {
  test.skip(
    process.env.POP_SCREENSHOTS !== "1",
    "capture script, not a test: run `make screenshots`"
  );
});

async function signInDemo(page: Page, email: string) {
  await page.goto("/");
  await page.getByRole("button", { name: /Already have an account/ }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByTestId("board")).toBeVisible();
  // Pitch theme, and give the self-hosted fonts a moment to paint.
  await page.getByTestId("theme-switch-pitch").click();
  await page.evaluate(() => document.fonts.ready);
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

async function tokenCenter(page: Page, id: string) {
  const box = (await page.locator(`[data-token-id="${id}"]`).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Landscape model coordinate to a client point on the rendered board, so
 * these captures can place a token exactly where the shot needs it rather
 * than nudging by guessed pixel offsets. */
async function modelToClient(page: Page, m: { x: number; y: number }) {
  const box = (await page.getByTestId("board").boundingBox())!;
  return { x: box.x + (m.x / 100) * box.width, y: box.y + (m.y / 100) * box.height };
}

async function dragTo(page: Page, id: string, m: { x: number; y: number }) {
  const from = await tokenCenter(page, id);
  const to = await modelToClient(page, m);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 14 });
  await page.mouse.up();
}

test("captures the desktop set", async ({ browser }) => {
  const context = await browser.newContext({ viewport: DESKTOP });
  const page = await context.newPage();
  await signInDemo(page, COACH_EMAIL);

  // --- 01: the whiteboard with the lane graph live, mid-drag -------------
  // The three lane states have to read together in one frame:
  //   confirmed (solid bright gold): the demo seed ships home-4 to home-5,
  //     and this shot leaves that line clear so it stays gold.
  //   blocked (dashed red plus the red interception dot): one opponent is
  //     parked on the home-2 to home-8 line, and only that line.
  //   suggested (dashed dim gold): everything else in range.
  // An opponent dropped in the middle of the pitch blocks nearly every line
  // at once and the whole board goes red, which is the opposite of the
  // point, so this places it precisely rather than by pixel nudge.
  await dragTo(page, "away-8", { x: 32, y: 23 });
  await expect(page.getByTestId("board-save-status")).toHaveText("All changes saved");

  // Now hold a second drag mid-flight, so the graph is visibly recomputing
  // rather than settled.
  const winger = await tokenCenter(page, "home-7");
  const target = await modelToClient(page, { x: 60, y: 26 });
  await page.mouse.move(winger.x, winger.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 16 });
  await page.waitForTimeout(120);
  await shot(page, "01-whiteboard-lanes");
  await page.mouse.up();

  // --- 02: the recording UI with the ball's gold trace visible ------------
  await page.getByTestId("record").click();
  await expect(page.getByTestId("record-banner")).toBeVisible();
  // A build-out: the centre-back steps out, the fullback goes high, and the
  // ball travels keeper to centre-back to fullback, laying a gold trace
  // behind it (design README, PNG 03).
  await dragTo(page, "home-5", { x: 30, y: 34 });
  await dragTo(page, "home-2", { x: 46, y: 12 });
  const ball = await tokenCenter(page, "ball");
  const via = await modelToClient(page, { x: 30, y: 34 });
  const end = await modelToClient(page, { x: 46, y: 12 });
  await page.mouse.move(ball.x, ball.y);
  await page.mouse.down();
  await page.mouse.move(via.x, via.y, { steps: 18 });
  await page.mouse.move(end.x, end.y, { steps: 18 });
  await page.waitForTimeout(120);
  await shot(page, "02-whiteboard-recording");
  await page.mouse.up();
  await page.getByTestId("stop-record").click();
  await page.getByRole("button", { name: "Discard" }).click();

  // --- 03: the Patterns library sheet, chips and search ------------------
  await page.getByTestId("nav-patterns").click();
  await page.getByTestId("patterns-sheet-handle").click();
  await expect(page.getByTestId("patterns-sheet-body")).toBeVisible();
  await page.getByTestId("patterns-chip-combination").click();
  await page.waitForTimeout(150);
  await shot(page, "03-patterns-library-sheet");

  // --- 04: a pattern mid-playback ----------------------------------------
  await page.getByTestId("patterns-chip-all").click();
  await page.getByTestId("patterns-search").fill("third man");
  await page.getByTestId("patterns-tile").first().click();
  await expect(page.getByTestId("patterns-playing-pill")).toBeVisible();
  // A5 runs three declarative steps at 900ms each: land in the middle of
  // the second, where the ball is in flight and the trail has built up.
  await page.waitForTimeout(1400);
  await shot(page, "04-pattern-playing");

  // --- 05: Formations, 4-3-3, keystone pulsing with its keycard ----------
  await page.getByTestId("nav-formations").click();
  await expect(page.getByTestId("formations-meta-bar")).toContainText("4-3-3");
  await page.locator('[data-token-id="six"]').click();
  await expect(page.getByTestId("formations-keycard")).toBeVisible();
  await page.waitForTimeout(400); // let the keystone pulse reach full glow
  await shot(page, "05-formations-keystone");
  await page.getByTestId("formations-keycard-close").click();

  // --- 06: the Rondo Map with a zone selected ----------------------------
  await page.getByTestId("formations-rondo-toggle").click();
  await expect(page.getByTestId("rondo-zone-layer")).toBeVisible();
  await page.locator('[data-zone-key="first_line"]').click();
  await expect(page.getByTestId("formations-zone-card")).toBeVisible();
  await page.waitForTimeout(150);
  await shot(page, "06-rondo-map");

  // --- 07: Identity, a reference team's signature idea playing -----------
  await page.getByTestId("nav-identity").click();
  await page.getByTestId("identity-sheet-handle").click();
  await expect(page.getByTestId("identity-sheet-body")).toBeVisible();
  await page.getByTestId("identity-search").fill("Barcelona");
  await page.getByTestId("identity-tile").first().click();
  await expect(page.getByTestId("identity-meta-bar")).toBeVisible();
  await page.getByTestId("identity-details-toggle").click();
  await page.waitForTimeout(1300); // mid-sequence, ball in flight
  await shot(page, "07-identity-playing");

  // --- 08: the Roster with the coach-only fit warning --------------------
  await page.getByTestId("nav-roster").click();
  await expect(page.getByTestId("fit-warning-right")).toBeVisible();
  await page.getByTestId(/roster-row-\d+/).filter({ hasText: "Jordan Tavares" }).click();
  await page.waitForTimeout(150);
  await shot(page, "08-roster-fit-warning");

  // --- 09: the session receipts view -------------------------------------
  // The rail opens on the newest session, which the demo seed leaves as a
  // draft (so a coach has something to send live); this shot wants the
  // SENT one, with its counter and per-player receipts.
  await page.getByTestId("nav-sessions").click();
  await page.getByTestId("session-list-item").filter({ hasText: SESSION_TITLE }).click();
  await expect(page.getByTestId("session-sent-pill")).toBeVisible();
  await page.waitForTimeout(150);
  await shot(page, "09-session-receipts");

  await context.close();
});

test("captures the phone set", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: PHONE,
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  // --- 10: a pattern playing portrait on a phone -------------------------
  await signInDemo(page, COACH_EMAIL);
  await page.getByTestId("nav-patterns").click();
  await page.getByTestId("patterns-sheet-handle").tap();
  await page.getByTestId("patterns-search").fill("third man");
  await page.getByTestId("patterns-tile").first().tap();
  await expect(page.locator(".board-wrap")).toHaveAttribute("data-orientation", "portrait");
  await page.waitForTimeout(1400);
  await shot(page, "10-phone-pattern-portrait");
  await context.close();

  // --- 11: the player's session view -------------------------------------
  const playerContext = await browser.newContext({
    viewport: PHONE,
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const playerPage = await playerContext.newPage();
  await signInDemo(playerPage, PLAYER_EMAIL);
  await playerPage.getByTestId("nav-sessions").tap();
  await expect(playerPage.getByTestId("session-detail-title")).toBeVisible();
  await playerPage.waitForTimeout(150);
  await shot(playerPage, "11-phone-player-session");
  await playerContext.close();
});
