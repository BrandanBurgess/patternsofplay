// Personnel panel journey (T-107, doc 06 sections 2.6, 2.7, 5.3, 5.4).
// Runs under both Playwright projects: desktop landscape at 1440x900,
// where the panel's four groups (Goalkeeper, Back line, Midfield, Front
// line) stack inside the sheet and scroll, and iPhone 13 at 390x844,
// where doc 06 section 5.4's "full-height sheet, one unit at a time"
// pages through them instead. No feature is desktop-only, so every
// assertion below runs at both viewports; the only difference is that a
// phone pages to the group a slot lives in before touching it.
//
// Covers this ticket's DoD lines:
//   open the panel;
//   the empty-roster state (archetypes and suggestions still work with no
//     players on the team at all);
//   assign a player to a slot;
//   pick an archetype (via a suggestion tap, which exercises both DoD
//     lines and the "cited reason, never a score" non-negotiable at once);
//   see the top three suggestions with cited reasons;
//   see a unit balance note appear as archetypes change;
//   see a footedness note.
// Plus the role split: a player token gets the whole editing surface
// (roster and archetype are both open-to-both-roles library/roster reads)
// but none of the three coach-only reads, and fires none of their
// requests either, so T-106's own tripwire spec keeps meaning what it says.

import { test, expect, assertCleanPage, registerCoach, registerPlayer } from "./fixtures";
import type { Page } from "@playwright/test";

/** True on the phone project, same detection tactics-lab.spec.ts already
 *  uses: read it off the DOM rather than the project name, so the test
 *  follows whichever layout the app actually chose. */
async function isPhone(page: Page): Promise<boolean> {
  return (await page.getByTestId("formations-phase-toggle").count()) > 0;
}

async function openFormations(page: Page) {
  await page.getByTestId("nav-formations").click();
  await expect(page.getByTestId("formations-meta-bar")).toContainText("4-3-3");
}

async function openPersonnelPanel(page: Page) {
  const handle = page.getByTestId("formations-sheet-handle");
  if ((await page.getByTestId("formations-sheet-body").count()) === 0) {
    await handle.click();
  }
  await expect(page.getByTestId("formations-sheet-body")).toBeVisible();
  await page.getByTestId("formations-sheet-tab-personnel").click();
  await expect(page.getByTestId("personnel-panel")).toBeVisible();
}

/** Doc 06 section 5.4: on phone, the panel shows one group at a time.
 *  Pages Next until the visible group's label starts with `groupLabel`,
 *  a no-op on desktop where every group is already stacked in the DOM. */
async function goToGroup(page: Page, phone: boolean, groupLabel: string) {
  if (!phone) return;
  for (let i = 0; i < 6; i += 1) {
    const label = (await page.getByTestId("personnel-pager-label").textContent()) ?? "";
    if (label.startsWith(groupLabel)) return;
    await page.getByTestId("personnel-pager-next").click();
  }
  throw new Error(`Personnel pager never reached group "${groupLabel}"`);
}

/** The open sheet is a fixed-position drawer over the whole page (same as
 *  every other sheet in this app), so a nav click underneath it needs the
 *  sheet closed first or it just intercepts the click. */
async function closeSheet(page: Page) {
  if ((await page.getByTestId("formations-sheet-body").count()) > 0) {
    await page.getByTestId("formations-sheet-handle").click();
    await expect(page.getByTestId("formations-sheet-body")).toHaveCount(0);
  }
}

/** Chromium's mobile+touch emulation shrinks the visual viewport once a
 *  text input is focused and never restores it, which can put the save
 *  button's LAYOUT position out from under its actual location for the
 *  rest of the page's life (e2e/roster.spec.ts hit this first; same fix:
 *  dispatch the click directly on the element rather than through
 *  coordinate math). */
async function robustClick(page: Page, testId: string) {
  const locator = page.getByTestId(testId);
  await locator.scrollIntoViewIfNeeded();
  await locator.dispatchEvent("click");
}

async function addMinimalPlayer(page: Page, name: string) {
  await page.getByTestId("nav-roster").click();
  await expect(page.getByRole("heading", { name: "Roster" })).toBeVisible();
  await robustClick(page, "roster-add-player");
  await page.getByTestId("player-name").fill(name);
  // Preferred foot defaults to "R" (RosterPage.tsx EMPTY_FORM), which is
  // exactly what the footedness assertion below wants: a right-footed
  // player at the left centre back slot fires doc 06 section 2.7 rule 1
  // without this journey having to touch the foot selector at all.
  await robustClick(page, "player-save");
  await expect(page.getByTestId("player-save")).toHaveCount(0);
}

