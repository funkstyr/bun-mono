import { expect, test } from "@playwright/test";

test("plays a full game until a terminal state is rendered", async ({ page }) => {
  await page.goto("tic-tac-toe");

  await expect(page.getByRole("heading", { name: "Tic-tac-toe" })).toBeVisible();

  await page.getByLabel("Difficulty").getByRole("button", { name: "Easy" }).click();
  await page.getByLabel("Side").getByRole("button", { name: "X" }).click();

  const emptyCells = page.getByLabel(/^Cell \d+, empty$/);
  await expect(emptyCells).toHaveCount(9);

  const endBanner = page.getByText(/You won!|AI wins|Draw/);
  const yourTurn = page.getByText("Your turn", { exact: true });

  for (let move = 0; move < 5; move++) {
    if (await endBanner.isVisible()) break;

    await emptyCells.first().click();

    await expect
      .poll(
        async () => {
          if (await endBanner.isVisible()) return "over";
          if (await yourTurn.isVisible()) return "ready";
          return "waiting";
        },
        { timeout: 5000 },
      )
      .not.toBe("waiting");
  }

  await expect(endBanner).toBeVisible();
});
