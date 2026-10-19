import "dotenv/config";
import { Client } from "pg";

/** Requête SQL sur la base de TEST uniquement (vérification des effets métier). */
export async function dbQuery<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST est absente.");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query(sql, params)).rows as T[];
  } finally {
    await client.end();
  }
}

export async function dbOne<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  const rows = await dbQuery<T>(sql, params);
  if (rows.length === 0) throw new Error(`Aucune ligne pour : ${sql}`);
  return rows[0];
}
