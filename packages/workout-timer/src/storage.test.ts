import { beforeEach, describe, expect, it } from "vitest";

import { storedV2Schema, type StoredV1, type StoredV2 } from "./schemas";
import { loadAndMigrate, STORAGE_KEY } from "./storage";

const emptyV2: StoredV2 = { schemaVersion: 2, sets: [], workouts: [] };

describe("loadAndMigrate", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns empty v2 store when no blob is stored", () => {
    expect(loadAndMigrate()).toEqual(emptyV2);
  });

  it("returns empty v2 store when the blob is unparseable JSON", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");
    expect(loadAndMigrate()).toEqual(emptyV2);
  });

  it("returns empty v2 store when schemaVersion is higher than current", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 99, sets: [] }));
    expect(loadAndMigrate()).toEqual(emptyV2);
  });

  it("migrates a v1 blob into v2 losslessly", () => {
    const v1: StoredV1 = {
      schemaVersion: 1,
      timers: [
        {
          id: "id-a",
          name: "Squats",
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_001_000,
          sets: [{ rounds: 5, activeSec: 30, restSec: 10, prepSec: 5 }],
        },
        {
          id: "id-b",
          name: "Lunges",
          createdAt: 1_700_000_002_000,
          updatedAt: 1_700_000_003_000,
          sets: [{ rounds: 3, activeSec: 45, restSec: 15, prepSec: 0 }],
        },
      ],
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(v1));

    const result = loadAndMigrate();

    expect(result.schemaVersion).toBe(2);
    expect(result.workouts).toEqual([]);
    expect(result.sets).toHaveLength(2);
    for (const [i, timer] of v1.timers.entries()) {
      const set = result.sets[i]!;
      expect(set.id).toBe(timer.id);
      expect(set.name).toBe(timer.name);
      expect(set.createdAt).toBe(timer.createdAt);
      expect(set.updatedAt).toBe(timer.updatedAt);
      expect(set.config).toEqual(timer.sets[0]);
    }
  });

  it("returns the stored value unchanged for a valid v2 blob", () => {
    const v2: StoredV2 = {
      schemaVersion: 2,
      sets: [
        {
          id: "test-id",
          name: "Test",
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_000_000,
          config: { rounds: 5, activeSec: 30, restSec: 10, prepSec: 5 },
        },
      ],
      workouts: [],
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(v2));
    expect(loadAndMigrate()).toEqual(v2);
  });

  it("result always satisfies current v2 arktype schema", () => {
    const cases: string[] = [
      "garbage",
      JSON.stringify({ schemaVersion: 99 }),
      JSON.stringify({ schemaVersion: 1, timers: [] }),
      JSON.stringify({
        schemaVersion: 1,
        timers: [
          {
            id: "x",
            name: "x",
            createdAt: 0,
            updatedAt: 0,
            sets: [{ rounds: 5, activeSec: 30, restSec: 10, prepSec: 5 }],
          },
        ],
      }),
    ];
    for (const raw of cases) {
      window.localStorage.setItem(STORAGE_KEY, raw);
      const result = loadAndMigrate();
      const validated = storedV2Schema(result);
      expect(validated).toEqual(result);
    }
  });

  it("returns empty v2 store when v1 timers fail validation (bounds)", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        timers: [
          {
            id: "x",
            name: "x",
            createdAt: 0,
            updatedAt: 0,
            sets: [{ rounds: 0, activeSec: 30, restSec: 10, prepSec: 5 }],
          },
        ],
      }),
    );
    expect(loadAndMigrate()).toEqual(emptyV2);
  });
});
