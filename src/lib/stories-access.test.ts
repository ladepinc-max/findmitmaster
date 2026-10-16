import { describe, expect, it } from "vitest";
import { canSeeStories } from "./stories-access";
describe("stories access", () => {
  it("hides from public until published", () => expect(canSeeStories({ published: false, isAdmin: false, isTester: false })).toBe(false));
  it("testers see it while private", () => expect(canSeeStories({ published: false, isAdmin: false, isTester: true })).toBe(true));
  it("admins see it while private", () => expect(canSeeStories({ published: false, isAdmin: true, isTester: false })).toBe(true));
  it("everyone sees it once published", () => expect(canSeeStories({ published: true, isAdmin: false, isTester: false })).toBe(true));
});
