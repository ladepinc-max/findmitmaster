import { describe, expect, it } from "vitest";
import { breadcrumb, highlight } from "./serp";

describe("serp", () => {
  it("builds a site › path breadcrumb", () => {
    expect(breadcrumb("https://www.example.com/news/top-story")).toEqual({ host: "example.com", path: ["news", "top story"] });
  });
  it("marks query words in snippets", () => {
    expect(highlight("Best Ghana jollof", "ghana food").filter((s) => s.hit).map((s) => s.t)).toEqual(["Ghana"]);
  });
});
