import { useEffect, useRef, useState } from "react";
import {
  Check,
  CheckCheck,
  Download,
  FileText,
  Pause,
  Play,
  PhoneCall,
  Reply,
  Star,
  Trash2,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/UserAvatar";
import { cn } from "@/lib/utils";
import {
  formatDuration,
  formatTime12h,
  useChatMediaUrl,
  type ChatMessage,
  type ProfileLite,
} from "@/lib/chat";

function Ticks({ message }: { message: ChatMessage }) {
  const delivered = Boolean((message as unknown as { delivered_at?: string | null }).delivered_at);
  if (message.is_read) return <CheckCheck className="size-3.5 text-wa-tick" />;
  if (delivered) return <CheckCheck className="size-3.5 text-wa-muted" />;
  return <Check className="size-3.5 text-wa-muted" />;
}

function Meta({ message, mine }: { message: ChatMessage; mine: boolean }) {
  return (
    <span className="ml-2 inline-flex translate-y-0.5 items-center gap-1 whitespace-nowrap text-[11px] text-wa-muted">
      {formatTime12h(message.created_at)}
      {mine ? <Ticks message={message} /> : null}
    </span>
  );
}

function ImageMessage({ message }: { message: ChatMessage }) {
  const url = useChatMediaUrl(message.media_url);
  const [open, setOpen] = useState(false);
  if (!url) return <div className="h-40 w-56 animate-pulse rounded-md bg-black/10" />;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="block">
        <img
          src={url}
          alt={message.content || "Photo"}
          loading="lazy"
          className="max-h-80 w-full max-w-[300px] rounded-md object-cover"
        />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl border-0 bg-transparent p-0 shadow-none">
          <img src={url} alt={message.content || "Photo"} className="w-full rounded-lg" />
        </DialogContent>
      </Dialog>
    </>
  );
}

function VideoMessage({ message }: { message: ChatMessage }) {
  const url = useChatMediaUrl(message.media_url);
  if (!url) return <div className="h-44 w-64 animate-pulse rounded-md bg-black/10" />;
  return (
    <video src={url} controls playsInline className="max-h-80 w-full max-w-[300px] rounded-md bg-black" />
  );
}

function AudioMessage({
  message,
  sender,
  mine,
}: {
  message: ChatMessage;
  sender: ProfileLite | null;
  mine: boolean;
}) {
  const url = useChatMediaUrl(message.media_url);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => setProgress(el.duration ? el.currentTime / el.duration : 0);
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("ended", onEnd);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("ended", onEnd);
    };
  }, [url]);

  const bars = Array.from({ length: 34 }, (_, i) => 6 + ((i * 7919) % 17));

  return (
    <div className="flex w-[16rem] items-center gap-2">
      <UserAvatar
        photoPath={sender?.photo_path}
        name={sender?.display_name ?? "?"}
        className="size-9 shrink-0"
      />
      <button
        type="button"
        onClick={() => {
          const el = audioRef.current;
          if (!el) return;
          if (playing) {
            el.pause();
            setPlaying(false);
          } else {
            void el.play();
            setPlaying(true);
          }
        }}
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          mine ? "bg-wa-green text-white" : "bg-wa-header text-wa-teal",
        )}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex h-6 items-center gap-[2px]">
          {bars.map((h, i) => (
            <span
              key={i}
              className={cn(
                "w-[2px] rounded-full",
                i / bars.length <= progress ? "bg-wa-green" : "bg-wa-muted/40",
              )}
              style={{ height: `${h}px` }}
            />
          ))}
        </div>
        <div className="mt-0.5 text-[11px] text-wa-muted">
          {formatDuration(message.media_duration ?? 0)}
        </div>
      </div>
      {url ? <audio ref={audioRef} src={url} preload="none" className="hidden" /> : null}
    </div>
  );
}

function FileMessage({ message }: { message: ChatMessage }) {
  const url = useChatMediaUrl(message.media_url);
  return (
    <div className="flex w-[16rem] items-center gap-3 rounded-md bg-black/5 p-2">
      <FileText className="size-8 shrink-0 text-wa-teal" />
      <span className="min-w-0 flex-1 truncate text-sm text-wa-text">
        {message.media_name || "Document"}
      </span>
      {url ? (
        <a href={url} download={message.media_name ?? undefined} target="_blank" rel="noreferrer">
          <Download className="size-4 text-wa-muted" />
        </a>
      ) : null}
    </div>
  );
}

