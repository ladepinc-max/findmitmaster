import { afterEach, describe, expect, it, vi } from "vitest";
import { avatarImageKey, clearInterfaceImages, readInterfaceImage, refreshInterfaceImage } from "./interface-image-cache";

afterEach(() => vi.unstubAllGlobals());

function storage() {
  const entries = new Map<string, Response>();
  vi.stubGlobal("window", { location: { origin: "https://findmit.world" } });
  vi.stubGlobal("caches", {
    open: async () => ({
      match: async (request: Request) => entries.get(request.url)?.clone(),
      put: async (request: Request, response: Response) => { entries.set(request.url, response); },
    }),
    delete: async () => { entries.clear(); return true; },
  });
  vi.stubGlobal("fetch", vi.fn(async () => new Response("new image", { headers: { "Content-Type": "image/png" } })));
  return entries;
}

describe("interface image persistence", () => {
  it("replaces old bytes when a fixed image changes, keeping one entry", async () => {
    const entries = storage();
    await refreshInterfaceImage("community-map-button", "/old.jpg", async () => "/old.jpg");
    await refreshInterfaceImage("community-map-button", "/new.jpg", async () => "/new.jpg");
    expect(entries.size).toBe(1);
    expect(await readInterfaceImage("community-map-button", "/old.jpg")).toBeNull();
    expect(await (await readInterfaceImage("community-map-button", "/new.jpg"))?.text()).toBe("new image");
  });
  it("keeps a previously downloaded logo readable when the network fails", async () => {
    storage();
    await refreshInterfaceImage("findmit-full-logo", "/logo.png", async () => "/logo.png");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await refreshInterfaceImage("findmit-full-logo", "/logo.png", async () => "/logo.png")).toBeNull();
    expect(await (await readInterfaceImage("findmit-full-logo", "/logo.png"))?.text()).toBe("new image");
  });
  it("puts changed profile pictures into the same owner slot", () => {
    expect(avatarImageKey("owner-id/avatar-100.jpg")).toBe("avatar:owner-id");
    expect(avatarImageKey("owner-id/avatar-200.png")).toBe("avatar:owner-id");
    expect(avatarImageKey("other-id/avatar-200.png")).toBe("avatar:other-id");
  });
  it("clears saved images on sign-out", async () => {
    const entries = storage();
    await refreshInterfaceImage("avatar:owner-id", "owner-id/avatar-100.jpg", async () => "/photo.jpg");
    await clearInterfaceImages();
    expect(entries.size).toBe(0);
  });
});