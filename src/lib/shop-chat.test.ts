import { describe, expect, it } from "vitest";
import { activeProductCount, shopThreads } from "./shop-chat";
import type { ConversationSummary } from "./chat";

describe("shop metrics", () => {
  it("counts only products in stock", () => {
    expect(activeProductCount([{ is_available: true }, { is_available: false }, { is_available: true }])).toBe(2);
  });
  it("keeps personal conversations out of shop unread totals", () => {
    const threads = [{ id: "shop", unread: 2 }, { id: "personal", unread: 7 }] as ConversationSummary[];
    expect(shopThreads(threads, ["shop"]).reduce((sum, thread) => sum + thread.unread, 0)).toBe(2);
  });
});