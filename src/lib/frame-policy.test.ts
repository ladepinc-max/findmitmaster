import { describe, expect, it } from "vitest";
import { frameBlockedByHeaders } from "./frame-policy";

describe("frameBlockedByHeaders", () => {
  it("blocks DENY and SAMEORIGIN", () => {
    expect(frameBlockedByHeaders("DENY", null)).toBe(true);
    expect(frameBlockedByHeaders("SAMEORIGIN", null)).toBe(true);
  });
  it("blocks restrictive frame-ancestors", () => {
    expect(frameBlockedByHeaders(null, "default-src 'self'; frame-ancestors 'self'")).toBe(true);
  });
  it("allows open sites", () => {
    expect(frameBlockedByHeaders(null, null)).toBe(false);
    expect(frameBlockedByHeaders(null, "frame-ancestors *")).toBe(false);
  });
});