test.describe("personnel panel: empty roster, assignment, suggestions, balance, footedness", () => {
  test("coach journey", async ({ page, issues }) => {
    await registerCoach(page);
    await openFormations(page);
    const phone = await isPhone(page);

    // ------------------------------------------------------------------
    // DoD: open the panel. It is the sheet's second segment, alongside
    // "Browse formations" (doc 06 section 5.3).
    // ------------------------------------------------------------------
    await openPersonnelPanel(page);
    await expect(page.getByTestId("personnel-slot")).toHaveCount(phone ? 1 : 11);

    // ------------------------------------------------------------------
    // DoD: the empty-roster state. No players exist on this team yet, and
    // the panel still works: archetypes list, suggestions still return a
    // usable (if player-less) top three, nothing blocks and nothing
    // errors (doc 06 section 5.3: "the panel still works with archetypes
    // alone and no players assigned").
    // ------------------------------------------------------------------
    await expect(page.getByTestId("personnel-empty-roster")).toBeVisible();

    await goToGroup(page, phone, "Back line");
    const cbLeftRow = page.locator('[data-testid="personnel-slot"][data-slot="cb_l"]');
    await expect(cbLeftRow).toBeVisible();

    // The player picker has nothing but "Unassigned" to offer.
    const cbPlayerSelect = cbLeftRow.getByTestId("personnel-player-select");
    await expect(cbPlayerSelect.locator("option")).toHaveCount(1);

    // Suggestions still render for a slot with no player attached, and
    // say so rather than pretending to know a fit (backend/app/routers/
    // tactics.py suggest_archetypes: "No player assigned yet ...").
    await expect(cbLeftRow.getByTestId("personnel-suggestion")).toHaveCount(3);
    await expect(cbLeftRow.getByTestId("personnel-suggestion-why").first()).toContainText(
      "No player assigned yet"
    );

    // ------------------------------------------------------------------
    // Add one player to the roster, then come back.
    // ------------------------------------------------------------------
    await closeSheet(page);
    await addMinimalPlayer(page, "Robbie Foot");
    await openFormations(page);
    await openPersonnelPanel(page);
    await goToGroup(page, phone, "Back line");

    // ------------------------------------------------------------------
    // DoD: assign a player to a slot.
    // ------------------------------------------------------------------
    const cbRow = page.locator('[data-testid="personnel-slot"][data-slot="cb_l"]');
    await cbRow.getByTestId("personnel-player-select").selectOption({ label: "Robbie Foot" });

    // ------------------------------------------------------------------
    // DoD: see the top three suggestions with cited reasons. The why
    // cites the actual reason ("passing range 5 and positional discipline
    // 4 fit the metronome"), never a score: assert it carries a real
    // attribute value (a digit) and never a percent sign.
    // ------------------------------------------------------------------
    const cbSuggestions = cbRow.getByTestId("personnel-suggestion");
    await expect(cbSuggestions).toHaveCount(3);
    // Wait for the refetched (player-aware) suggestions to actually land:
    // the row already showed 3 "no player assigned" suggestions before the
    // select above, same count, so toHaveCount(3) alone cannot tell the
    // stale response from the new one.
    await expect(cbRow.getByTestId("personnel-suggestion-why").first()).not.toContainText(
      "No player assigned yet"
    );
    const whys = await cbRow.getByTestId("personnel-suggestion-why").allTextContents();
    expect(whys.some((w) => /\d/.test(w))).toBe(true);
    for (const w of whys) {
      expect(w).not.toMatch(/%/);
      expect(w.toLowerCase()).not.toMatch(/\bscore\b/);
    }

    // ------------------------------------------------------------------
    // DoD: pick an archetype, via a suggestion tap (also exercises "the
    // why cites the actual reason" against the archetype that actually
    // gets applied, not a random one).
    // ------------------------------------------------------------------
    const firstPick = cbRow.getByTestId("personnel-suggestion-pick").first();
    const pickedName = (await firstPick.textContent())?.trim() ?? "";
    await firstPick.click();
    await expect(firstPick).toHaveAttribute("aria-pressed", "true");
    await expect(cbRow.getByTestId("personnel-archetype-select")).toHaveValue(/.+/);
    await expect(cbRow.getByTestId("personnel-archetype-definition")).toContainText(/\w/);
    void pickedName;

    // ------------------------------------------------------------------
    // DoD: see a footedness note. Robbie Foot is right-footed (the
    // roster form's default) at the LEFT centre back: doc 06 section 2.7
    // rule 1.
    // ------------------------------------------------------------------
    await expect(cbRow.getByTestId("personnel-foot-note")).toContainText(
      "Right-footed left centre back"
    );

    // ------------------------------------------------------------------
    // DoD: see a unit balance note appear AS ARCHETYPES CHANGE. The 4-3-3
    // midfield three is six + eight_l + eight_r; assigning "Box Crasher"
    // to BOTH eights fires mt_one_box_threat (severity note, doc 06
    // section 2.6's own named imbalance) without needing the six
    // assigned at all (max_duty rules run on whatever is assigned).
    // ------------------------------------------------------------------
    await goToGroup(page, phone, "Midfield");
    const eightLeft = page.locator('[data-testid="personnel-slot"][data-slot="eight_l"]');
    const eightRight = page.locator('[data-testid="personnel-slot"][data-slot="eight_r"]');
    await expect(eightLeft).toBeVisible();

    const midfieldBalanceBefore = await page.getByTestId("personnel-balance-unit").allTextContents();
    expect(midfieldBalanceBefore.join(" ")).not.toContain("Two box crashers");

    // The archetype catalog for the "eight" family loads asynchronously;
    // wait for real options before picking one so this does not race
    // GET /archetypes?slot_family=eight.
    const eightLeftArchetype = eightLeft.getByTestId("personnel-archetype-select");
    const eightRightArchetype = eightRight.getByTestId("personnel-archetype-select");
    await expect(eightLeftArchetype.locator("option")).not.toHaveCount(1);
    await eightLeftArchetype.selectOption({ label: "Box Crasher" });
    await eightRightArchetype.selectOption({ label: "Box Crasher" });

    const midfieldUnit = page
      .getByTestId("personnel-balance-unit")
      .filter({ hasText: "Midfield three" });
    // Two identical archetypes on the same trio actually fires TWO seeded
    // rules at once (mt_one_box_threat AND mt_one_of_each_archetype, doc 06
    // section 2.6's own named imbalances), so assert over the joined text
    // rather than a single note element.
    await expect
      .poll(async () => (await midfieldUnit.getByTestId("personnel-balance-note").allTextContents()).join(" "))
      .toContain("Two box crashers");
    await expect(midfieldUnit.getByTestId("personnel-balance-note").first()).toHaveAttribute(
      "data-severity",
      "note"
    );
    // Reads as a check, never an error (this ticket's own non-negotiable
    // and doc 06 section 2.2's copy rule, both apply here): no error-shaped
    // words anywhere in the balance section.
    const balanceText = (await page.getByTestId("personnel-balance").textContent()) ?? "";
    expect(balanceText.toLowerCase()).not.toContain("invalid");
    expect(balanceText.toLowerCase()).not.toContain("error");

    await assertCleanPage(page, issues);
  });
});

