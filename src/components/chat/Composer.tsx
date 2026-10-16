import { Suspense, lazy, useEffect, useRef, useState } from "react";
import {
  Camera,
  ChevronUp,
  FileText,
  Headphones,
  Image as ImageIcon,
  Lock,
  Mic,
  Paperclip,
  Pause,
  Play,
  Send,
  Smile,
  Trash2,
  Video,
  X,
} from "lucide-react";

import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { startMicrophone } from "@/lib/webrtc-media";
import { formatDuration, uploadChatMedia, type MessageType } from "@/lib/chat";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const EmojiPicker = lazy(async () => {
  const [{ default: Picker }, { default: data }] = await Promise.all([
    import("@emoji-mart/react"),
    import("@emoji-mart/data"),
  ]);
  return {
    default: (props: { onSelect: (emoji: string) => void }) => (
      <Picker
        data={data}
        theme="light"
        previewPosition="none"
        skinTonePosition="none"
        onEmojiSelect={(emoji: { native?: string }) => {
          if (emoji.native) props.onSelect(emoji.native);
        }}
      />
    ),
  };
});

interface Props {
  meId: string;
  disabled?: boolean;
  onTyping?: () => void;
  onSend: (payload: {
    type: MessageType;
    content?: string;
    mediaPath?: string | null;
    mediaDuration?: number | null;
    mediaName?: string | null;
  }) => Promise<void>;
}

function typeForFile(file: File): MessageType {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "file";
}

const CANCEL_DISTANCE = 110;
const LOCK_DISTANCE = 70;

