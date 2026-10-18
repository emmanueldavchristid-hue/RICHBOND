import { expect, test } from "@playwright/test";

test("la page d'accueil s'ouvre", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "RICHBOND – Achats & Stocks" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page).toHaveTitle(/RICHBOND/);
});
