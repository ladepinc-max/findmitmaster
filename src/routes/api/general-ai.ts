import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { generalChatSchema, readSseData, type GeneralChatEvent } from "@/lib/general-ai";

export const Route = createFileRoute("/api/general-ai")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = process.env["SUPABASE_URL"];
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
        const gemini = process.env["GEMINI_API_KEY"];
        if (!url || !key || !gemini)
          return Response.json({ error: "General AI is not configured yet." }, { status: 503 });
        const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
        if (!token) return Response.json({ error: "Please sign in to chat." }, { status: 401 });
        const client = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data: claims, error } = await client.auth.getClaims(token);
        if (error || !claims?.claims.sub)
          return Response.json({ error: "Please sign in again." }, { status: 401 });
        const parsed = generalChatSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success)
          return Response.json({ error: "Please send a valid question." }, { status: 400 });
        try {
          const { prepareGeneralChat } = await import("@/lib/tutor.functions");
          const { messages, sources } = await prepareGeneralChat(parsed.data);
          // Preserve the school's existing Gemini model and key; stream instead of buffering the answer.
          const send = () =>
            fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
              method: "POST",
              headers: { Authorization: `Bearer ${gemini}`, "Content-Type": "application/json" },
              body: JSON.stringify({ model: "gemini-3.5-flash-lite", messages, stream: true }),
              signal: request.signal,
            });
          let upstream = await send();
          for (let i = 0; i < 2 && (upstream.status === 503 || upstream.status === 429); i++) {
            await upstream.body?.cancel();
            await new Promise((resolve) =>
              setTimeout(resolve, 1200 * (i + 1) + Math.random() * 500),
            );
            if (request.signal.aborted) throw new Error("Cancelled");
            upstream = await send();
          }
          if (!upstream.ok || !upstream.body) {
            console.warn("General AI request failed", upstream.status);
            return Response.json(
              {
                error:
                  upstream.status === 429 || upstream.status === 503
                    ? "General AI is busy. Please try again in a moment."
                    : "General AI could not answer right now.",
              },
              { status: 502 },
            );
          }
          const body = upstream.body;
          const encoder = new TextEncoder();
          const stream = new ReadableStream<Uint8Array>({
            async start(controller) {
              const emit = (event: GeneralChatEvent) =>
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
              let completed = false;
              try {
                emit({ type: "sources", sources });
                for await (const frame of readSseData(body)) {
                  if (frame === "[DONE]") {
                    completed = true;
                    break;
                  }
                  const event = JSON.parse(frame) as {
                    error?: unknown;
                    choices?: { delta?: { content?: string }; finish_reason?: string | null }[];
                  };
                  if (event.error) throw new Error("Upstream generation failed");
                  for (const choice of event.choices ?? []) {
                    if (choice.delta?.content) emit({ type: "text", text: choice.delta.content });
                    if (choice.finish_reason) completed = true;
                  }
                }
                if (!completed) throw new Error("Incomplete response");
                emit({ type: "done" });
              } catch {
                if (!request.signal.aborted)
                  emit({
                    type: "error",
                    message: "The reply was interrupted. Your messages are still here.",
                  });
              } finally {
                controller.close();
              }
            },
            cancel() {
              void body.cancel().catch(() => undefined);
            },
          });
          return new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream; charset=utf-8",
              "Cache-Control": "no-store, no-transform",
              "X-Accel-Buffering": "no",
              Connection: "keep-alive",
            },
          });
        } catch {
          return Response.json(
            { error: "General AI could not connect. Please try again." },
            { status: 502 },
          );
        }
      },
    },
  },
});
