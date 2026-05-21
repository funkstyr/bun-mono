import { describe, expect, it } from "vitest";

import type { EventEnvelope } from "@bun-mono/room-protocol/envelope";

import type {
  ChatMessageEvent,
  ChatTypingEvent,
  IntentRejectedEvent,
  MemberJoinedEvent,
  MemberLeftEvent,
  MemberOfflineEvent,
  MemberOnlineEvent,
  MemberView,
  RoomSnapshotEvent,
} from "./room-events";
import { applyEvent, createRoomStore, removeTypingUser, resetStore, setStatus } from "./room-store";

type Slot = 0 | 1 | 2 | 3;

function chatMessage(text: string, from: string, ts: number, position: number): ChatMessageEvent {
  return {
    kind: "chat.message_sent",
    payload: { text },
    id: `m-${position}`,
    ts,
    position,
    from,
    durable: true,
  };
}

function snapshot(
  members: ReadonlyArray<MemberView>,
  recentEvents: EventEnvelope[] = [],
  yourUserId: string | null = "alice",
  yourRole: "member" | "spectator" = "member",
  spectatorCount = 0,
): RoomSnapshotEvent {
  return {
    kind: "room.snapshot",
    payload: {
      members: [...members],
      recentEvents,
      spectatorCount,
      yourRole,
      yourSlot: members.find((m) => m.userId === yourUserId)?.slot ?? null,
      yourUserId,
    },
    id: "snap-1",
    ts: 1000,
    position: 0,
    from: null,
    durable: false,
  };
}

function joined(
  userId: string,
  slot: Slot,
  displayName: string,
  position: number,
): MemberJoinedEvent {
  return {
    kind: "room.member_joined",
    payload: { userId, slot, displayName },
    id: `j-${position}`,
    ts: 1000 + position,
    position,
    from: null,
    durable: true,
  };
}

function left(
  userId: string,
  slot: Slot,
  reason: "left" | "ttl_expired",
  position: number,
): MemberLeftEvent {
  return {
    kind: "room.member_left",
    payload: { userId, slot, reason },
    id: `l-${position}`,
    ts: 1000 + position,
    position,
    from: null,
    durable: true,
  };
}

function online(userId: string, slot: Slot, position: number): MemberOnlineEvent {
  return {
    kind: "room.member_online",
    payload: { userId, slot },
    id: `o-${position}`,
    ts: 1000 + position,
    position,
    from: null,
    durable: false,
  };
}

function offline(userId: string, slot: Slot, position: number, ts = 5000): MemberOfflineEvent {
  return {
    kind: "room.member_offline",
    payload: { userId, slot },
    id: `off-${position}`,
    ts,
    position,
    from: null,
    durable: false,
  };
}

function rejected(intentId: string, reason: string, position: number): IntentRejectedEvent {
  return {
    kind: "room.intent_rejected",
    payload: { intentId, reason },
    id: `r-${position}`,
    ts: 1000 + position,
    position,
    from: null,
    durable: false,
  };
}

function typing(userId: string, position: number): ChatTypingEvent {
  return {
    kind: "chat.typing",
    payload: { userId },
    id: `t-${position}`,
    ts: 1000 + position,
    position,
    from: userId,
    durable: false,
  };
}

const alice = {
  userId: "alice",
  slot: 0 as const,
  displayName: "Alice",
  online: true,
  lastSeenAt: null,
};
const bob = { userId: "bob", slot: 1 as const, displayName: "Bob", online: true, lastSeenAt: null };

describe("createRoomStore", () => {
  it("starts with empty state and 'connecting' status", () => {
    const store = createRoomStore();
    expect(store.state).toEqual({
      status: "connecting",
      myUserId: null,
      myRole: "unknown",
      spectatorReason: null,
      spectatorCount: 0,
      members: [],
      displayNamesByUserId: {},
      timeline: [],
      typingUserIds: [],
      sessionExpired: false,
    });
  });
});

describe("setStatus", () => {
  it("updates only the status field", () => {
    const store = createRoomStore();
    setStatus(store, "open");
    expect(store.state.status).toBe("open");
    expect(store.state.members).toEqual([]);
  });
});

describe("resetStore", () => {
  it("clears all state back to initial", () => {
    const store = createRoomStore();
    applyEvent(store, snapshot([alice, bob], [], "alice"));
    expect(store.state.members).toHaveLength(2);

    resetStore(store);

    expect(store.state).toEqual({
      status: "connecting",
      myUserId: null,
      myRole: "unknown",
      spectatorReason: null,
      spectatorCount: 0,
      members: [],
      displayNamesByUserId: {},
      timeline: [],
      typingUserIds: [],
      sessionExpired: false,
    });
  });
});

