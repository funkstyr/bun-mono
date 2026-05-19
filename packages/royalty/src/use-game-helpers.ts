import { cardKey } from "./card/card-labels";
import {
  type Card,
  dealGame,
  type GameState,
  type Seat,
  tributeComplete,
  type TributeState,
} from "./engine";
import {
  emptyLifetime,
  emptyRoleCounts,
  load,
  type LifetimeBlob,
  type SessionBlob,
} from "./storage";

export type TributeBundle = {
  king: TributeState;
  queen: TributeState;
  fresh: GameState;
  freshSeed: number;
};

export type RoyaltyState = {
  session: SessionBlob | null;
  lifetime: LifetimeBlob;
};

export function makeSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

export function pickHumanSeat(): Seat {
  return Math.floor(Math.random() * 4) as Seat;
}

export function effectiveTargetHand(fresh: GameState, t: TributeState): readonly Card[] {
  const receivedKeys = new Set(t.received.map(cardKey));
  return fresh.players[t.target].hand.filter((c) => !receivedKeys.has(cardKey(c)));
}

export function effectiveAskerHand(fresh: GameState, t: TributeState): readonly Card[] {
  const returnedKeys = new Set(t.returned.map(cardKey));
  return fresh.players[t.asker].hand.filter((c) => !returnedKeys.has(cardKey(c)));
}

export function newPlaySession(): SessionBlob {
  const seed = makeSeed();
  return {
    humanSeat: pickHumanSeat(),
    seed,
    game: dealGame(seed, "three-of-clubs-holder"),
    tribute: null,
    titlesFromLastGame: null,
    gameCount: 1,
    sessionRoleCounts: emptyRoleCounts(),
  };
}

export function newWatchSession(): SessionBlob {
  const seed = makeSeed();
  return {
    humanSeat: null,
    seed,
    game: dealGame(seed, "three-of-clubs-holder"),
    tribute: null,
    titlesFromLastGame: null,
    gameCount: 1,
    sessionRoleCounts: emptyRoleCounts(),
  };
}

export function currentRoleAndTribute(
  bundle: TributeBundle,
): { role: "king" | "queen"; tribute: TributeState } | null {
  if (!tributeComplete(bundle.king)) return { role: "king", tribute: bundle.king };
  if (!tributeComplete(bundle.queen)) return { role: "queen", tribute: bundle.queen };

  return null;
}

export function withTributeUpdated(
  bundle: TributeBundle,
  role: "king" | "queen",
  next: TributeState,
): TributeBundle {
  return role === "king" ? { ...bundle, king: next } : { ...bundle, queen: next };
}

export function loadInitial(mode: "play" | "watch"): RoyaltyState {
  if (mode === "watch") {
    return { session: newWatchSession(), lifetime: emptyLifetime() };
  }
  const stored = load();

  return {
    session: stored.currentSession ?? newPlaySession(),
    lifetime: stored.lifetime,
  };
}
