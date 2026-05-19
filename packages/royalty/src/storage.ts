import {
  type Card,
  type GameState,
  type Seat,
  type Title,
  type TrickState,
  type TributeState,
} from "./engine";

export const STORAGE_KEY = "royalty:v1";
export const SCHEMA_VERSION = 1;

export type RoleCounts = { king: number; queen: number; third: number; joker: number };

export type LifetimeBlob = {
  gamesPlayed: number;
  kings: number;
  queens: number;
  thirds: number;
  jokers: number;
  longestKingStreak: number;
  longestJokerStreak: number;
  currentKingStreak: number;
  currentJokerStreak: number;
};

export type SessionSummary = {
  gamesPlayed: number;
  roleCounts: RoleCounts;
};

export type TributeBundleBlob = {
  king: TributeState;
  queen: TributeState;
  fresh: GameState;
  freshSeed: number;
};

export type SessionBlob = {
  humanSeat: Seat | null;
  seed: number;
  game: GameState;
  tribute: TributeBundleBlob | null;
  titlesFromLastGame: Record<Seat, Title> | null;
  gameCount: number;
  sessionRoleCounts: RoleCounts;
};

export type RoyaltyStorage = {
  schemaVersion: typeof SCHEMA_VERSION;
  currentSession: SessionBlob | null;
  lifetime: LifetimeBlob;
};

export function emptyLifetime(): LifetimeBlob {
  return {
    gamesPlayed: 0,
    kings: 0,
    queens: 0,
    thirds: 0,
    jokers: 0,
    longestKingStreak: 0,
    longestJokerStreak: 0,
    currentKingStreak: 0,
    currentJokerStreak: 0,
  };
}

export function emptyRoleCounts(): RoleCounts {
  return { king: 0, queen: 0, third: 0, joker: 0 };
}

export function emptyStorage(): RoyaltyStorage {
  return {
    schemaVersion: SCHEMA_VERSION,
    currentSession: null,
    lifetime: emptyLifetime(),
  };
}

type SerializedTrick = Omit<TrickState, "passedThisTrick"> & { passedThisTrick: Seat[] };
type SerializedGame = Omit<GameState, "trick"> & { trick: SerializedTrick };
type SerializedTribute = Omit<TributeBundleBlob, "fresh"> & { fresh: SerializedGame };
type SerializedSession = Omit<SessionBlob, "game" | "tribute"> & {
  game: SerializedGame;
  tribute: SerializedTribute | null;
};
type SerializedStorage = Omit<RoyaltyStorage, "currentSession"> & {
  currentSession: SerializedSession | null;
};

function serializeGame(game: GameState): SerializedGame {
  return {
    ...game,
    trick: {
      top: game.trick.top,
      lastPlayer: game.trick.lastPlayer,
      passedThisTrick: Array.from(game.trick.passedThisTrick),
    },
  };
}

function deserializeGame(game: SerializedGame): GameState {
  return {
    ...game,
    trick: {
      top: game.trick.top,
      lastPlayer: game.trick.lastPlayer,
      passedThisTrick: new Set(game.trick.passedThisTrick),
    },
  };
}

function serializeSession(session: SessionBlob): SerializedSession {
  return {
    ...session,
    game: serializeGame(session.game),
    tribute:
      session.tribute === null
        ? null
        : {
            ...session.tribute,
            fresh: serializeGame(session.tribute.fresh),
          },
  };
}

function deserializeSession(session: SerializedSession): SessionBlob {
  return {
    ...session,
    game: deserializeGame(session.game),
    tribute:
      session.tribute === null
        ? null
        : {
            ...session.tribute,
            fresh: deserializeGame(session.tribute.fresh),
          },
  };
}

export function load(): RoyaltyStorage {
  if (typeof window === "undefined") return emptyStorage();
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return emptyStorage();
  }
  if (raw === null) return emptyStorage();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyStorage();
  }

  if (!isPlainObject(parsed)) return emptyStorage();
  const version = (parsed as { schemaVersion?: unknown }).schemaVersion;
  if (version !== SCHEMA_VERSION) return emptyStorage();

  const stored = parsed as SerializedStorage;
  return {
    schemaVersion: SCHEMA_VERSION,
    currentSession:
      stored.currentSession === null || stored.currentSession === undefined
        ? null
        : deserializeSession(stored.currentSession),
    lifetime: { ...emptyLifetime(), ...stored.lifetime },
  };
}

export function save(state: RoyaltyStorage): void {
  if (typeof window === "undefined") return;
  const serialized: SerializedStorage = {
    schemaVersion: SCHEMA_VERSION,
    currentSession: state.currentSession === null ? null : serializeSession(state.currentSession),
    lifetime: state.lifetime,
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
  } catch {
    // best-effort persistence
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function recordGameOver(
  lifetime: LifetimeBlob,
  sessionRoleCounts: RoleCounts,
  humanSeat: Seat,
  titles: Record<Seat, Title>,
): { lifetime: LifetimeBlob; sessionRoleCounts: RoleCounts } {
  const title = titles[humanSeat];
  const nextSessionCounts: RoleCounts = {
    king: sessionRoleCounts.king + (title === "king" ? 1 : 0),
    queen: sessionRoleCounts.queen + (title === "queen" ? 1 : 0),
    third: sessionRoleCounts.third + (title === "third" ? 1 : 0),
    joker: sessionRoleCounts.joker + (title === "joker" ? 1 : 0),
  };
  const nextKingStreak = title === "king" ? lifetime.currentKingStreak + 1 : 0;
  const nextJokerStreak = title === "joker" ? lifetime.currentJokerStreak + 1 : 0;
  return {
    sessionRoleCounts: nextSessionCounts,
    lifetime: {
      gamesPlayed: lifetime.gamesPlayed + 1,
      kings: lifetime.kings + (title === "king" ? 1 : 0),
      queens: lifetime.queens + (title === "queen" ? 1 : 0),
      thirds: lifetime.thirds + (title === "third" ? 1 : 0),
      jokers: lifetime.jokers + (title === "joker" ? 1 : 0),
      currentKingStreak: nextKingStreak,
      currentJokerStreak: nextJokerStreak,
      longestKingStreak: Math.max(lifetime.longestKingStreak, nextKingStreak),
      longestJokerStreak: Math.max(lifetime.longestJokerStreak, nextJokerStreak),
    },
  };
}

export function summarizeSession(session: SessionBlob): SessionSummary {
  return {
    gamesPlayed: session.gameCount,
    roleCounts: session.sessionRoleCounts,
  };
}

export type { Card };
