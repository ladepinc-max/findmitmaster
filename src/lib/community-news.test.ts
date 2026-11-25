import { describe, expect, it } from "vitest";
import { communityKey, communityLogo, formatCommunityName, MAX_RECORD_SECONDS, RECORD_HEIGHT } from "./community-news";

describe("community news rules", () => {
  it("one page per community: spacing and case map to the same key", () => {
    expect(communityKey("  Kaneshie   MARKET ")).toBe(communityKey("kaneshie market"));
  });
  it("formats the community name automatically", () => {
    expect(formatCommunityName("  kaneshie   market ")).toBe("Kaneshie Market");
  });
  it("logo is generated from the name and never changes", () => {
    expect(communityLogo("Kaneshie Market")).toEqual(communityLogo(" kaneshie market"));
    expect(communityLogo("Kaneshie Market").initials).toBe("KM");
  });
  it("recordings are 360p and at most 10 minutes", () => {
    expect(RECORD_HEIGHT).toBe(360);
    expect(MAX_RECORD_SECONDS).toBe(600);
  });
});
