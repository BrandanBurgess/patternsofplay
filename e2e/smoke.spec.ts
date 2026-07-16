import { test, expect, assertCleanPage } from "./fixtures";

test("app shell loads and reaches the API", async ({ page, issues }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Patterns of Play" })
  ).toBeVisible();
  // A signed-out visitor lands on the register/login screen (T-003); this
  // only renders once GET /api/auth/me has round-tripped through the API.
  await expect(page.getByRole("heading", { name: "Register" })).toBeVisible();
  await assertCleanPage(page, issues);
});
