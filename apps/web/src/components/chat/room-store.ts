import { Store } from "@tanstack/store";

import type { EventEnvelope } from "@bun-mono/room-protocol/envelope";

import {
  isChatMessage,
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

export type RoomState = {
  status: ConnectionStatus;
  myUserId: string | null;
  members: readonly MemberView[];
  timeline: readonly RoomTimelineEntry[];
};

const initial: RoomState = {
  status: "connecting",
  myUserId: null,
  members: [],
  timeline: [],
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
      members: sortBySlot(payload.members),
      timeline: payload.recentEvents.filter(isTimelineEntry),
    }));
    return;
  }

  if (isChatMessage(event)) {
    store.setState((s) => ({ ...s, timeline: [...s.timeline, event] }));
    return;
  }

  if (isMemberJoined(event)) {
    const { userId, slot, displayName } = event.payload;
    store.setState((s) => ({
      ...s,
      members: sortBySlot([
        ...s.members.filter((m) => m.userId !== userId),
        { userId, slot, displayName, online: false, lastSeenAt: null },
      ]),
      timeline: [...s.timeline, event],
    }));
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
