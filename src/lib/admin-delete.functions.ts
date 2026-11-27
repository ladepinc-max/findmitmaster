import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Kind = "shop" | "supplier" | "news" | "news_and_community";

async function assertAdmin(supabase: any, userId: string) {
  const [{ data: superAdmin }, { data: admin }] = await Promise.all([
    supabase.rpc("is_super_admin"),
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
  ]);
  if (!superAdmin && !admin) throw new Error("Admins only");
}

/** Admin-only permanent removal of a shop, supplier, or community news item (optionally with its community chat page). */
export const adminDelete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { kind: Kind; id: string }) => {
    if (!["shop", "supplier", "news", "news_and_community"].includes(input.kind)) throw new Error("Bad kind");
    if (!/^[0-9a-f-]{36}$/i.test(input.id)) throw new Error("Bad id");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    if (data.kind === "shop") {
      const { error } = await db.from("shops").delete().eq("id", data.id);
      if (error) throw new Error(error.message);
    } else if (data.kind === "supplier") {
      const { error } = await db.from("suppliers").delete().eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { data: news } = await db.from("community_news").select("community_id").eq("id", data.id).maybeSingle();
      const { error } = await db.from("community_news").delete().eq("id", data.id);
      if (error) throw new Error(error.message);
      if (data.kind === "news_and_community" && news?.community_id) {
        await db.from("community_news").delete().eq("community_id", news.community_id);
        const { error: cErr } = await db.from("communities").delete().eq("id", news.community_id);
        if (cErr) throw new Error(cErr.message);
      }
    }
    return { ok: true };
  });
