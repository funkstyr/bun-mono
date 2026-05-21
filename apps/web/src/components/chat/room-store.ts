import { Store } from "@tanstack/store";

import type { EventEnvelope } from "@bun-mono/room-protocol/envelope";

import {
  isChatMessage,
  isChatTyping,
  isMemberJoined,
  isMemberLeft,
  isMemberOffline,
  isMemberOnline,
  isRoomSnapshot,
  isTimelineEntry,
  type MemberView,
  type RoomTimelineEntry,
} from "./room-events";

export type ConnectionStatus = "connecting" | "open" | "closed";

export type MyRole = "unknown" | "member" | "spectator";

export type RoomState = {
  status: ConnectionStatus;
  myUserId: string | null;
  myRole: MyRole;
  spectatorCount: number;
  members: readonly MemberView[];
  timeline: readonly RoomTimelineEntry[];
  typingUserIds: readonly string[];
};

const initial: RoomState = {
  status: "connecting",
  myUserId: null,
  myRole: "unknown",
  spectatorCount: 0,
  members: [],
  timeline: [],
  typingUserIds: [],
};

export type RoomStore = Store<RoomState>;

export function createRoomStore(): RoomStore {
  return new Store<RoomState>(initial);
}

export function resetStore(store: RoomStore): void {
  store.setState(() => initial);
}

export function setStatus(store: RoomStore, status: ConnectionStatus): void {
  store.setState((s) => ({ ...s, status }));
}

export function applyEvent(store: RoomStore, event: EventEnvelope): void {
  if (isRoomSnapshot(event)) {
    const { payload } = event;
    store.setState(() => ({
      status: "open",
      myUserId: payload.yourUserId,
      myRole: payload.yourRole,
      spectatorCount: payload.spectatorCount,
      members: sortBySlot(payload.members),
      timeline: payload.recentEvents.filter(isTimelineEntry),
      // Snapshot doesn't carry typing state — typing is transient by definition.
      typingUserIds: [],
    }));
    return;
  }

  if (isChatMessage(event)) {
    store.setState((s) => ({ ...s, timeline: [...s.timeline, event] }));
    return;
  }

  if (isMemberJoined(event)) {
    const { userId, slot, displayName } = event.payload;
    store.setState((s) => {
      // Promotion-on-intent: when *I* am the user being joined, this event
      // arrives before any reply to my pending chat intent — flip my role
      // so the input unlocks immediately without a snapshot round-trip.
      const myRole: MyRole = userId === s.myUserId ? "member" : s.myRole;
      return {
        ...s,
        myRole,
        members: sortBySlot([
          ...s.members.filter((m) => m.userId !== userId),
          { userId, slot, displayName, online: false, lastSeenAt: null },
        ]),
        timeline: [...s.timeline, event],
      };
    });
    return;
  }

  if (isMemberLeft(event)) {
    const { userId } = event.payload;
    store.setState((s) => ({
      ...s,
      members: s.members.filter((m) => m.userId !== userId),
      timeline: [...s.timeline, event],
    }));
    return;
  }

  if (isMemberOnline(event)) {
    patchMember(store, event.payload.userId, { online: true, lastSeenAt: null });
    return;
  }

  if (isMemberOffline(event)) {
    patchMember(store, event.payload.userId, { online: false, lastSeenAt: event.ts });
    return;
  }

  if (isChatTyping(event)) {
    const { userId } = event.payload;
    store.setState((s) => {
      if (s.typingUserIds.includes(userId)) return s;
      return { ...s, typingUserIds: [...s.typingUserIds, userId] };
    });
    return;
  }
}

export function removeTypingUser(store: RoomStore, userId: string): void {
  store.setState((s) => {
    if (!s.typingUserIds.includes(userId)) return s;
    return { ...s, typingUserIds: s.typingUserIds.filter((id) => id !== userId) };
  });
}

function patchMember(store: RoomStore, userId: string, patch: Partial<MemberView>): void {
  store.setState((s) => ({
    ...s,
    members: s.members.map((m) => (m.userId === userId ? { ...m, ...patch } : m)),
  }));
}

function sortBySlot(members: readonly MemberView[]): MemberView[] {
  return [...members].toSorted((a, b) => a.slot - b.slot);
}
