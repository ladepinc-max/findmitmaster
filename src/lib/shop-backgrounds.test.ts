import { describe, expect, it } from "vitest";
import { automaticShopBackground, backgroundBlur, resolvedShopBackground, shopBackgroundCategory } from "./shop-backgrounds";

describe("shop backgrounds", () => {
  it("automatically matches each built-in shop type", () => {
    for (const category of ["food", "provisions", "pharmacy", "clinic", "school", "fashion", "electronics", "mechanic", "services", "police", "fireservice", "hotel", "shop"]) {
      expect(shopBackgroundCategory(category)).toBe(category);
      expect(automaticShopBackground(category)).toMatch(/^\/__l5e\/assets-v1\//);
    }
    expect(automaticShopBackground("mechanic")).not.toBe(automaticShopBackground("fashion"));
  });
  it("matches owner-written shop types and falls back for unknown types", () => {
    expect(shopBackgroundCategory("Auto repair garage")).toBe("mechanic");
    expect(shopBackgroundCategory("Beauty Salon")).toBe("fashion");
    expect(shopBackgroundCategory("Guest House")).toBe("hotel");
    expect(shopBackgroundCategory("Chemist")).toBe("pharmacy");
    expect(shopBackgroundCategory("Other business")).toBe("shop");
  });
  it("keeps a custom photo ahead of automatic matching and restores automatic when removed", () => {
    expect(resolvedShopBackground("food", "/custom-photo.webp")).toBe("/custom-photo.webp");
    expect(resolvedShopBackground("food", null)).toBe(automaticShopBackground("food"));
  });
  it("preserves clear custom backgrounds by default and accepts adjustable blur", () => {
    expect(backgroundBlur(undefined)).toBe(0);
    expect(backgroundBlur(8)).toBe(8);
    expect(backgroundBlur(-2)).toBe(0);
    expect(backgroundBlur(30)).toBe(20);
  });
});