import { describe, expect, it, vi } from "vitest";

import type { RoomActor } from "./room-actor";
import { SWEEP_INTERVAL_MS, TTL_MS, startTtlSweeper } from "./ttl";

describe("TTL constants", () => {
  it("TTL_MS is 24 hours", () => {
    expect(TTL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("SWEEP_INTERVAL_MS is 10 minutes", () => {
    expect(SWEEP_INTERVAL_MS).toBe(10 * 60 * 1000);
  });
});

describe("startTtlSweeper", () => {
  it("does nothing and returns a no-op handle when interval is 0", () => {
    const iter = vi.fn<() => RoomActor[]>(() => []);
    const handle = startTtlSweeper(iter, 0);
    handle.stop();
    expect(iter).not.toHaveBeenCalled();
  });

  it("calls sweepStaleMembers on each actor each tick", () => {
    vi.useFakeTimers();
    try {
      const sweep = vi.fn<() => Promise<void>>(() => Promise.resolve());
      const fakeActor = { sweepStaleMembers: sweep } as unknown as RoomActor;
      const handle = startTtlSweeper(() => [fakeActor], 100);

      vi.advanceTimersByTime(250);
      expect(sweep).toHaveBeenCalledTimes(2);

      handle.stop();
      vi.advanceTimersByTime(500);
      expect(sweep).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("logs and continues when one actor's sweep rejects", async () => {
    vi.useFakeTimers();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const bad = {
        sweepStaleMembers: () => Promise.reject(new Error("boom")),
      } as unknown as RoomActor;
      const goodSweep = vi.fn<() => Promise<void>>(() => Promise.resolve());
      const good = { sweepStaleMembers: goodSweep } as unknown as RoomActor;
      const handle = startTtlSweeper(() => [bad, good], 100);

      vi.advanceTimersByTime(100);
      await Promise.resolve();
      await Promise.resolve();

      expect(goodSweep).toHaveBeenCalledTimes(1);
      expect(errSpy).toHaveBeenCalled();

      handle.stop();
    } finally {
      errSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
