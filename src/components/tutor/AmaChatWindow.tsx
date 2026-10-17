import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { UIMessage } from "ai";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AmaAvatar } from "@/components/tutor/AmaAvatar";
import { TeacherText } from "@/components/tutor/TeacherText";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { supabase } from "@/integrations/supabase/client";
import { amaSpeech } from "@/lib/ama-voice";
import { conversationHistory, readSseData, type GeneralChatEvent } from "@/lib/general-ai";
import {
  clearTutorChat,
  fetchTutorChat,
  saveTutorMessage,
  useTutorSettings,
  type TutorWebSource,
} from "@/lib/tutor";

type GeneralMessage = UIMessage & { sources: TutorWebSource[] };
const SUGGESTIONS = [
  "Why do prices rise?",
  "How can I learn a new skill?",
  "Tell me about the world today",
];

export function AmaChatWindow({ userId, onBack }: { userId: string; onBack: () => void }) {
  const navigate = useNavigate();
  const { settings } = useTutorSettings();
  const [messages, setMessages] = useState<GeneralMessage[]>([]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"ready" | "submitted" | "streaming" | "error">("ready");
  const [loaded, setLoaded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    let active = true;
    amaSpeech.stop();
    setLoaded(false);
    void fetchTutorChat(userId)
      .then((rows) => {
        if (!active) return;
        setMessages(
          rows.map((row) => ({
            id: row.id,
            role: row.role,
            parts: [{ type: "text", text: row.content }],
            sources: row.web_sources,
          })),
        );
        setLoaded(true);
      })
      .catch(() => {
        if (active) toast.error("Could not load your conversation. Please reopen General AI.");
      });
    return () => {
      active = false;
      abortRef.current?.abort();
    };
  }, [userId]);

  useEffect(() => {
    if (!busy) textareaRef.current?.focus();
  }, [busy, loaded]);

  const send = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || busyRef.current || !loaded) return;
      busyRef.current = true;
      const controller = new AbortController();
      abortRef.current = controller;
      const id = crypto.randomUUID();
      const mine: GeneralMessage = {
        id,
        role: "user",
        parts: [{ type: "text", text: trimmed }],
        sources: [],
      };
      setMessages((previous) => [...previous, mine]);
      setText("");
      setStatus("submitted");
      textareaRef.current?.focus();
      const replyId = crypto.randomUUID();
      let answer = "";
      let sources: TutorWebSource[] = [];
      let completed = false;
      try {
        await saveTutorMessage(userId, "user", trimmed);
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) throw new Error("Please sign in again to continue.");
        const response = await fetch("/api/general-ai", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            question: trimmed,
            history: conversationHistory(messages),
            tutorName: settings.tutor_name,
            language: settings.language,
          }),
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          const failure = await response
            .json()
            .catch(() => ({ error: "Could not reach General AI." }));
          throw new Error(failure.error ?? "Could not reach General AI.");
        }
        const update = () =>
          setMessages((previous) => {
            const reply: GeneralMessage = {
              id: replyId,
              role: "assistant",
              parts: [{ type: "text", text: answer }],
              sources,
            };
            return previous.some((message) => message.id === replyId)
              ? previous.map((message) => (message.id === replyId ? reply : message))
              : [...previous, reply];
          });
        for await (const frame of readSseData(response.body)) {
          const event = JSON.parse(frame) as GeneralChatEvent;
          if (event.type === "sources") sources = event.sources;
          if (event.type === "text") {
            answer += event.text;
            setStatus("streaming");
            update();
          }
          if (event.type === "error") throw new Error(event.message);
          if (event.type === "done") completed = true;
        }
        if (!completed || !answer.trim())
          throw new Error("The reply was interrupted. Please try again.");
        await saveTutorMessage(userId, "assistant", answer, sources);
        setStatus("ready");
      } catch (error) {
        if (!controller.signal.aborted) {
          toast.error(error instanceof Error ? error.message : "Could not reach General AI.");
          setStatus("error");
          if (!answer) setText(trimmed);
        } else setStatus("ready");
      } finally {
        busyRef.current = false;
        abortRef.current = null;
        textareaRef.current?.focus();
      }
    },
    [loaded, messages, settings.language, settings.tutor_name, userId],
  );

  const clearAll = useCallback(async () => {
    if (busyRef.current) return;
    try {
      await clearTutorChat(userId);
      setMessages([]);
      textareaRef.current?.focus();
    } catch {
      toast.error("Could not clear your conversation.");
    }
  }, [userId]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-wa-panel">
      <header className="flex shrink-0 items-center gap-2 border-b border-wa-divider bg-card px-3 py-2">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back">
          <ArrowLeft className="size-5" />
        </Button>
        <AmaAvatar src={settings.avatar_url} name={settings.tutor_name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{settings.tutor_name}</p>
          <p className="truncate text-xs text-muted-foreground">General AI</p>
        </div>
        <Button
          size="sm"
          className="h-8 shrink-0 px-2 text-xs font-bold"
          onClick={() => void navigate({ to: "/tutor" })}
        >
          CLASSROOM
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={busy || !loaded}
          onClick={() => void clearAll()}
          aria-label="Clear conversation"
          title="Clear conversation"
        >
          <Trash2 className="size-4" />
        </Button>
      </header>
      <Conversation className="min-h-0">
        <ConversationContent className="gap-4 px-3 py-4">
          {!loaded ? <Shimmer>Loading conversation…</Shimmer> : null}
          {loaded && messages.length === 0 ? (
            <div className="mx-auto max-w-sm py-6 text-center">
              <AmaAvatar src={settings.avatar_url} name={settings.tutor_name} className="mx-auto" />
              <p className="mt-3 text-sm text-foreground">
                Hello, I’m {settings.tutor_name}. What’s on your mind?
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <Button
                    key={suggestion}
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    className="h-auto whitespace-normal text-left"
                    onClick={() => void send(suggestion)}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
          {messages.map((message, index) => (
            <Message key={message.id} from={message.role} data-message-role={message.role}>
              <MessageContent className="group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground">
                {message.parts.map((part, partIndex) =>
                  part.type === "text" ? (
                    message.role === "assistant" ? (
                      <TeacherText
                        key={partIndex}
                        text={part.text}
                        renderText={(value) => (
                          <MessageResponse
                            isAnimating={status === "streaming" && index === messages.length - 1}
                          >
                            {value}
                          </MessageResponse>
                        )}
                      />
                    ) : (
                      <p key={partIndex} className="whitespace-pre-wrap break-words">
                        {part.text}
                      </p>
                    )
                  ) : null,
                )}
                {message.sources.length ? (
                  <div className="mt-2 flex flex-col gap-1">
                    {message.sources.map((source) => (
                      <a
                        key={source.url}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="break-words text-xs text-primary underline"
                      >
                        {source.title}
                      </a>
                    ))}
                  </div>
                ) : null}
              </MessageContent>
            </Message>
          ))}
          {status === "submitted" ? (
            <Shimmer>{`${settings.tutor_name} is thinking…`}</Shimmer>
          ) : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="shrink-0 border-t border-wa-divider bg-card px-3 py-2">
        <PromptInput onSubmit={({ text: question }) => send(question)}>
          <PromptInputTextarea
            ref={textareaRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={`Ask ${settings.tutor_name} anything`}
            aria-label="Your message"
            maxLength={2000}
            autoFocus
            className="max-h-28 min-h-12"
          />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit
              status={status}
              disabled={!loaded || (!busy && !text.trim())}
              onStop={() => abortRef.current?.abort()}
              aria-label={busy ? "Stop response" : "Send"}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
