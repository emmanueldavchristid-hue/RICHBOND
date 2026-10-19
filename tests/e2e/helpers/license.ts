import "dotenv/config";
import { Client } from "pg";

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
