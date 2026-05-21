import { and, eq } from "drizzle-orm";

import { user } from "@bun-mono/db/schema/auth";
import { roomMember } from "@bun-mono/db/schema/room";

import type { AnyLibSQLDatabase } from "./types";

export type Slot = 0 | 1 | 2 | 3;

export type MemberInfo = {
  slot: Slot;
  displayName: string;
  lastSeenAt: number | null;
};

const SLOTS: readonly Slot[] = [0, 1, 2, 3] as const;

export function allocateSlot(taken: ReadonlySet<number>): Slot | null {
  for (const s of SLOTS) {
    if (!taken.has(s)) return s;
  }
  return null;
}

export async function loadMembers(
  db: AnyLibSQLDatabase,
  roomId: string,
): Promise<Map<string, MemberInfo>> {
  const rows = await db
    .select({
      userId: roomMember.userId,
      slotIndex: roomMember.slotIndex,
      lastSeenAt: roomMember.lastSeenAt,
      displayName: user.name,
    })
    .from(roomMember)
    .innerJoin(user, eq(roomMember.userId, user.id))
    .where(eq(roomMember.roomId, roomId));

  const out = new Map<string, MemberInfo>();
  for (const row of rows) {
    out.set(row.userId, {
      slot: row.slotIndex as Slot,
      displayName: row.displayName,
      lastSeenAt: row.lastSeenAt instanceof Date ? row.lastSeenAt.getTime() : row.lastSeenAt,
    });
  }
  return out;
}

export async function loadDisplayName(
  db: AnyLibSQLDatabase,
  userId: string,
): Promise<string | null> {
  const rows = await db.select({ name: user.name }).from(user).where(eq(user.id, userId)).limit(1);
  return rows[0]?.name ?? null;
}

export async function insertMemberRow(
  db: AnyLibSQLDatabase,
  roomId: string,
  userId: string,
  slot: Slot,
  joinedAt: number,
): Promise<void> {
  await db.insert(roomMember).values({
    roomId,
    userId,
    slotIndex: slot,
    joinedAt: new Date(joinedAt),
    lastSeenAt: null,
  });
}

export async function setMemberLastSeen(
  db: AnyLibSQLDatabase,
  roomId: string,
  userId: string,
  lastSeenAt: number | null,
): Promise<void> {
  await db
    .update(roomMember)
    .set({ lastSeenAt: lastSeenAt === null ? null : new Date(lastSeenAt) })
    .where(and(eq(roomMember.roomId, roomId), eq(roomMember.userId, userId)));
}
