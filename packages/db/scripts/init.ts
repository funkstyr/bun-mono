#!/usr/bin/env bun
// Idempotent local SQLite bootstrap: reads DATABASE_URL from apps/server/.env, creates the file if needed, applies pending Drizzle migrations.
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

// Resolve relative to `apps/server/` to match the server's cwd at runtime — `file:local.db` → `apps/server/local.db`.
const filePath = url.slice("file:".length);
const absoluteFile = isAbsolute(filePath) ? filePath : resolve(dirname(serverEnvPath), filePath);

mkdirSync(dirname(absoluteFile), { recursive: true });

const client = createClient({ url: `file:${absoluteFile}` });
const db = drizzle(client);

console.log(`db-init: applying migrations → ${absoluteFile}`);
await migrate(db, { migrationsFolder });
console.log(`db-init: done.`);

client.close();
