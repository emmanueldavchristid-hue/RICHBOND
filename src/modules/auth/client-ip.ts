/**
 * Extraction pure de l'IP cliente. L'en-tête X-Forwarded-For est falsifiable : il n'est pris en compte
 * que derrière un proxy de confiance (TRUST_PROXY=1), sinon on renvoie null.
 */
export function clientIpFromHeader(
  xff: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): string | null {
  if (env.TRUST_PROXY !== "1" || !xff) return null;
  const first = xff.split(",")[0].trim().slice(0, 64);
  return first || null;
}
