import { describe, it, expect } from "vitest";
import { communitySwitchDate, canJoinCommunity } from "./community-membership";
describe("community membership rules", () => {
  it("blocks a different community for six calendar months", () => {
    const membership = { community_id: "accra", switch_allowed_at: communitySwitchDate("2026-11-27T00:00:00Z").toISOString() };
    expect(membership.switch_allowed_at).toBe("2027-05-27T00:00:00.000Z");
    expect(canJoinCommunity(membership, "kumasi", new Date("2027-05-26T23:59:59Z"))).toBe(false);
    expect(canJoinCommunity(membership, "kumasi", new Date("2027-05-27T00:00:00Z"))).toBe(true);
  });
  it("lets users reopen their one current community", () => {
    expect(canJoinCommunity({ community_id: "accra", switch_allowed_at: "2027-05-27T00:00:00Z" }, "accra", new Date("2026-11-27"))).toBe(true);
  });
});