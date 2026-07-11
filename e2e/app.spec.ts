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

test("compares recordings and explains the difference", async ({ page }) => {
  await page.goto("/explore");
  const results = page.locator("[data-results-list]");
  await results.getByRole("button", { name: "Compare", exact: true }).nth(0).click();
  await results.getByRole("button", { name: "Compare", exact: true }).nth(0).click();
  await page.getByRole("button", { name: "Compare 2", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Compare recordings");
  await expect(page.getByText("What changed?", { exact: true })).toBeVisible();
  await expect(page.locator(".compare-grid article")).toHaveCount(2);
});

test("builds private insights from a bookmark", async ({ page }) => {
  await page.goto("/explore");
  await page.locator("[data-results-list]").getByRole("button", { name: "Bookmark", exact: true }).nth(0).click();
  await page.getByRole("button", { name: "Insights" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("listening map");
  await expect(page.getByText("Queen", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Fits the 1970s era", { exact: false }).first()).toBeVisible();
});
