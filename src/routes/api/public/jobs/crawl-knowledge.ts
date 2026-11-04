import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/jobs/crawl-knowledge")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runCrawl } = await import("@/lib/knowledge.server");
        const result = await runCrawl(supabaseAdmin);
        return Response.json({ success: true, ...result });
      },
    },
  },
});
