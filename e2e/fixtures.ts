// e2e/fixtures.ts . self-verification contract (skill: verify-ui)
// Every journey imports { test, expect, assertCleanPage } from here.
import { test as base, expect, Page } from "@playwright/test";

type Issues = { consoleErrors: string[]; failedRequests: string[]; serverErrors: string[] };

export const test = base.extend<{ issues: Issues }>({
  issues: async ({ page }, use) => {
    const issues: Issues = { consoleErrors: [], failedRequests: [], serverErrors: [] };
    page.on("console", (m) => m.type() === "error" && issues.consoleErrors.push(m.text()));
    page.on("requestfailed", (r) => issues.failedRequests.push(`${r.method()} ${r.url()}`));
    page.on("response", (r) => r.status() >= 500 && issues.serverErrors.push(`${r.status()} ${r.url()}`));
    await use(issues);
  },
});

export { expect };

export async function assertCleanPage(page: Page, issues: Issues) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  expect(overflow, "horizontal overflow").toBe(false);
  expect(issues.consoleErrors, "console errors").toEqual([]);
  expect(issues.failedRequests, "failed requests").toEqual([]);
  expect(issues.serverErrors, "5xx responses").toEqual([]);
}
