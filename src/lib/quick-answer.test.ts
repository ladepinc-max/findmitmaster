import { describe, expect, it } from "vitest";
import { evaluateMath, parseForexQuery } from "./quick-answer";

describe("quick answers", () => {
  it("reads currency pairs with amounts", () => {
    expect(parseForexQuery("100 usd to ghs")).toEqual({ amount: 100, from: "USD", to: "GHS" });
    expect(parseForexQuery("cedi to dollar")).toEqual({ amount: 1, from: "GHS", to: "USD" });
  });
  it("treats 'dollar rate' as dollar to cedi", () => {
    expect(parseForexQuery("dollar rate")).toEqual({ amount: 1, from: "USD", to: "GHS" });
  });
  it("ignores normal searches", () => {
    expect(parseForexQuery("kwame nkrumah")).toBeNull();
    expect(evaluateMath("kwame")).toBeNull();
  });
  it("does maths with percentages", () => {
    expect(evaluateMath("500 * 15%")).toBe(75);
    expect(evaluateMath("(20+5)/2")).toBe(12.5);
  });
});