describe("applyEvent — room.snapshot", () => {
  it("replaces all state, sets myUserId, marks status open", () => {
    const store = createRoomStore();
    applyEvent(store, snapshot([alice, bob], [], "bob"));
    expect(store.state.status).toBe("open");
    expect(store.state.myUserId).toBe("bob");
    expect(store.state.members.map((m) => m.userId)).toEqual(["alice", "bob"]);
  });

  it("sorts members by slot", () => {
    const store = createRoomStore();
    const carol: MemberView = {
      userId: "carol",
      slot: 2,
      displayName: "Carol",
      online: true,
      lastSeenAt: null,
    };
    applyEvent(store, snapshot([carol, alice, bob]));
    expect(store.state.members.map((m) => m.slot)).toEqual([0, 1, 2]);
  });

  it("seeds the timeline from snapshot.recentEvents, filtered to chat + durable system events", () => {
    const store = createRoomStore();
    const transient = online("alice", 0, 99);
    const events: EventEnvelope[] = [
      joined("alice", 0, "Alice", 0),
      chatMessage("hi", "alice", 1100, 1),
      transient,
      left("bob", 1, "left", 2),
    ];
    applyEvent(store, snapshot([alice], events));
    const kinds = store.state.timeline.map((e) => e.kind);
    expect(kinds).toEqual(["room.member_joined", "chat.message_sent", "room.member_left"]);
  });
});

describe("applyEvent — chat.message_sent", () => {
  it("appends to timeline without touching members", () => {
    const store = createRoomStore();
    applyEvent(store, snapshot([alice]));
    const before = store.state.members;
    applyEvent(store, chatMessage("hello", "alice", 2000, 5));
    expect(store.state.timeline.map((e) => e.kind)).toEqual(["chat.message_sent"]);
    expect(store.state.members).toBe(before);
  });
});

describe("applyEvent — room.member_joined", () => {
  it("adds a new member at the broadcast slot with online=false (member_online follows separately)", () => {
    const store = createRoomStore();
    applyEvent(store, snapshot([alice]));
    applyEvent(store, joined("bob", 1, "Bob", 3));
    const newBob = store.state.members.find((m) => m.userId === "bob");
    expect(newBob).toEqual({
      userId: "bob",
      slot: 1,
      displayName: "Bob",
      online: false,
      lastSeenAt: null,
    });
  });

  it("appends the durable join event to the timeline", () => {
    const store = createRoomStore();
    applyEvent(store, snapshot([alice]));
    applyEvent(store, joined("bob", 1, "Bob", 3));
    expect(store.state.timeline.map((e) => e.kind)).toEqual(["room.member_joined"]);
  });

  it("is idempotent: replaying a join for an existing user doesn't duplicate the row", () => {
    const store = createRoomStore();
    applyEvent(store, snapshot([alice, bob]));
    applyEvent(store, joined("bob", 1, "Bob", 3));
    expect(store.state.members.filter((m) => m.userId === "bob")).toHaveLength(1);
  });

  it("keeps members sorted by slot when inserting", () => {
    const store = createRoomStore();
    applyEvent(store, snapshot([{ ...alice, slot: 2 }]));
    applyEvent(store, joined("bob", 0, "Bob", 3));
    expect(store.state.members.map((m) => m.slot)).toEqual([0, 2]);
  });
});

describe("applyEvent — room.member_left", () => {
  it("removes the member and appends the event to the timeline", () => {
    const store = createRoomStore();
    applyEvent(store, snapshot([alice, bob]));
    applyEvent(store, left("bob", 1, "left", 4));
    expect(store.state.members.map((m) => m.userId)).toEqual(["alice"]);
    expect(store.state.timeline.map((e) => e.kind)).toEqual(["room.member_left"]);
  });

  it("does nothing observable when the userId is unknown", () => {
    const store = createRoomStore();
    applyEvent(store, snapshot([alice]));
    const before = store.state.members;
    applyEvent(store, left("ghost", 3, "ttl_expired", 4));
    expect(store.state.members).toEqual(before);
    expect(store.state.timeline.map((e) => e.kind)).toEqual(["room.member_left"]);
  });
});

describe("applyEvent — spectator role + spectatorCount", () => {
  it("records myRole and spectatorCount from snapshot for an anonymous spectator", () => {
    const store = createRoomStore();
    applyEvent(store, snapshot([alice], [], null, "spectator", 2));
    expect(store.state.myUserId).toBeNull();
    expect(store.state.myRole).toBe("spectator");
    expect(store.state.spectatorCount).toBe(2);
  });

  it("records myRole=spectator for a full-room downgraded but authenticated user", () => {
    const store = createRoomStore();
    applyEvent(store, snapshot([alice, bob], [], "carol", "spectator", 0));
    expect(store.state.myUserId).toBe("carol");
    expect(store.state.myRole).toBe("spectator");
  });

  it("flips myRole from spectator to member when my own member_joined arrives (promotion)", () => {
    const store = createRoomStore();
    applyEvent(store, snapshot([alice], [], "carol", "spectator", 1));
    expect(store.state.myRole).toBe("spectator");

    applyEvent(store, joined("carol", 2, "Carol", 10));

    expect(store.state.myRole).toBe("member");
    expect(store.state.members.find((m) => m.userId === "carol")?.slot).toBe(2);
  });

  it("does not flip myRole when a different user joins", () => {
    const store = createRoomStore();
    applyEvent(store, snapshot([alice], [], "carol", "spectator", 1));
    applyEvent(store, joined("bob", 1, "Bob", 10));
    expect(store.state.myRole).toBe("spectator");
  });
});

