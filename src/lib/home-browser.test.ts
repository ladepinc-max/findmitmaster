import { describe, expect, it } from "vitest";
import { looksLikeUrl, normalizeUrl } from "./home-browser";

describe("browser address bar", () => {
  it("treats ghanaweb.com as a website", () => expect(looksLikeUrl("ghanaweb.com")).toBe(true));
  it("treats a phrase as a search", () => expect(looksLikeUrl("cheap phones accra")).toBe(false));
  it("adds https to bare addresses", () => expect(normalizeUrl("jumia.com.gh")).toBe("https://jumia.com.gh"));
});
