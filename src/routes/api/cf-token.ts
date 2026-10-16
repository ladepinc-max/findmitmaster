import { createFileRoute } from "@tanstack/react-router";

/**
 * Cloudflare Realtime (Calls SFU) signalling proxy.
 *
 * The App ID and Secret live only on the server; the browser never sees them.
 * The client posts { action, sessionId, payload, roomId, userId } and this route
 * forwards it to https://rtc.live.cloudflare.com/v1/apps/{APP_ID}/...
 */
const BASE = "https://rtc.live.cloudflare.com/v1/apps";

type Action = "session" | "tracks" | "renegotiate" | "close";

function endpoint(appId: string, action: Action, sessionId?: string) {
  switch (action) {
    case "session":
      return { url: `${BASE}/${appId}/sessions/new`, method: "POST" };
    case "tracks":
      return { url: `${BASE}/${appId}/sessions/${sessionId}/tracks/new`, method: "POST" };
    case "renegotiate":
      return { url: `${BASE}/${appId}/sessions/${sessionId}/renegotiate`, method: "PUT" };
    case "close":
      return { url: `${BASE}/${appId}/sessions/${sessionId}/tracks/close`, method: "PUT" };
  }
}

export const Route = createFileRoute("/api/cf-token")({
  server: {
    handlers: {
      GET: () => {
        const configured = Boolean(
          process.env["CLOUDFLARE_CALLS_APP_ID"] && process.env["CLOUDFLARE_CALLS_SECRET"],
        );
        return Response.json({ configured });
      },
      POST: async ({ request }) => {
        const appId = process.env["CLOUDFLARE_CALLS_APP_ID"];
        const secret = process.env["CLOUDFLARE_CALLS_SECRET"];
        if (!appId || !secret) {
          return Response.json({ error: "Cloudflare Realtime is not configured" }, { status: 503 });
        }

        let body: {
          action?: Action;
          sessionId?: string;
          payload?: unknown;
        };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const action = body.action;
        if (!action || !["session", "tracks", "renegotiate", "close"].includes(action)) {
          return Response.json({ error: "Unknown action" }, { status: 400 });
        }
        if (action !== "session" && !body.sessionId) {
          return Response.json({ error: "sessionId is required" }, { status: 400 });
        }

        const target = endpoint(appId, action, body.sessionId);
        const upstream = await fetch(target.url, {
          method: target.method,
          headers: {
            Authorization: `Bearer ${secret}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(body.payload ?? {}),
        });

        const text = await upstream.text();
        return new Response(text, {
          status: upstream.status,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
