import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Camera, ChevronUp, ContactRound, FileText, GalleryHorizontal, Lock, MapPin, Mic, Paperclip, Pause, Play, Send, Smile, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { startMicrophone } from "@/lib/webrtc-media";
import { formatDuration, uploadChatMedia, type MessageType } from "@/lib/chat";

const EmojiPicker = lazy(async () => {
  const [{ default: Picker }, { default: data }] = await Promise.all([import("@emoji-mart/react"), import("@emoji-mart/data")]);
  return { default: (props: { onSelect: (emoji: string) => void }) => <Picker data={data} theme="light" previewPosition="none" skinTonePosition="none" onEmojiSelect={(emoji: { native?: string }) => { if (emoji.native) props.onSelect(emoji.native); }} /> };
});

interface Props { meId: string; draftKey?: string; disabled?: boolean; onTyping?: () => void; onSend: (payload: { type: MessageType; content?: string; mediaPath?: string | null; mediaDuration?: number | null; mediaName?: string | null; }) => Promise<void>; }
const CANCEL_DISTANCE = 110;
const LOCK_DISTANCE = 70;
const TAP_MS = 350;
const WAVE_BARS = [10, 18, 26, 14, 22, 30, 16, 24, 12, 28, 20, 15, 26, 11, 23, 30, 17, 21, 13, 27, 19, 25, 14, 29];

