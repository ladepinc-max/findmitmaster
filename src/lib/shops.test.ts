import { describe, expect, it } from "vitest";
import { isShopActive, isValidHandle, nextExpiry, normaliseHandle } from "./shops";

describe("shop rules", () => {
  it("accepts @ama.food.shop as a handle", () => {
    expect(isValidHandle(normaliseHandle("@Ama.Food.Shop"))).toBe(true);
    expect(isValidHandle("a!")).toBe(false);
  });
  it("registration lasts 365 days and renewals stack", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(nextExpiry(null, now).toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(nextExpiry("2026-06-01T00:00:00Z", now).toISOString()).toBe("2027-06-01T00:00:00.000Z");
  });
  it("unpaid or expired shops are not live", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(isShopActive({ subscription_status: "pending_payment", subscription_expires_at: null }, now)).toBe(false);
    expect(isShopActive({ subscription_status: "active", subscription_expires_at: "2025-12-31T00:00:00Z" }, now)).toBe(false);
    expect(isShopActive({ subscription_status: "active", subscription_expires_at: "2026-02-01T00:00:00Z" }, now)).toBe(true);
  });
});
