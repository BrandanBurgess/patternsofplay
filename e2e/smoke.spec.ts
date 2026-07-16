import { test, expect, assertCleanPage } from "./fixtures";

test("app shell loads and reaches the API", async ({ page, issues }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Patterns of Play" })
  ).toBeVisible();
  await expect(page.getByText("API status: ok")).toBeVisible();
  await assertCleanPage(page, issues);
});
