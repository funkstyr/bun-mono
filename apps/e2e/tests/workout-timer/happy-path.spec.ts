import { expect, test } from "@playwright/test";

test("creates an inline workout, runs it, and reaches the done screen", async ({ page }) => {
  await page.goto("timer");

  await expect(page.getByText("No workouts yet")).toBeVisible();

  // Saving a set always returns to the Sets list, so create the set first
  // and build the workout afterwards — keeps the flow linear.
  await page.getByRole("tab", { name: "Sets" }).click();
  await page.getByRole("button", { name: "+ Create" }).click();

  await expect(page.getByRole("heading", { name: "New set" })).toBeVisible();
  await page.getByLabel("Name").fill("Quick");
  await page.getByLabel("Rounds").fill("1");
  await page.getByLabel("Prep (seconds)").fill("0");
  // Two "Sec" labels in DOM order: Active first, then Rest.
  // `exact: true` avoids substring-matching "Prep (seconds)".
  await page.getByLabel("Sec", { exact: true }).first().fill("5");
  await page.getByLabel("Sec", { exact: true }).nth(1).fill("0");

  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("button", { name: "Start Quick" })).toBeVisible();

  // Workout-level prep guarantees a GET READY → ACTIVE transition.
  await page.getByRole("tab", { name: "Workouts" }).click();
  await page.getByRole("button", { name: "Build a workout" }).click();

  await expect(page.getByRole("heading", { name: "New workout" })).toBeVisible();
  await page.getByLabel("Name").fill("E2E");
  await page.getByLabel("Prep (seconds)").fill("5");
  await page.getByLabel("Repeats").fill("1");

  await page.getByRole("button", { name: "Add set" }).click();
  await expect(page.getByRole("heading", { name: "Add a set" })).toBeVisible();
  await page.getByRole("button", { name: /Quick/ }).click();
  await page.getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: "Save" }).click();

  await page.getByRole("button", { name: "Start E2E" }).click();

  await expect(page.getByText("GET READY", { exact: true })).toBeVisible();

  await expect(page.getByText("ACTIVE", { exact: true })).toBeVisible({ timeout: 10_000 });

  await expect(page.getByRole("button", { name: "Repeat" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Done" })).toBeVisible();
});
