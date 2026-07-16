// Team management journey (T-043, founder decision 2026-07-16). Runs
// under both Playwright projects (mobile portrait, desktop landscape) per
// playwright.config.ts. Three founder decisions, one file:
//   1. Role-scoped join codes: a team has a player code and a coach code;
//      whichever code you join with decides your role_on_team, never your
//      account's own global role.
//   2. Both codes are coach-only chrome: present for any coach, absent
//      (not hidden) for a player, same DOM-absence contract every other
//      coach-only surface in this app already follows (see
//      e2e/permissions.spec.ts assertNoCoachOnlyChrome).
//   3. Head-coach member management: the team's creator alone can remove
//      a member or change their role_on_team; any coach can see the list;
//      a player never sees it at all.
//
// backend/tests/test_permissions.py covers the API half of all three
// rows; this file is the UI half plus one direct-API 403 check per the
// ticket's own acceptance line ("the API 403s them anyway").

import {
  test,
  expect,
  assertCleanPage,
  registerCoach,
  registerAndJoinTeam,
} from "./fixtures";
import type { Page } from "@playwright/test";

function trackIssues(page: Page) {
  const issues = { consoleErrors: [] as string[], failedRequests: [] as string[], serverErrors: [] as string[] };
  page.on("console", (m) => m.type() === "error" && issues.consoleErrors.push(m.text()));
  page.on("requestfailed", (r) => issues.failedRequests.push(`${r.method()} ${r.url()}`));
  page.on("response", (r) => r.status() >= 500 && issues.serverErrors.push(`${r.status()} ${r.url()}`));
  return issues;
}

async function openTeamMembers(page: Page) {
  await page.getByTestId("team-members-toggle").click();
  await expect(page.getByTestId("team-members-panel")).toBeVisible();
}