export function Composer({ meId, disabled, onSend, onTyping }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [locked, setLocked] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [slide, setSlide] = useState(0);
  const [lift, setLift] = useState(0);
  const [attachOpen, setAttachOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const acceptRef = useRef<string>("");
  const captureRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const cancelRef = useRef(false);
  const secondsRef = useRef(0);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const lockedRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!recording || paused) return;
    const id = setInterval(() => {
      secondsRef.current += 1;
      setSeconds(secondsRef.current);
    }, 1000);
    return () => clearInterval(id);
  }, [recording, paused]);


  const sendText = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setText("");
    setBusy(true);
    try {
      await onSend({ type: "text", content: body });
    } catch {
      toast.error("Message failed to send");
      setText(body);
    } finally {
      setBusy(false);
    }
  };

  const pickFiles = (accept: string, capture = false) => {
    acceptRef.current = accept;
    captureRef.current = capture;
    setAttachOpen(false);
    // Let the popover close before opening the native picker.
    requestAnimationFrame(() => fileRef.current?.click());
  };

  const handleFiles = async (files: FileList | null) => {
    const list = Array.from(files ?? []);
    if (!list.length) return;
    setBusy(true);
    try {
      for (const file of list) {
        const ext = file.name.split(".").pop() || "bin";
        const path = await uploadChatMedia(meId, file, ext);
        await onSend({
          type: typeForFile(file),
          content: "",
          mediaPath: path,
          mediaName: file.name,
        });
      }
    } catch {
      toast.error("Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const startRecording = async () => {
    if (recording || busy || disabled) return;
    try {
      const stream = await startMicrophone();
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      cancelRef.current = false;
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const duration = secondsRef.current;
        setRecording(false);
        setLocked(false);
        setPaused(false);
        lockedRef.current = false;
        setSeconds(0);
        setSlide(0);
        setLift(0);
        secondsRef.current = 0;
        if (cancelRef.current || duration < 1) return;
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setBusy(true);
        try {
          const path = await uploadChatMedia(meId, blob, "webm");
          await onSend({ type: "audio", mediaPath: path, mediaDuration: duration, content: "" });
        } catch {
          toast.error("Could not send voice note");
        } finally {
          setBusy(false);
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      secondsRef.current = 0;
      setSeconds(0);
      setSlide(0);
      setLift(0);
      setLocked(false);
      setPaused(false);
      lockedRef.current = false;
      setRecording(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Microphone access denied");
    }
  };

  const stopRecording = (cancel: boolean) => {
    if (!recorderRef.current || recorderRef.current.state === "inactive") return;
    cancelRef.current = cancel;
    if (recorderRef.current.state === "paused") recorderRef.current.resume();
    recorderRef.current.stop();
  };

  const togglePause = () => {
    const rec = recorderRef.current;
    if (!rec) return;
    if (rec.state === "recording") {
      rec.pause();
      setPaused(true);
    } else if (rec.state === "paused") {
      rec.resume();
      setPaused(false);
    }
  };

  const onMicDown = (clientX: number, clientY: number) => {
    startXRef.current = clientX;
    startYRef.current = clientY;
    void startRecording();
  };

  const onMicMove = (clientX: number, clientY: number) => {
    if (!recording || lockedRef.current) return;
    const up = Math.min(0, clientY - startYRef.current);
    setLift(up);
    if (Math.abs(up) > LOCK_DISTANCE) {
      lockedRef.current = true;
      setLocked(true);
      setSlide(0);
      setLift(0);
      return;
    }
    const delta = Math.min(0, clientX - startXRef.current);
    setSlide(delta);
    if (Math.abs(delta) > CANCEL_DISTANCE) stopRecording(true);
  };

  const onMicUp = () => {
    if (!recording || lockedRef.current) return;
    stopRecording(Math.abs(slide) > CANCEL_DISTANCE);
  };


  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    if (!el) {
      setText((t) => t + emoji);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  const hasText = text.trim().length > 0;
  const cancelling = Math.abs(slide) > CANCEL_DISTANCE * 0.6;

  const attachments = [
    { label: "Photos", icon: ImageIcon, accept: "image/*", capture: false },
    { label: "Camera", icon: Camera, accept: "image/*", capture: true },
    { label: "Video", icon: Video, accept: "video/*", capture: false },
    { label: "Audio", icon: Headphones, accept: "audio/*", capture: false },
    { label: "Document", icon: FileText, accept: "*/*", capture: false },
  ];

  return (
    <div className="flex items-end gap-2 border-t border-wa-divider bg-wa-header px-3 py-2">
      <input
        ref={fileRef}
        type="file"
        multiple
        accept={acceptRef.current || undefined}
        {...(captureRef.current ? { capture: "environment" as const } : {})}
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />

      {recording ? (
        <div className="relative flex flex-1 items-center gap-3 rounded-full bg-wa-panel px-4 py-2.5">
          {!locked ? (
            <div
              className="pointer-events-none absolute -top-24 right-2 flex flex-col items-center gap-1 rounded-full bg-wa-header px-2 py-3 shadow-md"
              style={{ opacity: 0.6 + Math.min(Math.abs(lift) / LOCK_DISTANCE, 1) * 0.4 }}
            >
              <Lock className="size-4 text-wa-muted" />
              <ChevronUp className="size-4 animate-bounce text-wa-muted" />
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => stopRecording(true)}
            aria-label="Cancel recording"
            className="text-destructive"
          >
            {locked ? <Trash2 className="size-5" /> : <X className="size-5" />}
          </button>
          <span
            className={cn(
              "size-2 rounded-full bg-destructive",
              paused ? "opacity-40" : "animate-pulse",
            )}
          />
          <span className="text-sm tabular-nums text-wa-text">{formatDuration(seconds)}</span>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {locked ? (
              <span className="text-xs text-wa-muted">{paused ? "Paused" : "Recording…"}</span>
            ) : (
              <span
                className={cn(
                  "select-none truncate text-xs transition-opacity",
                  cancelling ? "font-medium text-destructive" : "text-wa-muted",
                )}
                style={{ transform: `translateX(${Math.max(slide, -CANCEL_DISTANCE)}px)` }}
              >
                {cancelling ? "Release to cancel" : "‹ Slide"}
              </span>
            )}
            <button
              type="button"
              onClick={togglePause}
              aria-label={paused ? "Resume recording" : "Pause recording"}
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-wa-muted hover:bg-wa-divider"
            >
              {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
            </button>
            <button
              type="button"
              onClick={() => stopRecording(false)}
              aria-label="Send voice message"
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-wa-green text-white"
            >
              <Send className="size-4" />
            </button>
          </div>
        </div>
      ) : (

        <>
          <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                aria-label="Emoji"
                className="flex size-10 items-center justify-center rounded-full text-wa-muted hover:bg-wa-divider"
              >
                <Smile className="size-5" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-auto border-none p-0 shadow-xl">
              <Suspense
                fallback={<div className="h-80 w-72 animate-pulse rounded-md bg-muted" />}
              >
                <EmojiPicker onSelect={insertEmoji} />
              </Suspense>
            </PopoverContent>
          </Popover>

          <Popover open={attachOpen} onOpenChange={setAttachOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={disabled || busy}
                aria-label="Attach"
                className="flex size-10 items-center justify-center rounded-full text-wa-muted hover:bg-wa-divider"
              >
                <Paperclip className="size-5" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-44 p-1.5">
              {attachments.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => pickFiles(item.accept, item.capture)}
                  className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-sm hover:bg-muted"
                >
                  <span className="flex size-8 items-center justify-center rounded-full bg-wa-green/15 text-wa-green">
                    <item.icon className="size-4" />
                  </span>
                  {item.label}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              onTyping?.();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void sendText();
              }
            }}
            rows={1}
            disabled={disabled}
            placeholder="Type a message"
            className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl bg-wa-panel px-4 py-2.5 text-sm text-wa-text outline-none placeholder:text-wa-muted"
          />
        </>
      )}

      {locked ? null : (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => {
            if (hasText && !recording) void sendText();
          }}
          onPointerDown={(e) => {
            if (hasText || recording) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            onMicDown(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => onMicMove(e.clientX, e.clientY)}
          onPointerUp={onMicUp}
          onPointerCancel={() => {
            if (!lockedRef.current) stopRecording(true);
          }}
          aria-label={
            recording ? "Release to send voice message" : hasText ? "Send message" : "Hold to record"
          }
          className={cn(
            "flex size-10 shrink-0 touch-none select-none items-center justify-center rounded-full text-white transition-transform",
            cancelling ? "bg-destructive" : "bg-wa-green",
            recording && "scale-110",
            (disabled || busy) && "opacity-60",
          )}
          style={recording ? { transform: `translateY(${Math.max(lift, -LOCK_DISTANCE)}px)` } : undefined}
        >
          {hasText && !recording ? <Send className="size-5" /> : <Mic className="size-5" />}
        </button>
      )}

    </div>
  );
}
