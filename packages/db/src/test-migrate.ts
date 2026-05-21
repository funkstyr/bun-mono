import type { Client } from "@libsql/client";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Single source of truth for applying the canonical schema to a fresh libsql
// connection in tests. Both `apps/server` and `@bun-mono/room-server` consume
// this so the DDL never drifts from `src/migrations/0000_*.sql`.

const here = dirname(fileURLToPath(import.meta.url));

// In source (vitest reads the .ts here directly), `here` is packages/db/src
// → ./migrations/0000_*.sql.
// In dist (consumers loading the built .js), `here` is packages/db/dist
// → ../src/migrations/0000_*.sql; the migrations folder ships via `files: ["src"]`.
const candidates = [
  resolve(here, "migrations", "0000_neat_multiple_man.sql"),
  resolve(here, "..", "src", "migrations", "0000_neat_multiple_man.sql"),
];

async function readMigrationSql(): Promise<string> {
  for (const path of candidates) {
    try {
      // eslint-disable-next-line no-await-in-loop -- sequential fallback: try each candidate path in order
      return await readFile(path, "utf8");
    } catch {
      continue;
    }
  }
  throw new Error(
    `applyMigrations: could not locate 0000_neat_multiple_man.sql in ${candidates.join(", ")}`,
  );
}

export async function applyMigrations(client: Client): Promise<void> {
  const sqlText = await readMigrationSql();
  // libsql's executeMultiple doesn't understand drizzle's statement separator.
  const stripped = sqlText.replaceAll("--> statement-breakpoint", "");
  await client.executeMultiple(stripped);
}
