import { describe, expect, it } from "vitest";
import { adSlotsFor, matchesTab, stripTags } from "./news";

describe("news reader", () => {
  it("places the first in-article ad after the 3rd paragraph, then every 4", () => {
    expect(adSlotsFor(12)).toEqual([2, 6, 10]);
  });
  it("shows no ads for very short stories", () => {
    expect(adSlotsFor(2)).toEqual([]);
  });
  it("puts football stories under Sports", () => {
    const item = { title: "Black Stars win", url: "x", source: "s", image: null, publishedAt: null, categories: [] };
    expect(matchesTab(item, "Sports")).toBe(true);
    expect(matchesTab(item, "Politics")).toBe(false);
  });
  it("cleans publisher HTML", () => {
    expect(stripTags("<p>Hello &amp; <b>welcome</b></p>")).toBe("Hello & welcome");
  });
});
