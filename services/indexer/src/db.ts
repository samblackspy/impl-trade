//! Postgres pool + schema migration.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`[indexer] missing required env ${name}`);
  return value;
}

export const pool = new Pool({
  connectionString: requireEnv("DATABASE_URL"),
});

/** Apply db/schema.sql (idempotent). */
export async function migrate(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const schema = readFileSync(join(here, "../../../db/schema.sql"), "utf8");
  await pool.query(schema);
}

export async function closePool(): Promise<void> {
  await pool.end();
}
