import { createClient } from "@libsql/client";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const tmpDir = resolve(here, "../../.vitest-tmp");
const dbFile = resolve(tmpDir, "test.db");
const migrationFile = resolve(
  here,
  "../../../../packages/db/src/migrations/0000_neat_multiple_man.sql",
);

export async function setup(): Promise<void> {
  // Fresh DB per test run.
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });

  // Use the drizzle migration SQL as the canonical schema source. Strip the
  // `--> statement-breakpoint` markers so libsql's `executeMultiple` parses cleanly.
  const sql = readFileSync(migrationFile, "utf8").replaceAll("--> statement-breakpoint", "");

  const client = createClient({ url: `file:${dbFile}` });
  await client.executeMultiple(sql);
  client.close();
}

export async function teardown(): Promise<void> {
  rmSync(tmpDir, { recursive: true, force: true });
}
