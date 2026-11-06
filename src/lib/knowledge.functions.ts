import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { evaluateMath, parseForexQuery } from "./quick-answer";

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export type QuickAnswer =
  | { kind: "forex"; amount: number; from: string; to: string; rate: number; result: number; updated: string }
  | { kind: "math"; expression: string; result: number };

/** Searches FindMit's own library and computes instant answers (rates, maths). */
export const searchKnowledge = createServerFn({ method: "POST" })
  .inputValidator((d: { q: string }) => ({ q: String(d?.q ?? "").slice(0, 200) }))
  .handler(async ({ data }) => {
    const { searchKnowledgeDb } = await import("./knowledge.server");
    const q = data.q.trim();
    let quick: QuickAnswer | null = null;
    const math = evaluateMath(q);
    if (math !== null) quick = { kind: "math", expression: q, result: math };
    const fx = parseForexQuery(q);
    if (fx) {
      try {
        const r = await fetch(`https://open.er-api.com/v6/latest/${fx.from}`);
        const j = (await r.json()) as { rates?: Record<string, number>; time_last_update_utc?: string };
        const rate = j.rates?.[fx.to];
        if (rate) quick = { kind: "forex", ...fx, rate, result: Math.round(rate * fx.amount * 100) / 100, updated: j.time_last_update_utc ?? "" };
      } catch (e) {
        console.error("forex failed", e);
      }
    }
    const hits = fx || math !== null ? [] : await searchKnowledgeDb(publicClient(), q, 6);
    return {
      quick,
      hits: hits.map((h) => ({ ...h, content: "", summary: h.summary.slice(0, 300) })),
    };
  });

/** Admin: run the crawler now and see how big the library is. */
export const runKnowledgeCrawl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { topics?: string[] }) => ({
    topics: (d?.topics ?? []).map((t) => String(t).trim().slice(0, 120)).filter(Boolean).slice(0, 20),
  }))
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("is_super_admin");
    if (!ok) throw new Error("Only admins can run the crawler");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runCrawl } = await import("./knowledge.server");
    return runCrawl(supabaseAdmin, { topics: data.topics });
  });

/** Evergreen library articles (never news) for saving on the phone; pages of 200, newest first. */
export const getLibrarySnapshot = createServerFn({ method: "POST" })
  .inputValidator((d: { since?: string | null; offset?: number }) => ({
    since: d?.since ? String(d.since) : null,
    offset: Math.max(0, Number(d?.offset ?? 0) | 0),
  }))
  .handler(async ({ data }) => {
    let q = publicClient()
      .from("crawled_knowledge")
      .select("id,title,summary,content,category,source_name,source_url,image_url,crawled_at")
      .eq("is_evergreen", true)
      .neq("category", "news")
      .order("crawled_at", { ascending: false })
      .range(data.offset, data.offset + 199);
    if (data.since) q = q.gt("crawled_at", data.since);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** One library article for the in-app reader. */
export const getLibraryArticle = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => ({ id: String(d?.id ?? "").slice(0, 64) }))
  .handler(async ({ data }) => {
    const { data: row } = await publicClient()
      .from("crawled_knowledge")
      .select("id,title,summary,content,category,source_name,source_url,image_url,crawled_at")
      .eq("id", data.id)
      .maybeSingle();
    return row;
  });
