// Zone overlay journey (T-022, Brief step 13). Runs under both Playwright
// projects (desktop landscape, iPhone 13 portrait): zones are model-space
// geometry mapped through coords.ts, so the same toggles must work in either
// orientation. Covers the view menu, per-group toggling, and independence.

import { test, expect, assertCleanPage } from "./fixtures";

async function openViewMenu(page: import("@playwright/test").Page) {
  const btn = page.getByTestId("view-menu");
  if ((await btn.getAttribute("aria-expanded")) !== "true") await btn.click();
}

test("view menu toggles each zone group independently", async ({ page, issues }) => {
  await page.goto("/");
  await expect(page.getByTestId("board")).toBeVisible();

  // Nothing is on by default (empty board, per the design README default).
  await expect(page.locator("[data-zone-group]")).toHaveCount(0);

  await openViewMenu(page);

  // Thirds: two dividers appear.
  await page.getByTestId("zone-toggle-thirds").check();
  await expect(page.locator('[data-zone-group="thirds"]')).toHaveCount(2);

  // Zone 14: one labelled pocket, and thirds are untouched (independent).
  await page.getByTestId("zone-toggle-zone14").check();
  await expect(page.locator('[data-zone-group="zone14"]')).toHaveCount(1);
  await expect(page.locator('[data-zone-label="zone14"]')).toHaveText("Zone 14");
  await expect(page.locator('[data-zone-group="thirds"]')).toHaveCount(2);

  // Cutback: two pockets, one per flank.
  await page.getByTestId("zone-toggle-cutback").check();
  await expect(page.locator('[data-zone-group="cutback"]')).toHaveCount(2);

  // Half-spaces: two channels.
  await page.getByTestId("zone-toggle-halfspaces").check();
  await expect(page.locator('[data-zone-group="halfspaces"]')).toHaveCount(2);

  // Toggle thirds back off: only thirds clear, the rest stay.
  await page.getByTestId("zone-toggle-thirds").uncheck();
  await expect(page.locator('[data-zone-group="thirds"]')).toHaveCount(0);
  await expect(page.locator('[data-zone-group="zone14"]')).toHaveCount(1);
  await expect(page.locator('[data-zone-group="cutback"]')).toHaveCount(2);

  await assertCleanPage(page, issues);
});
