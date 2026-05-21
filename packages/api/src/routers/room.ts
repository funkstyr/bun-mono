import { ORPCError } from "@orpc/server";
import { type } from "arktype";
import { and, desc, eq, sql } from "drizzle-orm";
import { customAlphabet } from "nanoid";

import { db } from "@bun-mono/db";
import { room, roomMember, type RoomKind } from "@bun-mono/db/schema/room";
import { MEMBERSHIP_CAP } from "@bun-mono/room-server/member-presence";
import { getOrCreateActorBySlug } from "@bun-mono/room-server/room-registry";

import { protectedProcedure } from "../index";

const idAlphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
const slugAlphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // URL-safe, no lookalikes

const generateRoomId = customAlphabet(idAlphabet, 21);
const generateSlug = customAlphabet(slugAlphabet, 10);

export const createInput = type({
  kind: '"chat"',
  "name?": "string <= 60",
});

type CreateResult = { slug: string };

// Snapshot of the caller's current Memberships, returned in the
// `MEMBERSHIP_CAP_EXCEEDED` error payload so the client can render the
// "leave one first" prompt without an extra `room.list` round-trip.
type MembershipSummary = {
  slug: string;
  name: string | null;
  lastEventAt: number | null;
};

async function loadOwnMemberships(userId: string): Promise<MembershipSummary[]> {
  const rows = await db
    .select({
      slug: room.slug,
      name: room.name,
      lastEventAt: sql<
        number | null
      >`(select max(ts) from room_event re where re.room_id = ${room.id})`,
    })
    .from(roomMember)
    .innerJoin(room, eq(roomMember.roomId, room.id))
    .where(eq(roomMember.userId, userId))
    .orderBy(
      desc(sql`coalesce((select max(ts) from room_event re where re.room_id = ${room.id}), 0)`),
    );

  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    lastEventAt: r.lastEventAt === null ? null : Number(r.lastEventAt),
  }));
}

// Schema for the typed cap-error payload. Declared with `.errors({})` so
// the client gets compile-time knowledge of the shape and `isDefinedError`
// returns true on detection.
const capErrorData = type({
  memberships: type({
    slug: "string",
    name: "string | null",
    lastEventAt: "number | null",
  }).array(),
  cap: "number.integer",
});

const create = protectedProcedure
  .errors({
    MEMBERSHIP_CAP_EXCEEDED: {
      status: 409,
      message: "You're already a Member of the maximum number of Rooms.",
      data: capErrorData,
    },
  })
  .input(createInput)
  .handler(async ({ context, input, errors }): Promise<CreateResult> => {
    const userId = context.session.user.id;

    // 10-Membership soft cap. The User must release a slot in another Room
    // before they can create an 11th. The error payload carries the list
    // of current Memberships so the client can show "leave one first"
    // inline without a follow-up `room.list` query.
    const countRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(roomMember)
      .where(eq(roomMember.userId, userId));
    const ownCount = Number(countRows[0]?.count ?? 0);

    if (ownCount >= MEMBERSHIP_CAP) {
      const memberships = await loadOwnMemberships(userId);
      throw errors.MEMBERSHIP_CAP_EXCEEDED({
        message: `You're already a Member of ${ownCount} Rooms (cap: ${MEMBERSHIP_CAP}). Leave one first.`,
        data: { memberships, cap: MEMBERSHIP_CAP },
      });
    }

    const tryInsert = async (slug: string): Promise<{ collided: boolean; roomId?: string }> => {
      try {
        const roomId = generateRoomId();
        await db.transaction(async (tx) => {
          await tx.insert(room).values({
            id: roomId,
            slug,
            kind: input.kind as RoomKind,
            name: input.name ?? null,
            createdBy: userId,
            createdAt: new Date(),
          });
          await tx.insert(roomMember).values({
            roomId,
            userId,
            slotIndex: 0,
            joinedAt: new Date(),
            lastSeenAt: null,
          });
        });
        return { collided: false, roomId };
      } catch (e) {
        const msg = e instanceof Error ? e.message.toLowerCase() : "";
        if (msg.includes("unique") && msg.includes("slug")) return { collided: true };
        throw e;
      }
    };

    let slug = generateSlug();
    let r = await tryInsert(slug);
    if (r.collided) {
      slug = generateSlug();
      r = await tryInsert(slug);
      if (r.collided) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "slug_collision_after_retry" });
      }
    }

    return { slug };
  });

type ListRow = {
  slug: string;
  kind: RoomKind;
  name: string | null;
  memberCount: number;
  lastEventAt: number | null;
  mySlotIndex: number;
};

const list = protectedProcedure.handler(async ({ context }): Promise<ListRow[]> => {
  const userId = context.session.user.id;
  const rows = await db
    .select({
      slug: room.slug,
      kind: room.kind,
      name: room.name,
      mySlotIndex: roomMember.slotIndex,
      memberCount: sql<number>`(select count(*) from room_member rm where rm.room_id = ${room.id})`,
      lastEventAt: sql<
        number | null
      >`(select max(ts) from room_event re where re.room_id = ${room.id})`,
    })
    .from(roomMember)
    .innerJoin(room, eq(roomMember.roomId, room.id))
    .where(eq(roomMember.userId, userId))
    .orderBy(
      desc(sql`coalesce((select max(ts) from room_event re where re.room_id = ${room.id}), 0)`),
    );

  return rows.map((r) => ({
    slug: r.slug,
    kind: r.kind as RoomKind,
    name: r.name,
    memberCount: Number(r.memberCount),
    lastEventAt: r.lastEventAt === null ? null : Number(r.lastEventAt),
    mySlotIndex: r.mySlotIndex,
  }));
});

export const leaveInput = type({
  slug: "string >= 1",
});

type LeaveResult = { ok: true };

// HTTP twin of the WS `room.leave` intent. Same side-effects: deletes the
// `room_member` row, emits a durable `room.member_left{reason:"left"}`,
// and demotes any of the User's still-open WS connections in this Room to
// Spectator. Routed through the actor so the in-memory presence map stays
// in sync with the row delete and the broadcast fans out to all attached
// connections.
const leave = protectedProcedure
  .input(leaveInput)
  .handler(async ({ context, input }): Promise<LeaveResult> => {
    const userId = context.session.user.id;

    const memberRows = await db
      .select({ slotIndex: roomMember.slotIndex })
      .from(roomMember)
      .innerJoin(room, eq(roomMember.roomId, room.id))
      .where(and(eq(room.slug, input.slug), eq(roomMember.userId, userId)))
      .limit(1);

    if (memberRows.length === 0) {
      throw new ORPCError("NOT_FOUND", {
        message: "You are not a Member of this Room.",
        data: { slug: input.slug },
      });
    }

    const found = await getOrCreateActorBySlug(input.slug);
    if (!found) {
      throw new ORPCError("NOT_FOUND", {
        message: "Room not found.",
        data: { slug: input.slug },
      });
    }

    const ok = await found.actor.leaveAsMember(userId);
    if (!ok) {
      // Membership row vanished between the lookup and the actor call —
      // treat as success since the user is no longer a Member anyway.
      return { ok: true };
    }

    return { ok: true };
  });

export const roomRouter = {
  create,
  list,
  leave,
};
