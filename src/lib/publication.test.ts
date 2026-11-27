import { describe, expect, it } from "vitest";
import { googleIndexingEnabled } from "./publication";
describe("admin Google publication", () => {
  it("defaults to off until explicitly enabled", () => {
    expect(googleIndexingEnabled(null)).toBe(false);
    expect(googleIndexingEnabled({})).toBe(false);
    expect(googleIndexingEnabled({ google_indexing_enabled: false })).toBe(false);
    expect(googleIndexingEnabled({ google_indexing_enabled: true })).toBe(true);
  });
});