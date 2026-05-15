import { beforeEach, describe, expect, it } from "vitest";

import { storedV1Schema, type StoredV1 } from "./schemas";
import { loadAndMigrate, STORAGE_KEY } from "./storage";

describe("loadAndMigrate", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns empty store when no blob is stored", () => {
    expect(loadAndMigrate()).toEqual({ schemaVersion: 1, timers: [] });
  });

  it("returns empty store when the blob is unparseable JSON", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");
    expect(loadAndMigrate()).toEqual({ schemaVersion: 1, timers: [] });
  });

  it("returns empty store when schemaVersion is higher than current", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 99, timers: [] }));
    expect(loadAndMigrate()).toEqual({ schemaVersion: 1, timers: [] });
  });

  it("returns the stored value unchanged for a valid v1 blob", () => {
    const valid: StoredV1 = {
      schemaVersion: 1,
      timers: [
        {
          id: "test-id",
          name: "Test",
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_000_000,
          sets: [{ rounds: 5, activeSec: 30, restSec: 10, prepSec: 5 }],
        },
      ],
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
    expect(loadAndMigrate()).toEqual(valid);
  });

  it("result always satisfies current arktype schema", () => {
    window.localStorage.setItem(STORAGE_KEY, "garbage");
    const result = loadAndMigrate();
    const validated = storedV1Schema(result);
    expect(validated).toEqual(result);
  });

  it("returns empty store when timers fail validation (bounds)", () => {
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
    expect(loadAndMigrate()).toEqual({ schemaVersion: 1, timers: [] });
  });
});