export function OneToOneComposer({ meId, draftKey, disabled, onSend, onTyping }: Props) {
  const [text, setText] = useState("");
  // A product shared from a shop page is staged here for the customer to review and send.
  useEffect(() => {
    if (!draftKey) return;
    const k = `fm-chat-draft:${draftKey}`;
    const staged = sessionStorage.getItem(k);
    if (staged) {
      sessionStorage.removeItem(k);
      setText(staged);
    }
  }, [draftKey]);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [locked, setLocked] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [slide, setSlide] = useState(0);
  const [lift, setLift] = useState(0);
  const [attachOpen, setAttachOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const acceptRef = useRef("");
  const captureRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const cancelRef = useRef(false);
  const secondsRef = useRef(0);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const pressAtRef = useRef(0);
  const lockedRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => { if (!recording || paused) return; const id = setInterval(() => { secondsRef.current += 1; setSeconds(secondsRef.current); }, 1000); return () => clearInterval(id); }, [recording, paused]);
  useEffect(() => { const el = textareaRef.current; if (!el) return; el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 120)}px`; }, [text]);

  const sendText = async () => { const body = text.trim(); if (!body || busy) return; setText(""); setBusy(true); try { await onSend({ type: "text", content: body }); } catch { toast.error("Message failed to send"); setText(body); } finally { setBusy(false); } };
  const pickFiles = (accept: string, capture = false) => { acceptRef.current = accept; captureRef.current = capture; setAttachOpen(false); requestAnimationFrame(() => fileRef.current?.click()); };
  const handleFiles = async (files: FileList | null) => { const list = Array.from(files ?? []); if (!list.length) return; setBusy(true); try { for (const file of list) { const ext = file.name.split(".").pop() || "bin"; const path = await uploadChatMedia(meId, file, ext); const type: MessageType = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "file"; await onSend({ type, content: "", mediaPath: path, mediaName: file.name }); } } catch { toast.error("Upload failed"); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; } };
  const sendLocation = () => { setAttachOpen(false); if (!navigator.geolocation) { toast.error("Location is not available on this device"); return; } navigator.geolocation.getCurrentPosition((pos) => void onSend({ type: "location", content: JSON.stringify({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, label: "Current location" }) }), () => toast.error("Allow location access to send your location"), { enableHighAccuracy: true, timeout: 12000 }); };
  const sendContact = async () => { if (!contactName.trim() || !contactPhone.trim()) return; await onSend({ type: "contact", content: JSON.stringify({ name: contactName.trim(), phone: contactPhone.trim() }) }); setContactName(""); setContactPhone(""); setContactOpen(false); };
  const startRecording = async () => { if (recording || busy || disabled) return; try { const stream = await startMicrophone(); const recorder = new MediaRecorder(stream); chunksRef.current = []; cancelRef.current = false; recorder.ondataavailable = (e) => chunksRef.current.push(e.data); recorder.onstop = async () => { stream.getTracks().forEach((t) => t.stop()); const duration = secondsRef.current; setRecording(false); setLocked(false); setPaused(false); lockedRef.current = false; setSeconds(0); setSlide(0); setLift(0); secondsRef.current = 0; if (cancelRef.current || duration < 1) return; const blob = new Blob(chunksRef.current, { type: "audio/webm" }); setBusy(true); try { const path = await uploadChatMedia(meId, blob, "webm"); await onSend({ type: "audio", mediaPath: path, mediaDuration: duration, content: "" }); } catch { toast.error("Could not send voice note"); } finally { setBusy(false); } }; recorderRef.current = recorder; recorder.start(); secondsRef.current = 0; setSeconds(0); setSlide(0); setLift(0); setLocked(false); setPaused(false); lockedRef.current = false; setRecording(true); } catch (err) { toast.error(err instanceof Error ? err.message : "Microphone access denied"); } };
  const stopRecording = (cancel: boolean) => { const recorder = recorderRef.current; if (!recorder || recorder.state === "inactive") return; cancelRef.current = cancel; if (recorder.state === "paused") recorder.resume(); recorder.stop(); };
  const togglePause = () => { const recorder = recorderRef.current; if (!recorder) return; if (recorder.state === "recording") { recorder.pause(); setPaused(true); } else if (recorder.state === "paused") { recorder.resume(); setPaused(false); } };
  const lockRecording = () => { lockedRef.current = true; setLocked(true); setSlide(0); setLift(0); };
  const onMicMove = (clientX: number, clientY: number) => { if (!recording || lockedRef.current) return; const up = Math.min(0, clientY - startYRef.current); setLift(up); if (Math.abs(up) > LOCK_DISTANCE) { lockRecording(); return; } const delta = Math.min(0, clientX - startXRef.current); setSlide(delta); if (Math.abs(delta) > CANCEL_DISTANCE) stopRecording(true); };
  const onMicRelease = () => { if (!recording || lockedRef.current) return; if (Date.now() - pressAtRef.current < TAP_MS) { lockRecording(); return; } stopRecording(Math.abs(slide) > CANCEL_DISTANCE); };
  const insertEmoji = (emoji: string) => { const el = textareaRef.current; const start = el?.selectionStart ?? text.length; const end = el?.selectionEnd ?? text.length; const next = text.slice(0, start) + emoji + text.slice(end); setText(next); requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + emoji.length, start + emoji.length); }); };
  const hasText = text.trim().length > 0;
  const cancelling = Math.abs(slide) > CANCEL_DISTANCE * 0.6;
  const attachments = [
    { label: "Camera", icon: Camera, action: () => pickFiles("image/*,video/*", true) },
    { label: "Gallery", icon: GalleryHorizontal, action: () => pickFiles("image/*,video/*") },
    { label: "Document", icon: FileText, action: () => pickFiles("*/*") },
    { label: "Location", icon: MapPin, action: sendLocation },
    { label: "Contact", icon: ContactRound, action: () => { setAttachOpen(false); setContactOpen(true); } },
  ];

  const waveform = (
    <div className="flex h-6 flex-1 items-center gap-[3px] overflow-hidden">
      {WAVE_BARS.map((h, i) => (
        <span key={i} className={cn("w-[3px] shrink-0 rounded-full bg-chat-primary/70", !paused && "animate-pulse")} style={{ height: `${h}px`, animationDelay: `${(i % 8) * 90}ms`, animationDuration: "900ms", opacity: paused ? 0.4 : 1 }} />
      ))}
    </div>
  );

  return (
    <div className="relative bg-chat-composer/90 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-sm">
      <input ref={fileRef} type="file" multiple accept={acceptRef.current || undefined} {...(captureRef.current ? { capture: "environment" as const } : {})} className="hidden" onChange={(e) => void handleFiles(e.target.files)} />
      {recording ? <div className="rounded-[24px] bg-chat-input px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="min-w-10 text-sm tabular-nums text-chat-received-foreground">{formatDuration(seconds)}</span>
          {waveform}
          <span className="flex items-center gap-1.5 text-xs font-medium text-chat-received-meta">
            <span className={cn("size-2 rounded-full bg-destructive", !paused && "animate-pulse")} />
            {paused ? "Paused" : "Recording"}
          </span>
          <span className="min-w-10 text-right text-sm tabular-nums text-chat-received-foreground">{formatDuration(seconds)}</span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-chat-line pt-3">
          <Button type="button" variant="ghost" size="icon" onClick={() => stopRecording(true)} aria-label="Delete recording" className="size-11 shrink-0 rounded-full bg-destructive/12 text-destructive hover:bg-destructive/20"><Trash2 /></Button>
          <Button type="button" variant="ghost" onClick={togglePause} aria-label={paused ? "Resume recording" : "Pause recording"} className="min-w-0 gap-2 rounded-full px-4 text-chat-received-foreground hover:bg-chat-file">{paused ? <Play /> : <Pause />}<span className="truncate text-sm font-medium">{paused ? "Resume" : "Pause"}</span></Button>
          <Button type="button" size="icon" onClick={() => stopRecording(false)} aria-label="Send voice message" className="size-11 shrink-0 rounded-full bg-chat-primary text-chat-primary-foreground hover:bg-chat-primary/90"><Send className="size-5" /></Button>
        </div>
        {locked ? null : <div className="mt-2 flex items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1 text-chat-received-meta"><Lock className="size-3.5 text-chat-primary" /><ChevronUp className="size-3.5 animate-bounce" />Swipe up to lock</span>
          <span className={cn("select-none truncate", cancelling ? "text-destructive" : "text-chat-received-meta")} style={{ transform: `translateX(${Math.max(slide, -CANCEL_DISTANCE)}px)` }}>{cancelling ? "Release to cancel" : "‹ Slide to cancel"}</span>
        </div>}
      </div> : <div className="flex items-end gap-2">
        <div className="flex min-h-12 min-w-0 flex-1 items-end rounded-[24px] bg-chat-input px-1.5 shadow-sm">
          <Popover open={emojiOpen} onOpenChange={setEmojiOpen}><PopoverTrigger asChild><Button type="button" variant="ghost" size="icon" disabled={disabled} aria-label="Emoji" className="mb-0.5 size-10 shrink-0 rounded-full text-chat-received-meta hover:bg-chat-file"><Smile /></Button></PopoverTrigger><PopoverContent side="top" align="start" className="w-auto border-none p-0 shadow-xl"><Suspense fallback={<div className="h-80 w-72 animate-pulse rounded-md bg-muted" />}><EmojiPicker onSelect={insertEmoji} /></Suspense></PopoverContent></Popover>
          <textarea ref={textareaRef} value={text} onChange={(e) => { setText(e.target.value); onTyping?.(); }} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void sendText(); } }} rows={1} disabled={disabled} placeholder="Message" className="max-h-[120px] min-h-12 min-w-0 flex-1 resize-none bg-transparent px-1 py-3 text-[15px] leading-6 text-chat-received-foreground outline-none placeholder:text-chat-received-meta" />
          <Button type="button" variant="ghost" size="icon" disabled={disabled || busy} aria-label="Attach" onClick={() => setAttachOpen(true)} className="mb-0.5 size-10 shrink-0 rounded-full text-chat-received-meta hover:bg-chat-file"><Paperclip /></Button>
          <Button type="button" variant="ghost" size="icon" disabled={disabled || busy} aria-label="Camera" onClick={() => pickFiles("image/*,video/*", true)} className="mb-0.5 size-10 shrink-0 rounded-full text-chat-received-meta hover:bg-chat-file"><Camera /></Button>
        </div>
        <Button type="button" disabled={disabled || busy} onClick={() => { if (hasText) void sendText(); }} onPointerDown={(e) => { if (hasText || recording) return; e.currentTarget.setPointerCapture(e.pointerId); startXRef.current = e.clientX; startYRef.current = e.clientY; pressAtRef.current = Date.now(); void startRecording(); }} onPointerMove={(e) => onMicMove(e.clientX, e.clientY)} onPointerUp={onMicRelease} onPointerCancel={() => { if (!lockedRef.current) stopRecording(true); }} aria-label={hasText ? "Send message" : "Tap or hold to record"} className={cn("size-12 shrink-0 touch-none select-none rounded-full bg-chat-primary p-0 text-chat-primary-foreground shadow-md hover:bg-chat-primary/90", recording && "scale-110", cancelling && "bg-destructive")} style={recording ? { transform: `translateY(${Math.max(lift, -LOCK_DISTANCE)}px)` } : undefined}>{hasText ? <Send className="size-5" /> : <Mic className="size-5" />}</Button>
      </div>}

      <Dialog open={attachOpen} onOpenChange={setAttachOpen}><DialogContent className="bottom-0 left-0 top-auto w-full max-w-none translate-x-0 translate-y-0 rounded-t-2xl border-0 bg-chat-input p-5 sm:left-1/2 sm:bottom-5 sm:max-w-md sm:-translate-x-1/2 sm:rounded-2xl"><DialogHeader><DialogTitle className="text-left text-chat-received-foreground">Share</DialogTitle></DialogHeader><div className="grid grid-cols-5 gap-2">{attachments.map((item) => <Button key={item.label} type="button" variant="ghost" onClick={item.action} className="h-auto min-w-0 flex-col gap-2 px-0 py-2 text-chat-received-foreground hover:bg-chat-file"><span className="grid size-11 place-items-center rounded-full bg-chat-primary/12 text-chat-primary"><item.icon /></span><span className="text-[10px]">{item.label}</span></Button>)}</div></DialogContent></Dialog>
      <Dialog open={contactOpen} onOpenChange={setContactOpen}><DialogContent className="max-w-sm bg-chat-input text-chat-received-foreground"><DialogHeader><DialogTitle>Send contact</DialogTitle></DialogHeader><input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Contact name" className="h-11 rounded-lg border border-chat-line bg-chat-input px-3 outline-none focus:ring-2 focus:ring-chat-primary" /><input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="Phone number" inputMode="tel" className="h-11 rounded-lg border border-chat-line bg-chat-input px-3 outline-none focus:ring-2 focus:ring-chat-primary" /><Button onClick={() => void sendContact()} disabled={!contactName.trim() || !contactPhone.trim()} className="bg-chat-primary text-chat-primary-foreground hover:bg-chat-primary/90">Send contact</Button></DialogContent></Dialog>
    </div>
  );
}