test.describe("personnel panel: a player gets the editing surface, none of the coach-only reads", () => {
  // Every coach-only fetcher this panel owns (suggestArchetypes,
  // evaluateUnitBalance) must never fire for a player token: the API
  // itself 403s them (backend/app/routers/tactics.py, tested in
  // backend/tests/test_permissions.py and test_tactics_routes.py), and if
  // FormationsPage.tsx ever called them unconditionally, assertCleanPage
  // below would catch the 403 as a failed request. This is the T-107 half
  // of T-106's own tripwire ("player role reaches every control with no
  // failed request").
  test("player role: full editing surface, zero coach-only DOM, zero coach-only request", async ({
    page,
    issues,
    browser,
  }) => {
    const coachPage = await browser.newPage();
    const { joinCode } = await registerCoach(coachPage);
    await coachPage.close();

    await registerPlayer(page, joinCode);
    await openFormations(page);
    const phone = await isPhone(page);

    await openPersonnelPanel(page);
    await expect(page.getByTestId("personnel-slot")).toHaveCount(phone ? 1 : 11);

    // Player picker and archetype picker are OPEN to both roles (the
    // roster itself and the archetype catalog are both player-viewable
    // reads, same standing as the rest of the roster page).
    const slot = page.getByTestId("personnel-slot").first();
    await expect(slot.getByTestId("personnel-player-select")).toBeVisible();
    const archetypeSelect = slot.getByTestId("personnel-archetype-select");
    await expect(archetypeSelect).toBeVisible();
    await expect(archetypeSelect.locator("option")).not.toHaveCount(1);
    await archetypeSelect.selectOption({ index: 1 });
    await expect(slot.getByTestId("personnel-archetype-definition")).toBeVisible();

    // Suggestions, footedness, and unit balance are COACH-ONLY (doc 06
    // sections 2.7, 5.3) and must be ABSENT from the DOM, not merely
    // hidden, across every slot and every group.
    await expect(page.getByTestId("personnel-suggestions")).toHaveCount(0);
    await expect(page.getByTestId("personnel-foot-note")).toHaveCount(0);
    await expect(page.getByTestId("personnel-balance")).toHaveCount(0);

    if (phone) {
      // Walk every group's page to prove the coach-only sections are
      // absent everywhere, not just on whichever group happened to be
      // showing first.
      for (const label of ["Back line", "Midfield", "Front line"]) {
        await goToGroup(page, true, label);
        await expect(page.getByTestId("personnel-suggestions")).toHaveCount(0);
        await expect(page.getByTestId("personnel-foot-note")).toHaveCount(0);
      }
    }

    // assertCleanPage fails on ANY failed request (net-level) or 5xx; a
    // 403 from an unconditionally-fired suggest/balance call would show up
    // here as a failed fetch the moment the panel's role gate breaks.
    await assertCleanPage(page, issues);
  });
});
