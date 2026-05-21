import { eq } from "drizzle-orm";

import { db as defaultDb } from "@bun-mono/db";
import { room as roomTable } from "@bun-mono/db/schema/room";

import { chatReducer } from "./chat-reducer";
import { RoomActor, type RoomActorDeps } from "./room-actor";
import type { AnyLibSQLDatabase, RoomKind, RoomRow } from "./types";

export type RegistryDeps = {
  db?: AnyLibSQLDatabase;
  now?: () => number;
  nextEventId?: () => string;
};

export type ResolvedRoom = { actor: RoomActor; row: RoomRow };

const actors = new Map<string, RoomActor>();

export async function getOrCreateActorBySlug(
  slug: string,
  deps: RegistryDeps = {},
): Promise<ResolvedRoom | null> {
  const dbInst = deps.db ?? (defaultDb as unknown as AnyLibSQLDatabase);

  const rows = await dbInst.select().from(roomTable).where(eq(roomTable.slug, slug)).limit(1);
  const row = rows[0];
  if (!row) return null;

  const roomRow: RoomRow = {
    id: row.id,
    slug: row.slug,
    kind: row.kind as RoomKind,
    name: row.name,
    createdBy: row.createdBy,
    createdAt: row.createdAt instanceof Date ? row.createdAt.getTime() : Number(row.createdAt),
  };

  const cached = actors.get(roomRow.id);
  if (cached) return { actor: cached, row: roomRow };

  const actorDeps: RoomActorDeps = {
    db: dbInst,
    ...(deps.now === undefined ? {} : { now: deps.now }),
    ...(deps.nextEventId === undefined ? {} : { nextEventId: deps.nextEventId }),
  };
  const actor = new RoomActor(roomRow, chatReducer, actorDeps);
  actors.set(roomRow.id, actor);

  return { actor, row: roomRow };
}

export function resetRegistryForTests(): void {
  actors.clear();
}