test.describe("team management: role-scoped join codes and head-coach controls", () => {
  test("coach sees both join codes; player sees neither key", async ({ browser }) => {
    const coachContext = await browser.newContext();
    const coachPage = await coachContext.newPage();
    const coachIssues = trackIssues(coachPage);
    const { joinCode, coachJoinCode } = await registerCoach(coachPage, {
      displayName: "Coach Meta Test",
    });
    await expect(coachPage.getByTestId("join-code-player")).toHaveText(joinCode);
    await expect(coachPage.getByTestId("join-code-coach")).toHaveText(coachJoinCode);
    expect(joinCode).not.toBe(coachJoinCode);
    await assertCleanPage(coachPage, coachIssues);

    const playerContext = await browser.newContext();
    const playerPage = await playerContext.newPage();
    const playerIssues = trackIssues(playerPage);
    await registerAndJoinTeam(playerPage, joinCode, {
      role: "player",
      displayName: "Player Meta Test",
    });
    await expect(playerPage.getByText("(player)")).toBeVisible();
    // Absent, not hidden: same DOM-absence contract as every other
    // coach-only surface (e2e/permissions.spec.ts).
    await expect(playerPage.getByTestId("join-code-player")).toHaveCount(0);
    await expect(playerPage.getByTestId("join-code-coach")).toHaveCount(0);
    await expect(playerPage.getByTestId("team-members-toggle")).toHaveCount(0);
    await assertCleanPage(playerPage, playerIssues);

    await coachContext.close();
    await playerContext.close();
  });

  test("a code's role wins regardless of the joining account's own role", async ({ browser }) => {
    const headContext = await browser.newContext();
    const headPage = await headContext.newPage();
    const headIssues = trackIssues(headPage);
    const { joinCode, coachJoinCode } = await registerCoach(headPage, {
      displayName: "Head Coach Cross Test",
    });

    // A COACH-role account joins with the PLAYER code: it lands as a
    // player on this team, sees no join codes at all.
    const coachAsPlayerContext = await browser.newContext();
    const coachAsPlayerPage = await coachAsPlayerContext.newPage();
    const coachAsPlayerIssues = trackIssues(coachAsPlayerPage);
    await registerAndJoinTeam(coachAsPlayerPage, joinCode, {
      role: "coach",
      displayName: "Coach Account Joins As Player",
    });
    await expect(coachAsPlayerPage.getByText("(player)")).toBeVisible();
    await expect(coachAsPlayerPage.getByTestId("join-code-player")).toHaveCount(0);
    await expect(coachAsPlayerPage.getByTestId("join-code-coach")).toHaveCount(0);
    await assertCleanPage(coachAsPlayerPage, coachAsPlayerIssues);

    // A PLAYER-role account joins with the COACH code: it lands as a
    // coach on this team, sees both join codes.
    const playerAsCoachContext = await browser.newContext();
    const playerAsCoachPage = await playerAsCoachContext.newPage();
    const playerAsCoachIssues = trackIssues(playerAsCoachPage);
    await registerAndJoinTeam(playerAsCoachPage, coachJoinCode, {
      role: "player",
      displayName: "Player Account Joins As Coach",
    });
    await expect(playerAsCoachPage.getByText("(coach)")).toBeVisible();
    await expect(playerAsCoachPage.getByTestId("join-code-player")).toHaveText(joinCode);
    await expect(playerAsCoachPage.getByTestId("join-code-coach")).toHaveText(coachJoinCode);
    await assertCleanPage(playerAsCoachPage, playerAsCoachIssues);

    await assertCleanPage(headPage, headIssues);

    await headContext.close();
    await coachAsPlayerContext.close();
    await playerAsCoachContext.close();
  });

  test("head coach removes a member and changes a role; a non-head coach sees the list with no controls, and the API 403s them anyway", async ({
    browser,
  }) => {
    const headContext = await browser.newContext();
    const headPage = await headContext.newPage();
    const headIssues = trackIssues(headPage);
    const { joinCode, coachJoinCode } = await registerCoach(headPage, {
      displayName: "Head Coach",
    });

    const otherCoachContext = await browser.newContext();
    const otherCoachPage = await otherCoachContext.newPage();
    await registerAndJoinTeam(otherCoachPage, coachJoinCode, {
      role: "coach",
      displayName: "Other Coach",
    });

    const playerContext = await browser.newContext();
    const playerPage = await playerContext.newPage();
    const playerIssues = trackIssues(playerPage);
    await registerAndJoinTeam(playerPage, joinCode, { role: "player", displayName: "Sam Player" });

    // --- Head coach: full list, controls on every row but their own ---
    await openTeamMembers(headPage);
    const panel = headPage.getByTestId("team-members-panel");
    await expect(panel).toContainText("Head Coach");
    await expect(panel).toContainText("Other Coach");
    await expect(panel).toContainText("Sam Player");

    const headRow = headPage.locator('[data-testid^="team-member-row-"]').filter({ hasText: "Head Coach" });
    await expect(headRow.locator('[data-testid^="team-member-remove-"]')).toHaveCount(0);
    const playerRow = headPage.locator('[data-testid^="team-member-row-"]').filter({ hasText: "Sam Player" });
    await expect(playerRow.locator('[data-testid^="team-member-remove-"]')).toHaveCount(1);
    await expect(playerRow.locator('[data-testid^="team-member-toggle-role-"]')).toHaveCount(1);

    // --- Non-head coach: sees the same list, zero controls anywhere ---
    await openTeamMembers(otherCoachPage);
    const otherPanel = otherCoachPage.getByTestId("team-members-panel");
    await expect(otherPanel).toContainText("Sam Player");
    await expect(otherCoachPage.locator('[data-testid^="team-member-remove-"]')).toHaveCount(0);
    await expect(otherCoachPage.locator('[data-testid^="team-member-toggle-role-"]')).toHaveCount(0);

    // --- The API 403s the non-head coach anyway, not just the UI hiding
    // the buttons (CLAUDE.md rule 5) ---
    const listedByOtherCoach = await otherCoachPage.request.get("/api/teams/members");
    expect(listedByOtherCoach.ok()).toBe(true);
    const someMemberId = (await listedByOtherCoach.json())[0].id as number;
    const forbiddenRemove = await otherCoachPage.request.delete(`/api/teams/members/${someMemberId}`);
    expect(forbiddenRemove.status()).toBe(403);
    const forbiddenRoleChange = await otherCoachPage.request.patch(
      `/api/teams/members/${someMemberId}/role`,
      { data: { role_on_team: "player" } }
    );
    expect(forbiddenRoleChange.status()).toBe(403);
    // A player token gets the same 403, not just a non-head coach one.
    const forbiddenFromPlayer = await playerPage.request.delete(`/api/teams/members/${someMemberId}`);
    expect(forbiddenFromPlayer.status()).toBe(403);

    // --- Head coach changes the player's role to coach, then removes
    // the other coach entirely ---
    await playerRow.locator('[data-testid^="team-member-toggle-role-"]').click();
    await expect(playerRow).toContainText("coach");

    const otherCoachRow = headPage.locator('[data-testid^="team-member-row-"]').filter({ hasText: "Other Coach" });
    await otherCoachRow.locator('[data-testid^="team-member-remove-"]').click();
    await expect(panel).not.toContainText("Other Coach");

    await assertCleanPage(headPage, headIssues);
    await assertCleanPage(playerPage, playerIssues);

    await headContext.close();
    await otherCoachContext.close();
    await playerContext.close();
  });
});
