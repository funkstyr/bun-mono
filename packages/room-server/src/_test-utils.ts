import { createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as authSchema from "@bun-mono/db/schema/auth";
import * as roomSchema from "@bun-mono/db/schema/room";

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

  await client.executeMultiple(`
    CREATE TABLE user (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      email_verified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      username TEXT UNIQUE,
      display_username TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE room (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      name TEXT,
      created_by TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE room_member (
      room_id TEXT NOT NULL REFERENCES room(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      slot_index INTEGER NOT NULL,
      joined_at INTEGER NOT NULL,
      last_seen_at INTEGER,
      PRIMARY KEY (room_id, user_id)
    );
    CREATE UNIQUE INDEX room_member_roomId_slotIndex_idx
      ON room_member(room_id, slot_index);
    CREATE INDEX room_member_userId_idx ON room_member(user_id);

    CREATE TABLE room_event (
      room_id TEXT NOT NULL REFERENCES room(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      id TEXT NOT NULL,
      kind TEXT NOT NULL,
      from_user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
      payload TEXT NOT NULL,
      ts INTEGER NOT NULL,
      PRIMARY KEY (room_id, position)
    );
  `);

  return db;
}

export async function seedUser(db: TestDb, id: string, name: string = id): Promise<void> {
  const now = Date.now();
  await db.run(
    `INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
       VALUES ('${id}', '${name}', '${id}@test', 0, ${now}, ${now})`,
  );
}

export async function seedRoom(
  db: TestDb,
  id: string,
  slug: string,
  createdBy: string,
): Promise<void> {
  const now = Date.now();
  await db.run(
    `INSERT INTO room (id, slug, kind, created_by, created_at)
       VALUES ('${id}', '${slug}', 'chat', '${createdBy}', ${now})`,
  );
}
