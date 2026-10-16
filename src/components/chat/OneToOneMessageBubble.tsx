import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";
import {
  Check,
  CheckCheck,
  Clock3,
  ContactRound,
  Copy,
  Download,
  FileText,
  Forward,
  MapPin,
  Pause,
  Play,
  PhoneCall,
  Reply,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
  if (message.pending) return <Clock3 className="size-3.5 text-chat-receipt" />;
  if (message.is_read) return <CheckCheck className="size-3.5 text-chat-read" />;
  if (message.delivered_at) return <CheckCheck className="size-3.5 text-chat-receipt" />;
  return <Check className="size-3.5 text-chat-receipt" />;
}

function Meta({ message, mine }: { message: ChatMessage; mine: boolean }) {
  return (
    <span
      className={cn(
        "ml-2 inline-flex translate-y-0.5 items-center gap-1 whitespace-nowrap text-[10px]",
        mine ? "text-chat-sent-meta" : "text-chat-received-meta",
      )}
    >
      {formatTime12h(message.created_at)}
      {mine ? <Ticks message={message} /> : null}
    </span>
  );
}

function ImageMessage({ message, onForward }: { message: ChatMessage; onForward: ((message: ChatMessage) => void) | undefined }) {
  const url = useChatMediaUrl(message.media_url);
  const [open, setOpen] = useState(false);
  if (!url) return <div className="h-40 w-56 animate-pulse rounded-xl bg-chat-media-placeholder" />;
  return (
    <>
      <Button type="button" variant="ghost" onClick={() => setOpen(true)} className="block h-auto w-auto p-0 hover:bg-transparent">
        <img src={url} alt={message.content || "Photo"} loading="lazy" className="max-h-80 w-full max-w-[300px] rounded-xl object-cover" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="inset-0 left-0 top-0 flex h-dvh max-w-none translate-x-0 translate-y-0 items-center justify-center border-0 bg-chat-viewer p-0 shadow-none sm:rounded-none">
          <div className="absolute right-4 top-4 z-10 flex gap-2">
            <Button asChild variant="secondary" size="icon" aria-label="Download image">
              <a href={url} download={message.media_name ?? "photo"}><Download /></a>
            </Button>
            {onForward ? <Button variant="secondary" size="icon" aria-label="Forward image" onClick={() => { setOpen(false); onForward(message); }}><Forward /></Button> : null}
            <Button variant="secondary" size="icon" aria-label="Close image" onClick={() => setOpen(false)}><X /></Button>
          </div>
          <img src={url} alt={message.content || "Photo"} className="max-h-dvh max-w-full object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}

function VideoMessage({ message }: { message: ChatMessage }) {
  const url = useChatMediaUrl(message.media_url);
  if (!url) return <div className="h-44 w-64 animate-pulse rounded-xl bg-chat-media-placeholder" />;
  return <video src={url} controls playsInline className="max-h-80 w-full max-w-[300px] rounded-xl bg-chat-viewer" />;
}

function AudioMessage({ message, sender, mine }: { message: ChatMessage; sender: ProfileLite | null; mine: boolean }) {
  const url = useChatMediaUrl(message.media_url);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => setProgress(el.duration ? el.currentTime / el.duration : 0);
    const onEnd = () => { setPlaying(false); setProgress(0); };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("ended", onEnd);
    return () => { el.removeEventListener("timeupdate", onTime); el.removeEventListener("ended", onEnd); };
  }, [url]);
  const bars = Array.from({ length: 30 }, (_, i) => 6 + ((i * 7919) % 17));
  return (
    <div className="flex w-[15.5rem] max-w-full items-center gap-2">
      <UserAvatar photoPath={sender?.photo_path} name={sender?.display_name ?? "?"} className="size-9 shrink-0" />
      <Button variant="ghost" size="icon" type="button" onClick={() => {
        const el = audioRef.current;
        if (!el) return;
        if (playing) { el.pause(); setPlaying(false); } else { void el.play(); setPlaying(true); }
      }} className={cn("size-8 shrink-0 rounded-full p-0", mine ? "text-chat-sent-foreground" : "text-chat-primary")} aria-label={playing ? "Pause voice message" : "Play voice message"}>
        {playing ? <Pause /> : <Play />}
      </Button>
      <div className="min-w-0 flex-1">
        <div className="flex h-6 items-center gap-[2px]">
          {bars.map((h, i) => <span key={i} className={cn("w-[2px] rounded-full", i / bars.length <= progress ? "bg-chat-primary" : mine ? "bg-chat-sent-foreground/45" : "bg-chat-received-meta/45")} style={{ height: `${h}px` }} />)}
        </div>
        <div className={cn("mt-0.5 text-[10px]", mine ? "text-chat-sent-meta" : "text-chat-received-meta")}>{formatDuration(message.media_duration ?? 0)}</div>
      </div>
      {url ? <audio ref={audioRef} src={url} preload="none" className="hidden" /> : null}
    </div>
  );
}

