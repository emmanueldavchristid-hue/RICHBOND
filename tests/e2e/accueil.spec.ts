import { expect, test } from "@playwright/test";

test("la racine redirige vers la connexion quand on n'est pas connecté", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/connexion/);
  await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
  await expect(page.getByTestId("login-submit")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page).toHaveTitle(/RICHBOND/);
});
