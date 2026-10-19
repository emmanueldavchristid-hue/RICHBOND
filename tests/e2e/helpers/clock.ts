import type { BrowserContext } from "@playwright/test";

/**
 * Instant ISO simulé relatif au jour de fin d'essai (`endDay` AAAA-MM-JJ, Abidjan = UTC).
 * `daysBeforeEnd` = 0 : le jour de fin ; `time` = heure HH:MM (Abidjan).
 */
export function simulatedAt(endDay: string, daysBeforeEnd: number, time = "10:00"): string {
  const d = new Date(`${endDay}T${time}:00.000Z`);
  d.setUTCDate(d.getUTCDate() - daysBeforeEnd);
  return d.toISOString();
}

/** Simule l'heure serveur via le cookie `rb-test-now` (actif si ALLOW_TEST_NOW=1, hors production). */
export async function setTestNow(context: BrowserContext, iso: string | null) {
  if (iso === null) {
    await context.clearCookies({ name: "rb-test-now" });
    return;
  }
  await context.addCookies([{ name: "rb-test-now", value: iso, url: "http://localhost:3100" }]);
}