function FileMessage({ message, mine }: { message: ChatMessage; mine: boolean }) {
  const url = useChatMediaUrl(message.media_url);
  return (
    <div className={cn("flex w-[16rem] max-w-full items-center gap-3 rounded-xl p-2", mine ? "bg-chat-sent-foreground/12" : "bg-chat-file") }>
      <FileText className={cn("size-8 shrink-0", mine ? "text-chat-sent-foreground" : "text-chat-primary")} />
      <span className="min-w-0 flex-1 truncate text-sm">{message.media_name || "Document"}</span>
      {url ? <Button asChild variant="ghost" size="icon" className="size-8"><a href={url} download={message.media_name ?? undefined} target="_blank" rel="noreferrer"><Download /></a></Button> : null}
    </div>
  );
}

type LocationData = { latitude?: number; longitude?: number; label?: string };
type ContactData = { name?: string; phone?: string };
function structuredData<T>(content: string | null): T | null {
  try { return content ? JSON.parse(content) as T : null; } catch { return null; }
}

function LocationMessage({ message, mine }: { message: ChatMessage; mine: boolean }) {
  const data = structuredData<LocationData>(message.content);
  if (!data?.latitude || !data.longitude) return <span>Location unavailable</span>;
  const label = (data as LocationData & { label?: string }).label || "Shared location";
  return <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("findmit:navigate", { detail: { lat: data.latitude, lng: data.longitude, label } }))} className="flex min-w-52 items-center gap-3 rounded-xl bg-chat-map p-3 text-left text-inherit"><span className={cn("grid size-10 shrink-0 place-items-center rounded-full", mine ? "bg-chat-sent-foreground/15" : "bg-chat-primary/10")}><MapPin className="size-5" /></span><span className="min-w-0"><strong className="block text-sm">{label}</strong><span className="block truncate text-xs opacity-75">Tap for live navigation</span></span></button>;
}

function ContactMessage({ message, mine }: { message: ChatMessage; mine: boolean }) {
  const data = structuredData<ContactData>(message.content);
  return <div className="flex min-w-52 items-center gap-3 py-1"><span className={cn("grid size-10 shrink-0 place-items-center rounded-full", mine ? "bg-chat-sent-foreground/15" : "bg-chat-primary/10")}><ContactRound className="size-5" /></span><span className="min-w-0"><strong className="block truncate text-sm">{data?.name || "Contact"}</strong><span className="block truncate text-xs opacity-75">{data?.phone || "No phone number"}</span></span></div>;
}

