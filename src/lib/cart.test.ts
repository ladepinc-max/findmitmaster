import { describe, expect, it } from "vitest";
import { addToCart, cartCount, cartTotal, setCartQty } from "./cart";

describe("cart", () => {
  it("totals each product by its own price and quantity", () => {
    let c = addToCart([], { id: "a", name: "Rice", price_ghc: 25 });
    c = addToCart(c, { id: "a", name: "Rice", price_ghc: 25 });
    c = addToCart(c, { id: "b", name: "Oil", price_ghc: 12.5 });
    expect(cartCount(c)).toBe(3);
    expect(cartTotal(c)).toBe(62.5);
  });
  it("removes an item when quantity drops to zero", () => {
    const c = setCartQty(addToCart([], { id: "a", name: "Rice", price_ghc: 25 }), "a", 0);
    expect(c).toEqual([]);
    expect(cartTotal(c)).toBe(0);
  });
});
