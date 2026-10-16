import { createFileRoute } from "@tanstack/react-router";

/**
 * Cloudflare Stream — Direct Creator Upload.
 *
 * The browser asks this route for a one-time upload URL, then sends the video
 * file straight to Cloudflare's edge. Cloudflare transcodes it to adaptive HLS
 * (we cap playback at 360p on the player side) and serves it from its CDN, so
 * the app never stores or streams heavy MP4 files itself.
 *
 * Account ID and API token stay on the server; the browser never sees them.
 */
const API = "https://api.cloudflare.com/client/v4";

export const Route = createFileRoute("/api/cf-stream-upload")({
  server: {
    handlers: {
      GET: () => {
        const configured = Boolean(
          process.env["CLOUDFLARE_ACCOUNT_ID"] && process.env["CLOUDFLARE_API_TOKEN"],
        );
        return Response.json({ configured });
      },
      POST: async ({ request }) => {
        const accountId = process.env["CLOUDFLARE_ACCOUNT_ID"];
        const token = process.env["CLOUDFLARE_API_TOKEN"];
        if (!accountId || !token) {
          return Response.json({ error: "Cloudflare Stream is not configured" }, { status: 503 });
        }

        let body: { name?: string; maxDurationSeconds?: number } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          body = {};
        }

        // Cloudflare needs an upper bound; clamp to a sane lesson length.
        const maxDurationSeconds = Math.min(
          21600,
          Math.max(60, Math.round(body.maxDurationSeconds ?? 7200)),
        );

        const response = await fetch(`${API}/accounts/${accountId}/stream/direct_upload`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            maxDurationSeconds,
            requireSignedURLs: false,
            meta: { name: body.name ?? "FindMit lesson" },
          }),
        });

        const payload = (await response.json()) as {
          success?: boolean;
          errors?: { message?: string }[];
          result?: { uid?: string; uploadURL?: string };
        };

        if (!response.ok || !payload.success || !payload.result?.uploadURL) {
          const message = payload.errors?.[0]?.message ?? "Cloudflare rejected the upload request";
          return Response.json({ error: message }, { status: 502 });
        }

        const uid = payload.result.uid!;
        return Response.json({
          uid,
          uploadURL: payload.result.uploadURL,
          hlsUrl: `https://videodelivery.net/${uid}/manifest/video.m3u8`,
        });
      },
    },
  },
});
