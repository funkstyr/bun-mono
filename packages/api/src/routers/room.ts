import { ORPCError } from "@orpc/server";
import { type } from "arktype";
import { and, desc, eq, sql } from "drizzle-orm";
import { customAlphabet } from "nanoid";

import { db } from "@bun-mono/db";
import { room, roomMember, type RoomKind } from "@bun-mono/db/schema/room";
import { MEMBERSHIP_CAP } from "@bun-mono/room-protocol/limits";
import { countMembershipsForUser } from "@bun-mono/room-server/member-presence";
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

// Returned in MEMBERSHIP_CAP_EXCEEDED so the client renders "leave one first" without a follow-up room.list.
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

    const ownCount = await countMembershipsForUser(db, userId);

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

// HTTP twin of the WS `room.leave` intent — routed through the actor so the in-memory presence map stays in sync with the row delete.
const leave = protectedProcedure
  .input(leaveInput)
  .handler(async ({ context, input }): Promise<LeaveResult> => {
    const userId = context.session.user.id;

    const memberRows = await db
      .select({ userId: roomMember.userId })
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

    // `leaveAsMember` returning false here means the row vanished between the lookup and the call — caller is no longer a Member, treat as success.
    await found.actor.leaveAsMember(userId);

    return { ok: true };
  });

export const roomRouter = {
  create,
  list,
  leave,
};
