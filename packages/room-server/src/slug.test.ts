import { describe, expect, it } from "vitest";

import { generateSlug, generateSlugWithRetry, type SlugInsert } from "./slug";

const excluded = ["0", "O", "l", "I"] as const;

describe("generateSlug", () => {
  it("returns a 10-character string", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateSlug().length).toBe(10);
    }
  });

  it("never emits the excluded look-alike characters", () => {
    for (let i = 0; i < 500; i += 1) {
      const slug = generateSlug();
      for (const ch of excluded) {
        expect(slug.includes(ch)).toBe(false);
      }
    }
  });

  it("returns distinct values across calls (no obvious determinism)", () => {
    const set = new Set<string>();
    for (let i = 0; i < 100; i += 1) set.add(generateSlug());
    expect(set.size).toBeGreaterThan(90);
  });
});

const alwaysCollide: SlugInsert = async () => ({ collided: true });

describe("generateSlugWithRetry", () => {
  it("returns the first slug when insert reports no collision", async () => {
    const seen: string[] = [];
    const insert: SlugInsert = async (slug) => {
      seen.push(slug);
      return { collided: false };
    };
    const out = await generateSlugWithRetry(insert);
    expect(seen).toHaveLength(1);
    expect(out).toBe(seen[0]);
  });

  it("retries once on a first collision and returns the second slug", async () => {
    const seen: string[] = [];
    let calls = 0;
    const insert: SlugInsert = async (slug) => {
      seen.push(slug);
      calls += 1;
      return { collided: calls === 1 };
    };
    const out = await generateSlugWithRetry(insert);
    expect(calls).toBe(2);
    expect(seen).toHaveLength(2);
    expect(out).toBe(seen[1]);
  });

  it("throws slug_collision_after_retry when both attempts collide", async () => {
    await expect(generateSlugWithRetry(alwaysCollide)).rejects.toThrow(
      "slug_collision_after_retry",
    );
  });
});
