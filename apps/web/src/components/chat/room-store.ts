import { Store } from "@tanstack/store";

import type { EventEnvelope } from "@bun-mono/room-protocol/envelope";
import type { SpectatorReason } from "@bun-mono/room-protocol/system";

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

export type { SpectatorReason };

export type ConnectionStatus = "connecting" | "open" | "closed";

export type MyRole = "unknown" | "member" | "spectator";

export type RoomState = {
  status: ConnectionStatus;
  myUserId: string | null;
  myRole: MyRole;
  spectatorReason: SpectatorReason | null;
  spectatorCount: number;
  members: readonly MemberView[];
  // Persists across `member_left` so the message list can still render the User's name after they leave.
  displayNamesByUserId: Readonly<Record<string, string>>;
  timeline: readonly RoomTimelineEntry[];
  typingUserIds: readonly string[];
};

const initial: RoomState = {
  status: "connecting",
  myUserId: null,
  myRole: "unknown",
  spectatorReason: null,
  spectatorCount: 0,
  members: [],
  displayNamesByUserId: {},
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
    const timeline = payload.recentEvents.filter(isTimelineEntry);
    store.setState(() => ({
      status: "open",
      myUserId: payload.yourUserId,
      myRole: payload.yourRole,
      spectatorReason: payload.reason ?? null,
      spectatorCount: payload.spectatorCount,
      members: sortBySlot(payload.members),
      displayNamesByUserId: collectDisplayNames(payload.members, timeline),
      timeline,
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
      const isMe = userId === s.myUserId;
      const myRole: MyRole = isMe ? "member" : s.myRole;
      const spectatorReason: SpectatorReason | null = isMe ? null : s.spectatorReason;
      return {
        ...s,
        myRole,
        spectatorReason,
        members: sortBySlot([
          ...s.members.filter((m) => m.userId !== userId),
          { userId, slot, displayName, online: false, lastSeenAt: null },
        ]),
        displayNamesByUserId: { ...s.displayNamesByUserId, [userId]: displayName },
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

// Includes historical member_joined events so a User who left before the snapshot but is still in the recent-events window keeps their name.
function collectDisplayNames(
  members: readonly MemberView[],
  timeline: readonly RoomTimelineEntry[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of members) out[m.userId] = m.displayName;
  for (const entry of timeline) {
    if (isMemberJoined(entry)) {
      out[entry.payload.userId] = entry.payload.displayName;
    }
  }
  return out;
}
