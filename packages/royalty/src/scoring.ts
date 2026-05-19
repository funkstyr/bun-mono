import type { Seat, Title } from "./engine";
import type { LifetimeBlob, RoleCounts, SessionBlob, SessionSummary } from "./storage";

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
