import { expect, test } from "@playwright/test";

test("watch view boots and the bot dispatcher advances the game", async ({ page }) => {
  await page.goto("royalty/watch");

  await expect(page.getByRole("heading", { name: "Royalty — Watch" })).toBeVisible();

  // Watch mode auto-deals via newWatchSession on first load and bots act on a
  // timer. At least one play should land in the log within a generous window
  // — don't pin to engine pacing constants.
  const logEntries = page.locator("ol[reversed] > li");
  await expect(logEntries.first()).toBeVisible({ timeout: 10_000 });
});
