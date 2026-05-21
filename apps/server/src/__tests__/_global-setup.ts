import { createClient } from "@libsql/client";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { applyMigrations } from "@bun-mono/db/test-migrate";

const here = dirname(fileURLToPath(import.meta.url));
const tmpDir = resolve(here, "../../.vitest-tmp");
const dbFile = resolve(tmpDir, "test.db");

export async function setup(): Promise<void> {
  // Fresh DB per test run.
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });

  const client = createClient({ url: `file:${dbFile}` });
  await applyMigrations(client);
  client.close();
}

export async function teardown(): Promise<void> {
  rmSync(tmpDir, { recursive: true, force: true });
}
