import { describe, expect, it } from "vitest";
import { adFee, adHref, isAdLive, AD_SLIDE_MS } from "./shop-ads";

describe("shop ads", () => {
  it("ads slide every 7 seconds", () => expect(AD_SLIDE_MS).toBe(7000));
  it("charges the weekly fee per week", () => expect(adFee(50, 3)).toBe(150));
  it("opens the advertised product inside the shop", () => {
    expect(adHref("amaskitchen", "p1")).toBe("/@amaskitchen?product=p1");
    expect(adHref("amaskitchen", null)).toBe("/@amaskitchen");
  });
  it("only paid, unexpired ads are live", () => {
    const now = Date.parse("2026-11-26T00:00:00Z");
    expect(isAdLive({ status: "active", expires_at: "2026-12-01T00:00:00Z" }, now)).toBe(true);
    expect(isAdLive({ status: "active", expires_at: "2026-11-01T00:00:00Z" }, now)).toBe(false);
    expect(isAdLive({ status: "unpaid", expires_at: null }, now)).toBe(false);
  });
});
