import type { RoomActor } from "./room-actor";

// Disconnect TTL. A Member's slot is reclaimed when `last_seen_at`
// (which is `null` while any connection is live, set on full disconnect)
// is older than this. Mirrors the pacing-constants convention in
// `packages/royalty/src/engine.ts` — tuned in code, not at runtime.
export const TTL_MS = 24 * 60 * 60 * 1000;

export const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

export type SweeperHandle = { stop: () => void };

// Periodic sweeper. Iterates currently-resident actors (from the registry)
// each tick and calls `sweepStaleMembers()`. Rooms whose actors aren't in
// memory get swept lazily on the next attach (see `RoomActor.attach`), so
// no stale row outlives the next connection.
//
// Pass `intervalMs: 0` to disable in tests.
export function startTtlSweeper(
  iter: () => Iterable<RoomActor>,
  intervalMs: number = SWEEP_INTERVAL_MS,
): SweeperHandle {
  if (intervalMs <= 0) return { stop: () => undefined };

  const timer = setInterval(() => {
    for (const actor of iter()) {
      void actor.sweepStaleMembers().catch((err: unknown) => {
        console.error("ttl-sweeper: actor sweep failed", err);
      });
    }
  }, intervalMs);

  return {
    stop: () => clearInterval(timer),
  };
}
