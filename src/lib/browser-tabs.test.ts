import { describe, expect, it } from "vitest";
import { closeTab, currentUrl, dayGroup, navigateTab, newTab, openTab, recordVisit, HISTORY_LIMIT } from "./browser-tabs";

describe("browser tabs", () => {
  it("opens a new tab and makes it active", () => {
    const a = newTab("https://a.com");
    const s = openTab({ tabs: [a], activeId: a.id }, "https://b.com");
    expect(s.tabs).toHaveLength(2);
    expect(currentUrl(s.tabs.find((t) => t.id === s.activeId)!)).toBe("https://b.com");
  });
  it("closing the active tab activates its neighbour; closing the last returns null", () => {
    const a = newTab("a");
    const s = openTab({ tabs: [a], activeId: a.id }, "b");
    const after = closeTab(s, s.activeId)!;
    expect(after.activeId).toBe(a.id);
    expect(closeTab(after, a.id)).toBeNull();
  });
  it("navigating drops forward history", () => {
    let t = navigateTab(navigateTab(newTab("a"), "b"), "c");
    t = { ...t, index: 0 };
    expect(navigateTab(t, "d").history).toEqual(["a", "d"]);
  });
});

describe("history", () => {
  it("dedupes consecutive visits and caps at 500", () => {
    let h = recordVisit([], "x", 1);
    h = recordVisit(h, "x", 2);
    expect(h).toEqual([{ url: "x", at: 2 }]);
    for (let i = 0; i < 600; i++) h = recordVisit(h, `u${i}`);
    expect(h).toHaveLength(HISTORY_LIMIT);
  });
  it("groups by day", () => {
    const now = new Date(2026, 10, 6, 12).getTime();
    expect(dayGroup(now - 3600000, now)).toBe("Today");
    expect(dayGroup(now - 86400000, now)).toBe("Yesterday");
    expect(dayGroup(now - 3 * 86400000, now)).toBe("Earlier");
  });
});
