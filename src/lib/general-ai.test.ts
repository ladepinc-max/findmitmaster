import { describe, expect, it } from "vitest";
import { conversationHistory, generalChatSchema, readSseData } from "./general-ai";
import type { UIMessage } from "ai";

describe("General AI continuity", () => {
  it("keeps all prior turns, including details beyond the previous ten-turn window", () => {
    const messages: UIMessage[] = Array.from({ length: 24 }, (_, i) => ({
      id: String(i),
      role: i % 2 ? "assistant" : "user",
      parts: [
        { type: "text", text: i === 0 ? "My topic is growing cocoa in Ghana." : `Turn ${i}` },
      ],
    }));
    const history = conversationHistory(messages);
    expect(history).toHaveLength(24);
    expect(history[0]?.content).toBe("My topic is growing cocoa in Ghana.");
    expect(generalChatSchema.parse({ question: "Why?", history }).history).toEqual(history);
  });
  it("preserves long answers rather than cutting off their final follow-up", () => {
    const content = "A".repeat(4500) + "Would you like to explore planting next?";
    const history = conversationHistory([
      { id: "1", role: "assistant", parts: [{ type: "text", text: content }] },
    ]);
    expect(generalChatSchema.parse({ question: "Yes", history }).history[0]?.content).toBe(content);
  });
});

describe("incremental reply delivery", () => {
  it("delivers each line before the stream finishes, retaining split UTF-8 text", async () => {
    let push: ReadableStreamDefaultController<Uint8Array> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        push = controller;
      },
    });
    const iterator = readSseData(stream);
    const bytes = new TextEncoder().encode('data: {"text":"Hello ₵"}\r\n\r\n');
    push?.enqueue(bytes.slice(0, 23));
    push?.enqueue(bytes.slice(23));
    expect((await iterator.next()).value).toBe('{"text":"Hello ₵"}');
    push?.enqueue(new TextEncoder().encode('data: {"text":"Next line"}\n\n'));
    expect((await iterator.next()).value).toBe('{"text":"Next line"}');
    push?.close();
    expect((await iterator.next()).done).toBe(true);
  });
});
