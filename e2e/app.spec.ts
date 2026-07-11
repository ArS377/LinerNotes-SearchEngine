import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("searches and opens a recording", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("search").getByRole("searchbox").fill("Jolene Dolly Parton");
  await page.getByRole("search").getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/\/search\?q=/);
  await expect(page.locator("[data-results-list]")).toContainText("Jolene");
  await page.getByRole("button", { name: /Jolene/i }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Jolene");
});

test("home page has no automatically detectable accessibility violations", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
