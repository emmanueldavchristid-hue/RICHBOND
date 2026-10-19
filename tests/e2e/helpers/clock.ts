import type { BrowserContext } from "@playwright/test";

/** Simule l'heure serveur via le cookie `rb-test-now` (actif si ALLOW_TEST_NOW=1, hors production). */
export async function setTestNow(context: BrowserContext, iso: string | null) {
  if (iso === null) {
    await context.clearCookies({ name: "rb-test-now" });
    return;
  }
  await context.addCookies([{ name: "rb-test-now", value: iso, url: "http://localhost:3100" }]);
}
