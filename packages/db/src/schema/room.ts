import { relations, sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/sqlite-core";

import { user } from "./auth";

export type RoomKind = "chat";

export const room = sqliteTable("room", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  kind: text("kind").$type<RoomKind>().notNull(),
  name: text("name"),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});

export const roomMember = sqliteTable(
  "room_member",
  {
    roomId: text("room_id")
      .notNull()
      .references(() => room.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    slotIndex: integer("slot_index").notNull(),
    joinedAt: integer("joined_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    primaryKey({ columns: [table.roomId, table.userId] }),
    uniqueIndex("room_member_roomId_slotIndex_idx").on(table.roomId, table.slotIndex),
    index("room_member_userId_idx").on(table.userId),
  ],
);

export const roomEvent = sqliteTable(
  "room_event",
  {
    roomId: text("room_id")
      .notNull()
      .references(() => room.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    id: text("id").notNull(),
    kind: text("kind").notNull(),
    fromUserId: text("from_user_id").references(() => user.id, { onDelete: "set null" }),
    payload: text("payload").notNull(),
    ts: integer("ts").notNull(),
  },
  (table) => [primaryKey({ columns: [table.roomId, table.position] })],
);

export const roomRelations = relations(room, ({ one, many }) => ({
  creator: one(user, {
    fields: [room.createdBy],
    references: [user.id],
  }),
  members: many(roomMember),
  events: many(roomEvent),
}));

export const roomMemberRelations = relations(roomMember, ({ one }) => ({
  room: one(room, {
    fields: [roomMember.roomId],
    references: [room.id],
  }),
  user: one(user, {
    fields: [roomMember.userId],
    references: [user.id],
  }),
}));

export const roomEventRelations = relations(roomEvent, ({ one }) => ({
  room: one(room, {
    fields: [roomEvent.roomId],
    references: [room.id],
  }),
  fromUser: one(user, {
    fields: [roomEvent.fromUserId],
    references: [user.id],
  }),
}));
