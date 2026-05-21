#!/usr/bin/env bun
/**
 * Local SQLite bootstrap. Idempotent — running twice does nothing on the
 * second pass.
 *
 * What this does:
 * 1. Resolves the local SQLite path from `apps/server/.env`'s
 *    `DATABASE_URL` (must be a `file:` URL). If the env file or var is
 *    missing, prints a hint and exits non-zero.
 * 2. Creates the parent directory if needed.
 * 3. Runs the canonical Drizzle migrator against the file, applying every
 *    SQL in `packages/db/src/migrations/` that hasn't run yet.
 *
 * Re-runs are safe: Drizzle tracks applied migrations in a metadata table
 * and skips already-applied ones.
 *
 * Use this instead of `turso dev --db-file local.db` when you don't want
 * to install the Turso CLI — the on-disk file works directly with the
 * libsql client.
 */
import { createClient } from "@libsql/client";
import { config as loadDotenv } from "dotenv";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// scripts/init.ts → packages/db/scripts → packages/db → packages → repo root
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const serverEnvPath = resolve(repoRoot, "apps/server/.env");
const migrationsFolder = resolve(repoRoot, "packages/db/src/migrations");

if (!existsSync(serverEnvPath)) {
  console.error(`db-init: apps/server/.env is missing.`);
  console.error(`Copy the template first:`);
  console.error(`  cp apps/server/.env.example apps/server/.env`);
  process.exit(1);
}

loadDotenv({ path: serverEnvPath });

const url = process.env["DATABASE_URL"];
if (!url) {
  console.error(`db-init: DATABASE_URL is unset in apps/server/.env`);
  process.exit(1);
}

if (!url.startsWith("file:")) {
  console.error(
    `db-init: DATABASE_URL is "${url}" — this bootstrap only handles local file: URLs.`,
  );
  console.error(`Switch to a "file:..." URL or use \`bun db:migrate\` against your remote DB.`);
  process.exit(1);
}

// Resolve the file path the same way the server's runtime does: relative
// to `apps/server/` (the .env's directory, which is also the server's cwd).
// `file:local.db` → `apps/server/local.db`.
const filePath = url.slice("file:".length);
const absoluteFile = isAbsolute(filePath) ? filePath : resolve(dirname(serverEnvPath), filePath);

mkdirSync(dirname(absoluteFile), { recursive: true });

const client = createClient({ url: `file:${absoluteFile}` });
const db = drizzle(client);

console.log(`db-init: applying migrations → ${absoluteFile}`);
await migrate(db, { migrationsFolder });
console.log(`db-init: done.`);

client.close();
