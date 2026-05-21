import { createClient } from "@libsql/client";
import { sql } from "drizzle-orm";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as authSchema from "@bun-mono/db/schema/auth";
import * as roomSchema from "@bun-mono/db/schema/room";
import { applyMigrations } from "@bun-mono/db/test-migrate";

type TestSchema = typeof authSchema & typeof roomSchema;

export type TestDb = LibSQLDatabase<TestSchema>;

// libsql's `:memory:` is per-connection; drizzle's transaction() nulls the
// underlying connection so subsequent non-tx queries open a fresh empty db.
// Use a per-test temp file instead so all connections share state.
function tempDbUrl(): string {
  const dir = mkdtempSync(join(tmpdir(), "room-server-test-"));
  return `file:${join(dir, "test.db")}`;
}

export async function createTestDb(): Promise<TestDb> {
  const client = createClient({ url: tempDbUrl() });
  const db = drizzle({ client, schema: { ...authSchema, ...roomSchema } });

  await applyMigrations(client);

  return db;
}

export async function seedUser(db: TestDb, id: string, name: string = id): Promise<void> {
  const now = Date.now();
  const email = `${id}@test`;
  await db.run(sql`
    INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
    VALUES (${id}, ${name}, ${email}, 0, ${now}, ${now})
  `);
}

export async function seedRoom(
  db: TestDb,
  id: string,
  slug: string,
  createdBy: string,
): Promise<void> {
  const now = Date.now();
  await db.run(sql`
    INSERT INTO room (id, slug, kind, created_by, created_at)
    VALUES (${id}, ${slug}, 'chat', ${createdBy}, ${now})
  `);
}
