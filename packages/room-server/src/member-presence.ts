import { and, eq, isNotNull, lt, sql } from "drizzle-orm";

import { user } from "@bun-mono/db/schema/auth";
import { roomMember } from "@bun-mono/db/schema/room";

import type { AnyLibSQLDatabase } from "./types";

// Per-User soft cap on `room_member` rows. Enforced by `room.create` (orpc
// typed error) and the WS-attach path (downgrade to Spectator). Not a hard
// constraint at the DB level — a User who is already a Member of >= 10
// Rooms when this cap ships is allowed to continue, they just can't join
// or create more until they leave one.
export const MEMBERSHIP_CAP = 10;

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

function isSlot(n: number): n is Slot {
  return n === 0 || n === 1 || n === 2 || n === 3;
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
    if (!isSlot(row.slotIndex)) {
      console.warn("loadMembers: skipping row with out-of-range slotIndex", {
        roomId,
        userId: row.userId,
        slotIndex: row.slotIndex,
      });
      continue;
    }
    out.set(row.userId, {
      slot: row.slotIndex,
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

// Unconditional delete used by the explicit-leave path. The TTL sweeper
// uses `deleteStaleMember` instead — its WHERE clause guards against a
// race with reconnect. Explicit leave has no such race: the User chose to
// release the slot.
export async function deleteMemberRow(
  db: AnyLibSQLDatabase,
  roomId: string,
  userId: string,
): Promise<void> {
  await db
    .delete(roomMember)
    .where(and(eq(roomMember.roomId, roomId), eq(roomMember.userId, userId)));
}

// Count of Memberships owned by this User across all Rooms — drives the
// 10-Membership soft cap enforced on `room.create` and WS attach.
export async function countMembershipsForUser(
  db: AnyLibSQLDatabase,
  userId: string,
): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(roomMember)
    .where(eq(roomMember.userId, userId));
  return Number(rows[0]?.count ?? 0);
}

export type StaleMemberRow = { userId: string; slot: Slot };

// Loads rows whose `last_seen_at` is non-null and older than `threshold`.
// Online Members have `last_seen_at = null` and are excluded by `isNotNull`.
export async function loadStaleMembers(
  db: AnyLibSQLDatabase,
  roomId: string,
  threshold: number,
): Promise<readonly StaleMemberRow[]> {
  const rows = await db
    .select({ userId: roomMember.userId, slotIndex: roomMember.slotIndex })
    .from(roomMember)
    .where(
      and(
        eq(roomMember.roomId, roomId),
        isNotNull(roomMember.lastSeenAt),
        lt(roomMember.lastSeenAt, new Date(threshold)),
      ),
    );

  const out: StaleMemberRow[] = [];
  for (const row of rows) {
    if (!isSlot(row.slotIndex)) continue;
    out.push({ userId: row.userId, slot: row.slotIndex });
  }
  return out;
}

// Conditional delete: succeeds only if `last_seen_at` is *still* older than
// `threshold`. If the User reconnected between the read and the delete,
// `lastSeenAt` is now `null` (or a later timestamp) and the WHERE clause
// excludes the row — `rowsAffected` is 0 and the caller skips emitting a
// member_left event.
export async function deleteStaleMember(
  db: AnyLibSQLDatabase,
  roomId: string,
  userId: string,
  threshold: number,
): Promise<boolean> {
  const result = await db
    .delete(roomMember)
    .where(
      and(
        eq(roomMember.roomId, roomId),
        eq(roomMember.userId, userId),
        isNotNull(roomMember.lastSeenAt),
        lt(roomMember.lastSeenAt, new Date(threshold)),
      ),
    );

  return result.rowsAffected > 0;
}
