import { createServerFn } from "@tanstack/react-start";
import { frameBlockedByHeaders } from "./frame-policy";

/** Asks the site itself whether it allows being shown inside another app. */
export const checkFrameable = createServerFn({ method: "POST" })
  .validator((d: { url: string }) => ({ url: String(d?.url ?? "").slice(0, 2000) }))
  .handler(async ({ data }): Promise<{ blocked: boolean }> => {
    if (!/^https?:\/\//i.test(data.url)) return { blocked: false };
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(data.url, {
        method: "GET",
        redirect: "follow",
        signal: ctrl.signal,
        headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36" },
      });
      clearTimeout(timer);
      const blocked = frameBlockedByHeaders(res.headers.get("x-frame-options"), res.headers.get("content-security-policy"));
      void res.body?.cancel();
      return { blocked };
    } catch {
      return { blocked: false };
    }
  });
