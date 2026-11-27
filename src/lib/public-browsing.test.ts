import { describe, expect, it } from "vitest";
import { isPublicBrowsingPath } from "./public-browsing";

describe("guest browsing", () => {
  it.each(["/home", "/jobs", "/shops"])("allows guests to browse %s", (path) => {
    expect(isPublicBrowsingPath(path)).toBe(true);
  });
  it.each(["/profile", "/chat", "/my-shop", "/my-supplier", "/employer", "/admin", "/"])("keeps %s account-gated", (path) => {
    expect(isPublicBrowsingPath(path)).toBe(false);
  });
});