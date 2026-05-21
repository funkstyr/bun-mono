import { ORPCError } from "@orpc/server";
import { type } from "arktype";
import { desc, eq, sql } from "drizzle-orm";
import { customAlphabet } from "nanoid";

import { db } from "@bun-mono/db";
import { room, roomMember, type RoomKind } from "@bun-mono/db/schema/room";

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

const create = protectedProcedure
  .input(createInput)
  .handler(async ({ context, input }): Promise<CreateResult> => {
    const userId = context.session.user.id;

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

export const roomRouter = {
  create,
  list,
};
