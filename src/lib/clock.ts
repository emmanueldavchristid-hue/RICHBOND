/**
 * Horloge unique de l'application. Toute décision de licence passe par ici.
 * `TEST_NOW` (variable d'environnement) ou le cookie `rb-test-now` (ISO) ne sont pris en compte
 * que si NODE_ENV !== "production" ET ALLOW_TEST_NOW === "1". Sinon, heure réelle du serveur.
 */
export const TEST_NOW_COOKIE = "rb-test-now";

type Env = Record<string, string | undefined>;

let warnedProduction = false;

export function isTestClockAllowed(env: Env = process.env): boolean {
  return env.NODE_ENV !== "production" && env.ALLOW_TEST_NOW === "1";
}

function parseIso(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Pure : résout l'heure courante selon les règles ci-dessus. */
export function resolveNow(env: Env, cookieValue: string | undefined, real: Date): Date {
  if (!isTestClockAllowed(env)) {
    if (env.TEST_NOW && env.NODE_ENV === "production" && !warnedProduction) {
      warnedProduction = true;
      console.warn("TEST_NOW est ignorée en production.");
    }
    return real;
  }
  return parseIso(cookieValue) ?? parseIso(env.TEST_NOW) ?? real;
}

/** Vrai si l'heure courante est simulée (alors lastSeenAt n'est jamais mis à jour). */
export function isTestClock(env: Env = process.env, cookieValue?: string): boolean {
  return (
    isTestClockAllowed(env) && (parseIso(cookieValue) !== null || parseIso(env.TEST_NOW) !== null)
  );
}

/** Heure courante sans accès au cookie (TEST_NOW env uniquement). */
export function now(): Date {
  return resolveNow(process.env, undefined, new Date());
}

async function readTestCookie(): Promise<string | undefined> {
  if (!isTestClockAllowed()) return undefined;
  try {
    const { cookies } = await import("next/headers");
    return (await cookies()).get(TEST_NOW_COOKIE)?.value;
  } catch {
    return undefined; // hors contexte de requête
  }
}

/** Heure courante pour les requêtes : cookie de test si autorisé, sinon `now()`. */
export async function getNow(): Promise<{ now: Date; simulated: boolean }> {
  const cookie = await readTestCookie();
  return {
    now: resolveNow(process.env, cookie, new Date()),
    simulated: isTestClock(process.env, cookie),
  };
}
