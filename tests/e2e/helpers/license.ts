import "dotenv/config";
import { Client } from "pg";

/** TEST UNIQUEMENT : même secret fictif que `webServer.env.LICENSE_SECRET` dans playwright.config.ts. */
export const E2E_LICENSE_SECRET = "e2e-only-license-secret-0123456789abcdef";

/** Jour de fin d'essai (AAAA-MM-JJ, Abidjan = UTC) après `resetLicense(days)`. */
export function trialEndDay(days = 30): string {
  const t = new Date();
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + days)).toISOString().slice(0, 10);
}

/** Compte des lignes sensibles (aucune ne doit disparaître à l'expiration). */
export async function countRows(): Promise<{ users: number; auditLogs: number }> {
  const client = new Client({ connectionString: process.env.DATABASE_URL_TEST });
  await client.connect();
  try {
    const u = await client.query<{ n: string }>("SELECT count(*) AS n FROM users");
    const a = await client.query<{ n: string }>("SELECT count(*) AS n FROM audit_logs");
    return { users: Number(u.rows[0].n), auditLogs: Number(a.rows[0].n) };
  } finally {
    await client.end();
  }
}

export async function userExists(email: string): Promise<boolean> {
  const client = new Client({ connectionString: process.env.DATABASE_URL_TEST });
  await client.connect();
  try {
    const r = await client.query("SELECT 1 FROM users WHERE email = $1", [email]);
    return (r.rowCount ?? 0) > 0;
  } finally {
    await client.end();
  }
}

/** Remet la licence de la base de TEST en essai, fin à J+30 (23:59:59.999 Abidjan = UTC). */
export async function resetLicense(days = 30) {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST est absente.");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(
      `UPDATE licenses SET status = 'TRIAL', licensed_to = NULL, activated_at = NULL, key_fingerprint = NULL,
         last_seen_at = NULL, trial_starts_at = now(),
         trial_ends_at = (date_trunc('day', now() AT TIME ZONE 'UTC') + make_interval(days => $1 + 1) - interval '1 millisecond') AT TIME ZONE 'UTC'`,
      [days],
    );
    await client.query(`DELETE FROM audit_logs WHERE action = 'LICENSE_ACTIVATION_FAILED'`);
  } finally {
    await client.end();
  }
}