export function OneToOneMessageBubble({ message, mine, sender, starred, replyTo, showSender, onReply, onStar, onDelete, onForward }: {
  message: ChatMessage; mine: boolean; sender: ProfileLite | null; starred?: boolean; replyTo?: ChatMessage | null; showSender?: boolean;
  onReply?: (message: ChatMessage) => void; onStar?: (message: ChatMessage) => void; onDelete?: (message: ChatMessage) => void; onForward?: (message: ChatMessage) => void;
}) {
  const deleted = Boolean(message.deleted_for_everyone);
  const x = useMotionValue(0);
  const replyOpacity = useTransform(x, [0, 46], [0, 1]);
  const copy = async () => {
    const value = message.content || message.media_name || "";
    if (value) await navigator.clipboard.writeText(value);
  };
  if (message.message_type === "call") return <div className="flex justify-center py-1"><span className="inline-flex items-center gap-2 rounded-lg bg-chat-date px-3 py-1 text-[11px] font-medium text-chat-received-meta shadow-sm"><PhoneCall className="size-3" />{message.content}</span></div>;
  const isText = message.message_type === "text" || deleted;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <motion.div initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} className={cn("relative flex w-full px-1", mine ? "justify-end" : "justify-start")}>
          <motion.span style={{ opacity: replyOpacity }} className={cn("absolute top-1/2 -translate-y-1/2 text-chat-primary", mine ? "left-2" : "left-1")}><Reply className="size-5" /></motion.span>
          <motion.div drag="x" dragDirectionLock dragConstraints={{ left: 0, right: 72 }} dragElastic={0.12} style={{ x }} onDragEnd={(_, info) => { if (info.offset.x > 52) onReply?.(message); }} className={cn("relative max-w-[86%] px-3 py-2 shadow-sm sm:max-w-[68%]", mine ? "rounded-[18px] rounded-tr-[5px] bg-chat-sent text-chat-sent-foreground after:absolute after:right-[-6px] after:top-0 after:border-l-[8px] after:border-t-[9px] after:border-l-chat-sent after:border-t-transparent" : "rounded-[18px] rounded-tl-[5px] bg-chat-received text-chat-received-foreground after:absolute after:left-[-6px] after:top-0 after:border-r-[8px] after:border-t-[9px] after:border-r-chat-received after:border-t-transparent")}>
            {showSender && !mine && sender ? <p className="mb-0.5 text-[11px] font-semibold text-chat-primary">{sender.display_name}</p> : null}
            {replyTo ? <div className={cn("mb-1.5 rounded-lg border-l-4 border-chat-primary px-2 py-1", mine ? "bg-chat-sent-foreground/12" : "bg-chat-reply")}><p className={cn("truncate text-[11px] font-semibold", mine ? "text-chat-sent-foreground" : "text-chat-primary")}>{replyTo.sender_id === message.sender_id ? "You" : "Reply"}</p><p className="truncate text-[11px] opacity-75">{replyTo.content || replyTo.media_name || "Attachment"}</p></div> : null}
            {!deleted ? <>{message.message_type === "image" ? <ImageMessage message={message} onForward={onForward} /> : null}{message.message_type === "video" ? <VideoMessage message={message} /> : null}{message.message_type === "audio" ? <AudioMessage message={message} sender={sender} mine={mine} /> : null}{message.message_type === "file" ? <FileMessage message={message} mine={mine} /> : null}{message.message_type === "location" ? <LocationMessage message={message} mine={mine} /> : null}{message.message_type === "contact" ? <ContactMessage message={message} mine={mine} /> : null}</> : null}
            {isText ? <p className={cn("whitespace-pre-wrap break-words text-[0.92rem] leading-[1.35]", deleted && "italic opacity-70")}>{deleted ? "This message was deleted" : message.content}<Meta message={message} mine={mine} /></p> : <div className="mt-1 flex justify-end">{message.content && !["audio", "location", "contact"].includes(message.message_type) ? <p className="mr-auto whitespace-pre-wrap break-words pr-2 text-[0.92rem]">{message.content}</p> : null}{starred ? <span className="mr-1 self-end text-xs">★</span> : null}<Meta message={message} mine={mine} /></div>}
          </motion.div>
        </motion.div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-44">
        {onReply ? <ContextMenuItem onSelect={() => onReply(message)}><Reply className="mr-2 size-4" />Reply</ContextMenuItem> : null}
        {message.content && !deleted ? <ContextMenuItem onSelect={() => void copy()}><Copy className="mr-2 size-4" />Copy</ContextMenuItem> : null}
        {onForward && !deleted ? <ContextMenuItem onSelect={() => onForward(message)}><Forward className="mr-2 size-4" />Forward</ContextMenuItem> : null}
        {onStar && !deleted ? <ContextMenuItem onSelect={() => onStar(message)}>★<span className="ml-2">{starred ? "Unstar" : "Star"}</span></ContextMenuItem> : null}
        {mine && onDelete && !deleted ? <><ContextMenuSeparator /><ContextMenuItem className="text-destructive" onSelect={() => onDelete(message)}><Trash2 className="mr-2 size-4" />Delete</ContextMenuItem></> : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function SentTick() { return <Check className="size-3.5 text-chat-receipt" />; }
