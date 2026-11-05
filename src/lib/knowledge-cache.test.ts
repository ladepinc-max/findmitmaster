import { describe, expect, it } from "vitest";
import { KNOWLEDGE_CACHE_LIMIT_BYTES, evictionPlan, stripVideos } from "./knowledge-cache";

const MB = 1024 * 1024;

describe("library cache on phone", () => {
  it("limit is 100 MB", () => {
    expect(KNOWLEDGE_CACHE_LIMIT_BYTES).toBe(100 * MB);
  });
  it("removes oldest entries once over 100 MB", () => {
    const drop = evictionPlan([
      { q: "old", size: 40 * MB, at: 1 },
      { q: "mid", size: 40 * MB, at: 2 },
      { q: "new", size: 40 * MB, at: 3 },
    ]);
    expect(drop).toEqual(["old"]);
  });
  it("keeps everything under 100 MB", () => {
    expect(evictionPlan([{ q: "a", size: 99 * MB, at: 1 }])).toEqual([]);
  });
  it("never stores videos", () => {
    const base = { id: "1", title: "t", summary: "s", category: "c", source_name: "n", image_url: null };
    const out = stripVideos([
      { ...base, source_url: "https://youtube.com/watch?v=1" },
      { ...base, id: "2", source_url: "https://ghana.gov.gh/page" },
    ]);
    expect(out.map((h) => h.id)).toEqual(["2"]);
  });
});
