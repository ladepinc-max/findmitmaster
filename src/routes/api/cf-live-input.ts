import { createFileRoute } from "@tanstack/react-router";

/**
 * Cloudflare Stream Live input for a classroom.
 *
 * The teacher's browser publishes ONE copy of the lesson here over WHIP
 * (WebRTC). Cloudflare then fans it out to every watching student as cheap,
 * cached 360p HLS — so only the teacher and the student on stage ever use
 * real-time (Calls) bandwidth.
 */

const API = "https://api.cloudflare.com/client/v4";

interface LiveInput {
  uid: string;
  webRTC?: { url?: string };
  webRTCPlayback?: { url?: string };
}

/** HLS playback lives on the same customer subdomain as the WHIP endpoint. */
function playbackUrls(input: LiveInput) {
  const whipUrl = input.webRTC?.url ?? null;
  let host: string | null = null;
  try {
    if (whipUrl) host = new URL(whipUrl).host;
  } catch {
    host = null;
  }
  return {
    whipUrl,
    hlsUrl: host ? `https://${host}/${input.uid}/manifest/video.m3u8` : null,
    whepUrl: input.webRTCPlayback?.url ?? null,
  };
}

export const Route = createFileRoute("/api/cf-live-input")({
  server: {
    handlers: {
      GET: () =>
        Response.json({
          configured: Boolean(
            process.env["CLOUDFLARE_ACCOUNT_ID"] && process.env["CLOUDFLARE_API_TOKEN"],
          ),
        }),

      POST: async ({ request }) => {
        const accountId = process.env["CLOUDFLARE_ACCOUNT_ID"];
        const token = process.env["CLOUDFLARE_API_TOKEN"];
        if (!accountId || !token) {
          return Response.json({ error: "Cloudflare Stream is not configured" }, { status: 503 });
        }

        let body: { name?: string; existingUid?: string | null };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          body = {};
        }

        const auth = { Authorization: `Bearer ${token}` };

        // Reuse the class's existing live input when it is still there.
        if (body.existingUid) {
          const found = await fetch(
            `${API}/accounts/${accountId}/stream/live_inputs/${body.existingUid}`,
            { headers: auth },
          );
          if (found.ok) {
            const json = (await found.json()) as { result?: LiveInput };
            if (json.result?.uid) {
              return Response.json({ uid: json.result.uid, ...playbackUrls(json.result) });
            }
          }
        }

        const created = await fetch(`${API}/accounts/${accountId}/stream/live_inputs`, {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify({
            meta: { name: body.name?.slice(0, 80) ?? "FindMit live class" },
            recording: { mode: "off" },
          }),
        });

        const json = (await created.json()) as { result?: LiveInput; errors?: unknown };
        if (!created.ok || !json.result?.uid) {
          return Response.json(
            { error: "Cloudflare rejected the live input", detail: json.errors ?? null },
            { status: 502 },
          );
        }

        return Response.json({ uid: json.result.uid, ...playbackUrls(json.result) });
      },
    },
  },
});
