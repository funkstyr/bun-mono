import { describe, expect, it } from "vitest";

import { validateLoginSearch } from "./-login-search";

describe("validateLoginSearch", () => {
  it("accepts a same-origin path", () => {
    expect(validateLoginSearch({ redirect: "/chat/r/abc" })).toEqual({ redirect: "/chat/r/abc" });
  });

  it("accepts the root path", () => {
    expect(validateLoginSearch({ redirect: "/" })).toEqual({ redirect: "/" });
  });

  it("rejects a protocol-relative URL (the History API would treat // as a remote origin)", () => {
    expect(validateLoginSearch({ redirect: "//evil.com" })).toEqual({});
    expect(validateLoginSearch({ redirect: "//evil.com/path" })).toEqual({});
  });

  it("rejects the rarer /\\ protocol-relative form", () => {
    expect(validateLoginSearch({ redirect: "/\\evil.com" })).toEqual({});
  });

  it("rejects absolute http(s) URLs", () => {
    expect(validateLoginSearch({ redirect: "https://evil.com/path" })).toEqual({});
    expect(validateLoginSearch({ redirect: "http://evil.com" })).toEqual({});
  });

  it("rejects scheme-like values", () => {
    expect(validateLoginSearch({ redirect: "javascript:alert(1)" })).toEqual({});
    expect(validateLoginSearch({ redirect: "data:text/html,foo" })).toEqual({});
  });

  it("rejects non-string redirect values", () => {
    expect(validateLoginSearch({ redirect: 42 })).toEqual({});
    expect(validateLoginSearch({ redirect: ["/foo"] })).toEqual({});
    expect(validateLoginSearch({ redirect: null })).toEqual({});
  });

  it("returns an empty object when redirect is missing", () => {
    expect(validateLoginSearch({})).toEqual({});
  });
});
