import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Clock, Loader2, Mic, RotateCw, Send, Square, Trash2, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AmaAvatar } from "@/components/tutor/AmaAvatar";
import { TeacherText } from "@/components/tutor/TeacherText";
import { stripDiagrams } from "@/lib/diagrams";
import { LongPressPlay } from "@/components/tutor/LongPressPlay";
import { AmaVoicePicker } from "@/components/tutor/AmaVoicePicker";
import { resolveAmaVoice, speakLong } from "@/lib/ama-voice";
import { chatWithAma, transcribeVoiceNote } from "@/lib/tutor.functions";
import { blobToDataUrl, listNotes, queueNote, removeNote } from "@/lib/voice-outbox";
import {
  clearTutorChat,
  fetchTutorChat,
  saveTutorMessage,
  useTutorSettings,
  type TutorChatMessage,
} from "@/lib/tutor";

const SUGGESTIONS = [
  "Explain photosynthesis simply",
  "Latest WAEC WASSCE update",
  "Give me 3 Core Maths questions",
  "How do I write a good summary?",
];

const SPEAK_KEY = "findmit-ama-speak-aloud";
/** Small pause before the microphone reopens so the phone accepts it. */
const REOPEN_DELAY_MS = 400;

/** Renders the tutor's simple markdown (bold, bullets) as plain readable text. */
function RichText({ text }: { text: string }) {
  const clean = text
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)")
    .replace(/^#{1,6}\s*/gm, "");
  return (
    <>
      {clean.split("\n").map((line, i) => (
        <span key={i} className="block">
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
            part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
              <strong key={j}>{part.slice(2, -2)}</strong>
            ) : (
              <span key={j}>{part.replace(/\*/g, "")}</span>
            ),
          )}
        </span>
      ))}
    </>
  );
}

/** Picks the student's chosen voice, else the closest West African one. */