describe("applyEvent — chat.typing", () => {
  it("adds the userId to typingUserIds without touching the timeline", () => {
    const store = createRoomStore();
    applyEvent(store, snapshot([alice, bob]));
    const tlBefore = store.state.timeline;

    applyEvent(store, typing("bob", 7));

    expect(store.state.typingUserIds).toEqual(["bob"]);
    expect(store.state.timeline).toBe(tlBefore);
  });

  it("is idempotent: a second typing event for the same user keeps a single entry", () => {
    const store = createRoomStore();
    applyEvent(store, snapshot([alice, bob]));

    applyEvent(store, typing("bob", 7));
    applyEvent(store, typing("bob", 8));

    expect(store.state.typingUserIds).toEqual(["bob"]);
  });

  it("snapshot wipes typingUserIds (typing is transient by definition)", () => {
    const store = createRoomStore();
    applyEvent(store, snapshot([alice, bob]));
    applyEvent(store, typing("bob", 7));
    expect(store.state.typingUserIds).toEqual(["bob"]);

    applyEvent(store, snapshot([alice, bob]));
    expect(store.state.typingUserIds).toEqual([]);
  });
});

describe("removeTypingUser", () => {
  it("removes the userId; no-op when not present", () => {
    const store = createRoomStore();
    applyEvent(store, snapshot([alice, bob]));
    applyEvent(store, typing("bob", 7));

    removeTypingUser(store, "bob");
    expect(store.state.typingUserIds).toEqual([]);

    const before = store.state;
    removeTypingUser(store, "ghost");
    expect(store.state).toBe(before);
  });
});

describe("applyEvent — room.intent_rejected (auth_lost)", () => {
  it("flips role/userId to spectator and raises sessionExpired on auth_lost", () => {
    const store = createRoomStore();
    applyEvent(store, snapshot([alice], [], "alice", "member"));
    expect(store.state.myRole).toBe("member");

    applyEvent(store, rejected("i-1", "auth_lost", 9));

    expect(store.state.sessionExpired).toBe(true);
    expect(store.state.myRole).toBe("spectator");
    expect(store.state.myUserId).toBeNull();
    // The member roster does not change — the server kept Alice's row.
    expect(store.state.members.map((m) => m.userId)).toEqual(["alice"]);
  });

  it("leaves sessionExpired alone for non-auth rejections", () => {
    const store = createRoomStore();
    applyEvent(store, snapshot([alice], [], "alice", "member"));

    applyEvent(store, rejected("i-1", "rate_limit_send_message", 9));
    expect(store.state.sessionExpired).toBe(false);
    expect(store.state.myRole).toBe("member");

    applyEvent(store, rejected("i-2", "invalid_payload", 10));
    expect(store.state.sessionExpired).toBe(false);
    expect(store.state.myRole).toBe("member");
  });

  it("clears sessionExpired when a fresh snapshot arrives (re-attach after sign-in)", () => {
    const store = createRoomStore();
    applyEvent(store, snapshot([alice], [], "alice", "member"));
    applyEvent(store, rejected("i-1", "auth_lost", 9));
    expect(store.state.sessionExpired).toBe(true);

    applyEvent(store, snapshot([alice], [], "alice", "member"));
    expect(store.state.sessionExpired).toBe(false);
    expect(store.state.myRole).toBe("member");
  });
});

describe("applyEvent — room.member_online / room.member_offline", () => {
  it("flips an existing member's online flag without touching the timeline", () => {
    const store = createRoomStore();
    applyEvent(store, snapshot([{ ...alice, online: false }]));
    const tlBefore = store.state.timeline;

    applyEvent(store, online("alice", 0, 7));

    expect(store.state.members.find((m) => m.userId === "alice")?.online).toBe(true);
    expect(store.state.timeline).toBe(tlBefore);
  });

  it("records the ts on member_offline as lastSeenAt", () => {
    const store = createRoomStore();
    applyEvent(store, snapshot([alice]));
    applyEvent(store, offline("alice", 0, 8, 9999));
    const me = store.state.members.find((m) => m.userId === "alice");
    expect(me).toMatchObject({ online: false, lastSeenAt: 9999 });
  });

  it("is a safe no-op for an unknown userId (slot-only event arrived before join)", () => {
    const store = createRoomStore();
    applyEvent(store, snapshot([alice]));
    applyEvent(store, online("ghost", 3, 7));
    expect(store.state.members.find((m) => m.userId === "ghost")).toBeUndefined();
  });
});
