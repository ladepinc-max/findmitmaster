import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKETS = ["avatars", "posts", "cvs", "chat-media"] as const;

/** Permanently deletes the signed-in user's account, stored files and all related rows. */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    // Remove the user's files from every bucket (files live under `${userId}/`).
    for (const bucket of BUCKETS) {
      const { data } = await supabaseAdmin.storage.from(bucket).list(userId, { limit: 1000 });
      const paths = (data ?? [])
        .filter((entry) => entry.name)
        .map((entry) => `${userId}/${entry.name}`);
      if (paths.length) {
        await supabaseAdmin.storage.from(bucket).remove(paths);
      }
    }

    // Deleting the auth user cascades through profiles and every related table
    // (posts, comments, likes, saves, follows, chats, messages, calls, jobs,
    // talent profiles, applications, alerts, notifications, live sessions).
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);

    return { ok: true } as const;
  });