/** Speech recognition is browser-only and not in the standard TS lib. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRec = any;

export function AmaChatWindow({ userId, onBack }: { userId: string; onBack: () => void }) {
  const { settings } = useTutorSettings();
  const runChat = useServerFn(chatWithAma);
  const [messages, setMessages] = useState<TutorChatMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [speakAloud, setSpeakAloud] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const recRef = useRef<AnyRec>(null);
  const finalRef = useRef("");
  const heardRef = useRef(false);
  const handsFreeRef = useRef(false);
  const speakAloudRef = useRef(false);
  const startMicRef = useRef<() => void>(() => undefined);
  const reopenRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runTranscribe = useServerFn(transcribeVoiceNote);
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const [pending, setPending] = useState<{ id: string; url: string; failed?: boolean }[]>([]);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const flushingRef = useRef(false);

  useEffect(() => {
    speakAloudRef.current = speakAloud;
  }, [speakAloud]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSpeakAloud(window.localStorage.getItem(SPEAK_KEY) === "1");
  }, []);

  // Phones load the voice list lazily; warm it so the Ghanaian voice is ready.
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const warm = () => void window.speechSynthesis.getVoices();
    warm();
    window.speechSynthesis.addEventListener?.("voiceschanged", warm);
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", warm);
  }, []);

  useEffect(() => {
    void fetchTutorChat(userId).then(setMessages).catch(() => undefined);
  }, [userId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, busy]);

  // Stop any voice when the window closes.
  useEffect(
    () => () => {
      handsFreeRef.current = false;
      if (reopenRef.current) clearTimeout(reopenRef.current);
      recRef.current?.stop?.();
      recRef.current = null;
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    },
    [],
  );

  const speakText = useCallback(
    (id: string, content: string, onDone?: () => void) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      setSpeakingId(id);
      // Reads the whole answer, sentence by sentence, so it never stops half way.
      speakLong(content, () => {
        setSpeakingId(null);
        onDone?.();
      });
    },
    [],
  );

  const send = useCallback(
    async (question: string, force = false) => {
      const trimmed = question.trim();
      if (!trimmed || (busy && !force)) return;
      setText("");
      setHeard("");
      setBusy(true);
      const mine: TutorChatMessage = {
        id: `local-${Date.now()}`,
        role: "user",
        content: trimmed,
        web_sources: [],
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, mine]);
      void saveTutorMessage(userId, "user", trimmed);
      try {
        const history = messages.slice(-10).map((m) => ({ role: m.role, content: stripDiagrams(m.content, " [diagram] ").slice(0, 4000) }));
        const res = await runChat({
          data: {
            question: trimmed,
            history,
            tutorName: settings.tutor_name,
            language: settings.language,
          },
        });
        const reply: TutorChatMessage = {
          id: `local-${Date.now()}-a`,
          role: "assistant",
          content: res.answer,
          web_sources: res.sources ?? [],
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, reply]);
        void saveTutorMessage(userId, "assistant", res.answer, res.sources ?? []);
        if (speakAloudRef.current) {
          speakText(reply.id, res.answer, () => {
            if (handsFreeRef.current) reopenRef.current = setTimeout(() => startMicRef.current(), REOPEN_DELAY_MS);
          });
        } else if (handsFreeRef.current) {
          reopenRef.current = setTimeout(() => startMicRef.current(), REOPEN_DELAY_MS);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not reach the tutor");
      } finally {
        setBusy(false);
      }
    },
    [busy, messages, runChat, settings.language, settings.tutor_name, speakText, userId],
  );

  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  const stopMic = useCallback(() => {
    handsFreeRef.current = false;
    if (reopenRef.current) clearTimeout(reopenRef.current);
    reopenRef.current = null;
  }, []);

  // ---- WhatsApp-style voice notes: tap to start, tap to send ----
  const flush = useCallback(async () => {
    if (flushingRef.current || typeof navigator === "undefined" || !navigator.onLine) return;
    flushingRef.current = true;
    try {
      const notes = await listNotes();
      for (const n of notes) {
        try {
          setPending((p) => p.map((x) => (x.id === n.id ? { ...x, failed: false } : x)));
          const audio = await blobToDataUrl(n.blob);
          const { text: said } = await runTranscribe({ data: { audio, mime: n.mime } });
          await removeNote(n.id);
          setPending((p) => p.filter((x) => x.id !== n.id));
          if (said) await sendRef.current(said, true);
          else toast.error("I couldn't hear words in that voice note. Please record again.");
        } catch {
          setPending((p) => p.map((x) => (x.id === n.id ? { ...x, failed: true } : x)));
          break; // still offline or weak — try again later
        }
      }
    } finally {
      flushingRef.current = false;
    }
  }, [runTranscribe]);

  useEffect(() => {
    if (typeof window === "undefined" || !("indexedDB" in window)) return;
    void listNotes()
      .then((notes) => {
        setPending(notes.map((n) => ({ id: n.id, url: URL.createObjectURL(n.blob) })));
        void flush();
      })
      .catch(() => undefined);
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    const t = window.setInterval(() => void flush(), 15000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(t);
    };
  }, [flush]);

  const startRecording = useCallback(async () => {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia || !("MediaRecorder" in window)) {
      toast.error("Your phone does not support voice notes here. Please type instead.");
      return;
    }
    try {
      window.speechSynthesis?.cancel();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) =>
        MediaRecorder.isTypeSupported(m),
      );
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      cancelRef.current = false;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) window.clearInterval(timerRef.current);
        setRecording(false);
        setSecs(0);
        mediaRef.current = null;
        if (cancelRef.current) return;
        const type = (rec.mimeType || mime || "audio/webm").split(";")[0]!.replace("video/", "audio/");
        const blob = new Blob(chunksRef.current, { type });
        if (blob.size < 1500) {
          toast.error("That was too short. Tap the mic, speak, then tap send.");
          return;
        }
        const id = `vn-${Date.now()}`;
        void queueNote({ id, blob, mime: type, createdAt: Date.now() }).then(() => {
          setPending((p) => [...p, { id, url: URL.createObjectURL(blob) }]);
          void flush();
        });
      };
      mediaRef.current = rec;
      rec.start(1000);
      setRecording(true);
      setSecs(0);
      timerRef.current = window.setInterval(() => setSecs((s) => s + 1), 1000);
    } catch {
      toast.error("Microphone is blocked. Allow microphone access and tap the mic again.");
    }
  }, [flush]);

  const sendRecording = useCallback(() => mediaRef.current?.stop(), []);
  const cancelRecording = useCallback(() => {
    cancelRef.current = true;
    mediaRef.current?.stop();
  }, []);

  useEffect(
    () => () => {
      cancelRef.current = true;
      mediaRef.current?.stop();
    },
    [],
  );

  const speak = useCallback(
    (msg: TutorChatMessage) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      if (speakingId === msg.id) {
        window.speechSynthesis.cancel();
        setSpeakingId(null);
        return;
      }
      speakText(msg.id, msg.content);
    },
    [speakText, speakingId],
  );

  const onSpeakAloudChange = useCallback((on: boolean) => {
    setSpeakAloud(on);
    speakAloudRef.current = on;
    if (typeof window !== "undefined") window.localStorage.setItem(SPEAK_KEY, on ? "1" : "0");
    if (!on && typeof window !== "undefined") {
      window.speechSynthesis?.cancel();
      setSpeakingId(null);
    }
  }, []);

  const clearAll = useCallback(async () => {
    await clearTutorChat(userId).catch(() => undefined);
    setMessages([]);
  }, [userId]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-wa-panel">
      <header className="flex items-center gap-3 border-b border-wa-divider bg-card px-3 py-2">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back">
          <ArrowLeft className="size-5" />
        </Button>
        <AmaAvatar src={settings.avatar_url} name={settings.tutor_name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{settings.tutor_name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {listening ? "Listening…" : "Always active · AI tutor"}
          </p>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Volume2 className="size-4" />
          <span className="hidden sm:inline">Speak aloud</span>
          <Switch
            checked={speakAloud}
            onCheckedChange={onSpeakAloudChange}
            aria-label="Speak aloud"
          />
        </label>
        <AmaVoicePicker />

        <Button variant="ghost" size="sm" onClick={() => void clearAll()}>
          Clear
        </Button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4">
        {messages.length === 0 ? (
          <div className="mx-auto max-w-sm rounded-2xl bg-card p-4 text-center shadow-sm">
            <AmaAvatar src={settings.avatar_url} name={settings.tutor_name} className="mx-auto" />
            <p className="mt-3 text-sm text-foreground">{settings.greeting}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="rounded-full border border-border bg-muted px-3 py-1.5 text-xs text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-card-foreground"
              }`}
            >
              {m.role === "assistant" ? (
                <LongPressPlay onPlay={() => speakText(m.id, m.content)}>
                  <div className="whitespace-pre-wrap break-words">
                    <TeacherText text={m.content} renderText={(t) => <RichText text={t} />} />
                  </div>
                </LongPressPlay>
              ) : (
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
              )}
              {m.role === "assistant" ? (
                <div className="mt-2 flex flex-col gap-1">
                  {m.web_sources.length > 0 ? (
                    <div className="flex flex-col gap-0.5">
                      {m.web_sources.map((s) => (
                        <a
                          key={s.url}
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate text-xs text-primary underline"
                        >
                          {s.title}
                        </a>
                      ))}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => speak(m)}
                    className="flex items-center gap-1 self-start text-xs text-muted-foreground"
                  >
                    {speakingId === m.id ? (
                      <Square className="size-3" />
                    ) : (
                      <Volume2 className="size-3" />
                    )}
                    {speakingId === m.id ? "Stop" : "Listen"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ))}

        {pending.map((n) => (
          <div key={n.id} className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl bg-primary px-3 py-2 text-primary-foreground shadow-sm">
              <audio src={n.url} controls className="h-9 max-w-[220px]" />
              <button
                type="button"
                onClick={() => void flush()}
                className="mt-1 flex items-center gap-1 text-[11px] opacity-90"
              >
                {n.failed ? <RotateCw className="size-3" /> : <Clock className="size-3" />}
                {n.failed ? "Waiting for network · tap to retry" : "Sending…"}
              </button>
            </div>
          </div>
        ))}

        {listening ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-70" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            {heard ? heard : `${settings.tutor_name} is listening…`}
          </div>
        ) : null}

        {busy ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> {settings.tutor_name} is thinking…
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      {recording ? (
        <div className="flex items-center gap-3 border-t border-wa-divider bg-card px-3 py-2">
          <Button type="button" variant="ghost" size="icon" onClick={cancelRecording} aria-label="Delete recording">
            <Trash2 className="size-5 text-destructive" />
          </Button>
          <span className="relative flex size-3">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive opacity-70" />
            <span className="relative inline-flex size-3 rounded-full bg-destructive" />
          </span>
          <span className="flex-1 text-sm tabular-nums text-foreground">
            {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")} · Recording… tap send when done
          </span>
          <Button type="button" size="icon" onClick={sendRecording} aria-label="Send voice note">
            <Send className="size-5" />
          </Button>
        </div>
      ) : (
        <div className="flex items-end gap-2 border-t border-wa-divider bg-card px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => void startRecording()}
            aria-label="Record a voice note"
          >
            <Mic className="size-5" />
          </Button>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Ask ${settings.tutor_name} anything`}
            rows={1}
            className="max-h-28 min-h-10 flex-1 resize-none"
          />
          <Button
            type="button"
            size="icon"
            onClick={() => void send(text)}
            disabled={busy || text.trim().length === 0}
            aria-label="Send"
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
          </Button>
        </div>
      )}
    </div>
  );
}
