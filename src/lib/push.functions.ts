import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/firebase_messaging";

const sendPushInput = z.object({
  userId: z.string(),
  title: z.string(),
  body: z.string(),
  url: z.string(),
  tag: z.string().optional(),
  actions: z
    .array(z.object({ action: z.string(), title: z.string() }))
    .optional(),
  classId: z.string().optional(),
});

interface DeliverInput {
  userId: string;
  title: string;
  body: string;
  url: string;
  tag?: string | undefined;
  actions?: { action: string; title: string }[] | undefined;
  classId?: string | undefined;
}

/** Delivers one notification to every FCM device a user has registered. */
async function deliverPush(input: DeliverInput): Promise<{ sent: number }> {
  const lovableApiKey = process.env["LOVABLE_API_KEY"];
  const connectorApiKey = process.env["FIREBASE_MESSAGING_API_KEY"];
  if (!lovableApiKey || !connectorApiKey) {
    console.warn("Push gateway is not configured; skipping notification");
    return { sent: 0 };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("token, platform")
    .eq("user_id", input.userId);
  if (error) throw error;

  const tokens = ((rows ?? []) as { token: string; platform: string }[])
    .filter((r) => r.platform === "fcm")
    .map((r) => r.token);
  if (!tokens.length) return { sent: 0 };

  const headers = {
    Authorization: `Bearer ${lovableApiKey}`,
    "X-Connection-Api-Key": connectorApiKey,
    "Content-Type": "application/json",
  };

  let sent = 0;
  for (const token of tokens) {
    const res = await fetch(`${GATEWAY_URL}/v1/projects/_/messages:send`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message: {
          token,
          notification: { title: input.title, body: input.body },
          data: {
            url: input.url,
            ...(input.tag ? { tag: input.tag } : {}),
            ...(input.classId ? { classId: input.classId } : {}),
            ...(input.actions ? { actions: JSON.stringify(input.actions) } : {}),
          },
          webpush: {
            fcm_options: { link: input.url },
          },
        },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`FCM send failed [${res.status}]: ${text}`);
      if (text.includes("UNREGISTERED") || text.includes("INVALID_ARGUMENT")) {
        await supabaseAdmin.from("push_subscriptions").delete().eq("token", token);
      }
      continue;
    }
    sent++;
  }
  return { sent };
}

/**
 * Sends an FCM push notification to every device registered by a user.
 * Uses the Lovable connector gateway so the app never sees the service account.
 */
export const sendPushToUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => sendPushInput.parse(data))
  .handler(async ({ data }) => deliverPush(data));

const jobMatchInput = z.object({ jobId: z.string() });

/**
 * Pushes "new job match" alerts. The database trigger writes one
 * job_notifications row per matching saved alert; we deliver each of them.
 */
export const sendJobMatchPushes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => jobMatchInput.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("job_notifications")
      .select("user_id, title, body, job_id")
      .eq("job_id", data.jobId);
    if (error) throw error;

    const notifications = (rows ?? []) as {
      user_id: string;
      title: string | null;
      body: string | null;
    }[];
    let sent = 0;
    for (const row of notifications) {
      const result = await deliverPush({
        userId: row.user_id,
        title: row.title ?? "New job match",
        body: row.body ?? "A new job matches your saved alert",
        url: `/jobs?job=${data.jobId}`,
        tag: `job-${data.jobId}`,
      });
      sent += result.sent;
    }
    return { sent, matches: notifications.length };
  });
