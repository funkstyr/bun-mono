import { type } from "arktype";
import { describe, expect, it } from "vitest";

import { leaveRoomPayload } from "./room-intents";

describe("leaveRoomPayload", () => {
  it("accepts an empty object", () => {
    const result = leaveRoomPayload({});
    expect(result instanceof type.errors).toBe(false);
  });
});
