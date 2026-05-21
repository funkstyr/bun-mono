import { expect, test } from "@playwright/test";

test("deals a hand, plays a turn, sees a bot act", async ({ page }) => {
  await page.goto("royalty/");

  await expect(page.getByRole("heading", { name: "Royalty" })).toBeVisible();

  // useRoyaltyGame auto-deals on first load, so no "Start a session" click is
  // needed — the hand is rendered as soon as the bundle hydrates.
  // CardButtons in the human hand expose aria-label "{rank} of {suit}";
  // table-top and play-log cards render as static spans, so this selector
  // uniquely targets the dealt hand.
  const handCards = page.locator('button[aria-label*=" of "]');
  await expect(handCards).toHaveCount(13);

  // Human seat is randomised per session — read it off the seat header so
  // the played-card assertion isn't hardcoded.
  const humanHeader = page.getByText(/^You \(Seat \d+\)/);
  const humanSeat = (await humanHeader.textContent())?.match(/Seat (\d+)/)?.[1];
  expect(humanSeat).toBeTruthy();

  // If a bot holds 3♣ it leads, and several bots may pass before the human is
  // up. Use a generous auto-wait rather than the engine's pacing constants,
  // which live in the engine package and may change.
  await expect(page.getByText("Your turn", { exact: true })).toBeVisible({ timeout: 20_000 });

  // Cards outside any legal play render disabled, so the first enabled card
  // always forms a valid single. If nothing is playable (top hand unbeatable)
  // pass instead — the test still exercises the human → bot handoff.
  const enabled = page.locator('button[aria-label*=" of "]:not([disabled])');
  if ((await enabled.count()) > 0) {
    await enabled.first().click();
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.getByText(`Top — Seat ${humanSeat}`)).toBeVisible();
  } else {
    await page.getByRole("button", { name: "Pass", exact: true }).click();
  }

  // The play log marks human entries with "(you)"; a bot entry is any <li>
  // without that suffix. At least one must appear before the test ends.
  const botEntries = page.locator("ol[reversed] > li").filter({ hasNotText: "(you)" });
  await expect(botEntries.first()).toBeVisible({ timeout: 15_000 });
});
