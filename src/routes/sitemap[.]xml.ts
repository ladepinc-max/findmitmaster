import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const BASE = "https://findmit.world";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Public sitemap: only content anyone may already see (active shops/suppliers, open jobs, approved news, live adverts). */
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const db = createClient(import.meta.env['VITE_SUPABASE_URL'] as string, import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] as string, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const now = new Date().toISOString();
        const page = async (table: string, cols: string, apply: (q: any) => any) => {
          const out: any[] = [];
          for (let from = 0; ; from += 1000) {
            const { data, error } = await apply((db as any).from(table).select(cols)).range(from, from + 999);
            if (error) throw new Error(`${table}: ${error.message}`);
            out.push(...(data ?? []));
            if (!data || data.length < 1000) break;
          }
          return out;
        };
        const [shops, suppliers, jobs, news, ads] = await Promise.all([
          page("shops", "handle, updated_at", (q) => q.eq("subscription_status", "active").gt("subscription_expires_at", now)),
          page("suppliers", "id, updated_at", (q) => q.eq("subscription_status", "active").gt("subscription_expires_at", now)),
          page("jobs", "id, updated_at", (q) => q.eq("is_open", true)),
          page("community_news", "id", (q) => q.eq("status", "approved")),
          page("shop_ads", "id, created_at", (q) => q.eq("status", "active").gt("expires_at", now)),
        ]);
        const urls: { loc: string; lastmod?: string }[] = [
          { loc: "/home" }, { loc: "/jobs" }, { loc: "/shops" }, { loc: "/news" },
          ...shops.map((s) => ({ loc: `/@${encodeURIComponent(s.handle)}`, lastmod: s.updated_at })),
          ...suppliers.map((s) => ({ loc: `/supplier/${s.id}`, lastmod: s.updated_at })),
          ...jobs.map((j) => ({ loc: `/job/${j.id}`, lastmod: j.updated_at })),
          ...news.map((n) => ({ loc: `/community-news/${n.id}` })),
          ...ads.map((a) => ({ loc: `/ad/${a.id}`, lastmod: a.created_at })),
        ];
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
          .map((u) => `  <url><loc>${esc(BASE + u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod.slice(0, 10)}</lastmod>` : ""}</url>`)
          .join("\n")}\n</urlset>`;
        return new Response(xml, { headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" } });
      },
    },
  },
});
