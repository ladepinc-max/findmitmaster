import { describe, expect, it } from "vitest";
import { adFee, adHref, adOffer, discountedAdPrice, selectedAdPhoto, isAdLive, AD_SLIDE_MS } from "./shop-ads";

describe("shop ads", () => {
  it("automatically chooses the selected product photo", () => {
    const products = [{ id: "p1", photo_url: "owner/tilapia.jpg" }, { id: "p2", photo_url: "owner/rice.jpg" }];
    expect(selectedAdPhoto(products, "p2")).toBe("owner/rice.jpg");
    expect(selectedAdPhoto(products, "")).toBeNull();
  });
  it("allows adverts without an optional price or discount", () => {
    expect(adOffer("", "")).toEqual({ price_ghc: null, discount_percent: null });
    expect(adOffer("100", "")).toEqual({ price_ghc: 100, discount_percent: null });
  });
  it("calculates the optional percentage discount", () => {
    expect(adOffer("100", "20")).toEqual({ price_ghc: 100, discount_percent: 20 });
    expect(discountedAdPrice(100, 20)).toBe(80);
    expect(() => adOffer("", "20")).toThrow();
    expect(() => adOffer("100", "101")).toThrow();
    expect(() => adOffer("-1", "")).toThrow();
  });
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