export function MessageBubble({
  message,
  mine,
  sender,
  starred,
  replyTo,
  showSender,
  onReply,
  onStar,
  onDelete,
}: {
  message: ChatMessage;
  mine: boolean;
  sender: ProfileLite | null;
  starred?: boolean;
  replyTo?: ChatMessage | null;
  showSender?: boolean;
  onReply?: (message: ChatMessage) => void;
  onStar?: (message: ChatMessage) => void;
  onDelete?: (message: ChatMessage) => void;
}) {

  if (message.message_type === "call") {
    return (
      <div className="flex justify-center py-1">
        <span className="inline-flex items-center gap-2 rounded-md bg-white/80 px-3 py-1 text-[11px] font-medium text-wa-muted shadow-sm">
          <PhoneCall className="size-3" />
          {message.content}
        </span>
      </div>
    );
  }

  const deleted = Boolean((message as unknown as { deleted_for_everyone?: boolean }).deleted_for_everyone);
  const isText = message.message_type === "text" || deleted;

  return (
    <div className={cn("group flex w-full items-center gap-1 px-1", mine ? "justify-end" : "justify-start")}>
      {mine ? (
        <MessageActions
          message={message}
          mine={mine}
          deleted={deleted}
          starred={starred}
          onReply={onReply}
          onStar={onStar}
          onDelete={onDelete}
        />
      ) : null}
      <div
        className={cn(
          "relative max-w-[85%] rounded-lg px-2 py-1.5 shadow-sm sm:max-w-[65%]",
          mine ? "bg-wa-bubble-out rounded-tr-none" : "bg-wa-bubble-in rounded-tl-none",
        )}
      >
        {showSender && !mine && sender ? (
          <p className="mb-0.5 text-[11px] font-semibold text-wa-green">{sender.display_name}</p>
        ) : null}

        {replyTo ? (
          <div className="mb-1 rounded-md border-l-4 border-wa-green bg-black/5 px-2 py-1">

            <p className="truncate text-[11px] font-semibold text-wa-green">
              {replyTo.sender_id === message.sender_id ? "You" : "Reply"}
            </p>
            <p className="truncate text-[11px] text-wa-muted">
              {replyTo.content || replyTo.media_name || "Attachment"}
            </p>
          </div>
        ) : null}

        {deleted ? null : (
          <>
            {message.message_type === "image" ? <ImageMessage message={message} /> : null}
            {message.message_type === "video" ? <VideoMessage message={message} /> : null}
            {message.message_type === "audio" ? (
              <AudioMessage message={message} sender={sender} mine={mine} />
            ) : null}
            {message.message_type === "file" ? <FileMessage message={message} /> : null}
          </>
        )}

        {isText ? (
          <p
            className={cn(
              "whitespace-pre-wrap break-words text-[0.9rem] leading-snug",
              deleted ? "italic text-wa-muted" : "text-wa-text",
            )}
          >
            {deleted ? "🚫 This message was deleted" : message.content}
            {starred ? <Star className="ml-1 inline size-3 fill-current text-wa-muted" /> : null}
            <Meta message={message} mine={mine} />
          </p>
        ) : (
          <div className="mt-1 flex justify-end">
            {message.content && message.message_type !== "audio" ? (
              <p className="mr-auto whitespace-pre-wrap break-words px-1 text-[0.9rem] text-wa-text">
                {message.content}
              </p>
            ) : null}
            {starred ? <Star className="mr-1 size-3 self-end fill-current text-wa-muted" /> : null}
            <Meta message={message} mine={mine} />
          </div>
        )}
      </div>
      {!mine ? (
        <MessageActions
          message={message}
          mine={mine}
          deleted={deleted}
          starred={starred}
          onReply={onReply}
          onStar={onStar}
          onDelete={onDelete}
        />
      ) : null}
    </div>
  );
}

function MessageActions({
  message,
  mine,
  deleted,
  starred,
  onReply,
  onStar,
  onDelete,
}: {
  message: ChatMessage;
  mine: boolean;
  deleted: boolean;
  starred: boolean | undefined;
  onReply: ((message: ChatMessage) => void) | undefined;
  onStar: ((message: ChatMessage) => void) | undefined;
  onDelete: ((message: ChatMessage) => void) | undefined;
}) {
  if (deleted) return null;
  return (
    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
      {onReply ? (
        <button
          type="button"
          aria-label="Reply"
          onClick={() => onReply(message)}
          className="flex size-7 items-center justify-center rounded-full bg-white/70 text-wa-muted hover:text-wa-teal"
        >
          <Reply className="size-3.5" />
        </button>
      ) : null}
      {onStar ? (
        <button
          type="button"
          aria-label={starred ? "Unstar message" : "Star message"}
          onClick={() => onStar(message)}
          className="flex size-7 items-center justify-center rounded-full bg-white/70 text-wa-muted hover:text-wa-teal"
        >
          <Star className={cn("size-3.5", starred && "fill-current text-wa-green")} />
        </button>
      ) : null}
      {mine && onDelete ? (
        <button
          type="button"
          aria-label="Delete for everyone"
          onClick={() => onDelete(message)}
          className="flex size-7 items-center justify-center rounded-full bg-white/70 text-wa-muted hover:text-red-600"
        >
          <Trash2 className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}


export function SentTick() {
  return <Check className="size-3.5 text-wa-muted" />;
}
