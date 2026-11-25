import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Clock, Eye, Paperclip, Plus, SendHorizontal, Star, Store } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CommunityLogo } from "@/components/news/CommunityLogo";
import { NewsMedia } from "@/components/news/NewsMedia";
import { ComNewsRecorder } from "@/components/news/ComNewsRecorder";
import { fetchGroupMembers, fetchGroupMessages, sendGroupMessage } from "@/lib/groups";
import type { ChatMessage, ProfileLite } from "@/lib/chat";
import {
  clock,
  fetchApprovedNews,
  fetchCommunity,
  joinCommunityDiscussion,
  type CommunityNews,
} from "@/lib/community-news";

const AVATAR_TONES = ["bg-wa-green", "bg-primary", "bg-destructive", "bg-accent", "bg-secondary"];
function tone(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}
function initials(name: string) {
  return name.replace(/[_.-]/g, " ").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
}

interface Props {
  communityId: string;
  me: ProfileLite;
  onBack: () => void;
}

/** Community discussion page: header pill, live news card, sponsored ad card, chat stream. */
export function CommunityChatWindow({ communityId, me, onBack }: Props) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [news, setNews] = useState<CommunityNews[]>([]);
  const [text, setText] = useState("");
  const [recorder, setRecorder] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const c = await fetchCommunity(communityId);
      if (!active || !c) return;
      setName(c.name);
      try {
        const id = await joinCommunityDiscussion(communityId);
        if (!active) return;
        setChatId(id);
        const [msgs, members] = await Promise.all([fetchGroupMessages(id), fetchGroupMembers(id).catch(() => [])]);
        if (!active) return;
        setMessages(msgs);
        setNames(new Map(members.map((m) => [m.id, m.username || m.display_name || "Member"])));
      } catch {
        toast.error("Could not open this community");
      }
    })();
    void fetchApprovedNews(30, communityId).then((n) => active && setNews(n));
    return () => { active = false; };
  }, [communityId]);

  useEffect(() => {
    if (!chatId) return;
    const channel = supabase
      .channel(`community-chat:${chatId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` }, (payload) => {
        const row = payload.new as ChatMessage;
        setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
        if (row.message_type === ("news" as never)) void fetchApprovedNews(30, communityId).then(setNews);
        if (!names.has(row.sender_id)) void fetchGroupMembers(chatId).then((m) => setNames(new Map(m.map((x) => [x.id, x.username || x.display_name || "Member"]))));
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [chatId, communityId, names]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end" }); }, [messages.length]);

  const latest = news[0];
  const sponsor = useMemo(() => news.find((n) => n.ad_title), [news]);
  const newsById = useMemo(() => new Map(news.map((n) => [n.id, n])), [news]);
  const lastActivity = messages[messages.length - 1]?.created_at;
  const activeNow = lastActivity ? Date.now() - new Date(lastActivity).getTime() < 15 * 60_000 : false;

  async function send() {
    const body = text.trim();
    if (!body || !chatId) return;
    setText("");
    try {
      const row = await sendGroupMessage({ chatId, senderId: me.id, content: body });
      setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
    } catch {
      setText(body);
      toast.error("Message not sent");
    }
  }

  function openAd() {
    const link = sponsor?.ad_link;
    if (!link) return;
    if (link.startsWith("/")) window.location.assign(link);
    else window.open(link.startsWith("http") ? link : `https://${link}`, "_blank", "noopener");
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <div className="relative flex items-center justify-center px-3 pt-4">
        <button type="button" onClick={onBack} aria-label="Back" className="absolute left-3 rounded-full bg-muted p-2"><ArrowLeft className="size-5" /></button>
        <div className="flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2 shadow-lg">
          <CommunityLogo name={name || "Community"} size={40} />
          <span className="max-w-[12rem] font-display text-lg font-bold leading-tight">{name || "Community"}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="flex items-center justify-center gap-1.5 rounded-2xl bg-card px-2 py-2 text-xs font-semibold">
            <span className={`size-2 rounded-full ${activeNow ? "bg-wa-green" : "bg-muted-foreground"}`} />
            {names.size} members{activeNow ? " · Active now" : ""}
          </div>
          <div className="flex items-center justify-center gap-1.5 rounded-2xl bg-card px-2 py-2 text-xs font-semibold">
            <Clock className="size-3.5" /> Today · {clock(new Date().toISOString())}
          </div>

          {latest ? (
            <Link to="/community-news/$id" params={{ id: latest.id }} className="rounded-3xl bg-card p-3 shadow-md">
              <div className="relative overflow-hidden rounded-xl">
                <NewsMedia path={latest.media_path} type={latest.media_type} className="aspect-video w-full" />
                <span className="absolute left-1.5 top-1.5 rounded bg-destructive px-1.5 text-[0.6rem] font-black text-destructive-foreground">NEWS</span>
                <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-full bg-background/80 px-1.5 text-[0.6rem] font-bold">
                  {latest.views_count} <Eye className="size-3" />
                </span>
              </div>
              <p className="mt-2 line-clamp-4 text-sm font-bold leading-snug">{latest.title}</p>
              <p className="mt-1 text-[0.7rem] text-muted-foreground">{latest.media_type === "video" ? "Video" : "Photo"} · {latest.views_count} views</p>
            </Link>
          ) : (
            <div className="flex items-center justify-center rounded-3xl bg-card p-3 text-center text-xs text-muted-foreground">No news here yet</div>
          )}

          {sponsor ? (
            <div className="flex flex-col rounded-3xl bg-card p-3 shadow-md">
              <div className="flex items-center gap-2">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground"><Store className="size-5" /></span>
                <p className="text-sm font-bold leading-tight">{sponsor.ad_title}</p>
              </div>
              {sponsor.ad_tagline ? <p className="mt-2 text-xs text-muted-foreground">{sponsor.ad_tagline}</p> : null}
              {sponsor.ad_rating != null ? (
                <div className="mt-2">
                  <div className="flex gap-0.5">{Array.from({ length: 5 }, (_, i) => <Star key={i} className={`size-3.5 ${i < Math.round(Number(sponsor.ad_rating)) ? "fill-accent text-accent" : "text-muted-foreground"}`} />)}</div>
                  <p className="mt-1 text-[0.7rem] text-wa-green">{Number(sponsor.ad_rating).toFixed(1)} stars</p>
                </div>
              ) : null}
              <button type="button" onClick={openAd} className="mt-auto rounded-full bg-primary py-1.5 text-xs font-bold text-primary-foreground">
                {sponsor.ad_cta || "View"}
              </button>
              <span className="mt-1 text-center text-[0.55rem] uppercase tracking-wider text-muted-foreground">Sponsored</span>
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-3xl border border-dashed border-border p-3 text-center text-xs text-muted-foreground">Ad space</div>
          )}
        </div>

        <ul className="mt-4 space-y-3">
          {messages.filter((m) => !m.deleted_for_everyone).map((m) => {
            const mine = m.sender_id === me.id;
            const who = mine ? "You" : names.get(m.sender_id) ?? "Member";
            if (m.message_type === ("news" as never)) {
              const n = newsById.get(m.content ?? "");
              return (
                <li key={m.id}>
                  <button type="button" onClick={() => void navigate({ to: "/community-news/$id", params: { id: m.content ?? "" } })} className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-2 text-left">
                    {n ? <NewsMedia path={n.media_path} type={n.media_type} className="h-14 w-20 rounded-lg" /> : null}
                    <span className="min-w-0 flex-1">
                      <span className="text-[0.6rem] font-black uppercase text-destructive">Community news</span>
                      <span className="line-clamp-2 block text-sm font-bold">{n?.title ?? (m as unknown as { body?: string }).body ?? "News"}</span>
                    </span>
                    <span className="text-[0.65rem] text-muted-foreground">{clock(m.created_at)}</span>
                  </button>
                </li>
              );
            }
            return mine ? (
              <li key={m.id} className="flex flex-col items-end">
                <span className="mr-2 text-[0.65rem] text-muted-foreground">{clock(m.created_at)}</span>
                <p className="max-w-[80%] rounded-2xl bg-card px-4 py-2">{m.content}</p>
              </li>
            ) : (
              <li key={m.id} className="flex items-start gap-2">
                <span className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-primary-foreground ${tone(m.sender_id)}`}>{initials(who)}</span>
                <div className="max-w-[80%] rounded-2xl bg-card px-4 py-2">
                  <p className="flex justify-between gap-4 text-[0.7rem]"><span className="font-semibold text-primary">{who}</span><span className="text-muted-foreground">{clock(m.created_at)}</span></p>
                  <p>{m.content}</p>
                </div>
              </li>
            );
          })}
        </ul>
        <div ref={bottomRef} />
      </div>

      <div className="px-3 pb-3">
        <div className="flex items-center gap-2 rounded-full bg-card py-1.5 pl-5 pr-1.5 shadow-lg">
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void send()} placeholder="Type message" className="min-w-0 flex-1 bg-transparent py-2 outline-none placeholder:text-muted-foreground" />
          <button type="button" aria-label="Report news" onClick={() => setRecorder(true)} className="p-1.5"><Plus className="size-6" /></button>
          <button type="button" aria-label="Capture photo or video" onClick={() => setRecorder(true)} className="p-1.5"><Paperclip className="size-5" /></button>
          <button type="button" aria-label="Send" onClick={() => void send()} className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground"><SendHorizontal className="size-5" /></button>
        </div>
      </div>
      {recorder ? <ComNewsRecorder userId={me.id} onClose={() => setRecorder(false)} /> : null}
    </div>
  );
}
