import { useEffect, useState } from "react";
import { Ban, Bell, BellOff, Flag, Lock, Mail, MapPin, Phone, X } from "lucide-react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/UserAvatar";
import { Switch } from "@/components/ui/switch";
import {
  fetchMyPermission,
  setContactPermission,
  useVisibleContact,
} from "@/lib/contact-privacy";
import { chatDb as db, isOnline, useChatMediaUrl, type ChatMessage, type ProfileLite } from "@/lib/chat";
import { setConversationMuted } from "@/lib/chat-prefs";
import { cn } from "@/lib/utils";

function MediaThumb({ message }: { message: ChatMessage }) {
  const url = useChatMediaUrl(message.media_url);
  if (!url) return <div className="aspect-square animate-pulse rounded-md bg-wa-divider" />;
  return message.message_type === "video" ? (
    <video src={url} className="aspect-square w-full rounded-md object-cover" muted playsInline />
  ) : (
    <img src={url} alt="Shared media" className="aspect-square w-full rounded-md object-cover" />
  );
}

interface Props {
  meId: string;
  conversationId: string;
  other: ProfileLite;
  muted: boolean;
  onMutedChange: (muted: boolean) => void;
  onClose: () => void;
}

export function ContactInfo({
  meId,
  conversationId,
  other,
  muted,
  onMutedChange,
  onClose,
}: Props) {
  const [media, setMedia] = useState<ChatMessage[]>([]);
  const [docs, setDocs] = useState<ChatMessage[]>([]);
  const { contact, loading: contactLoading } = useVisibleContact(other.id);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchMyPermission(other.id, meId)
      .then((row) => {
        if (active) setShared(row.allowPhone || row.allowEmail);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [meId, other.id]);

  useEffect(() => {
    let active = true;
    void db
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .in("message_type", ["image", "video", "file"])
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (!active) return;
        const rows = (data ?? []) as ChatMessage[];
        setMedia(rows.filter((m) => m.message_type !== "file").slice(0, 9));
        setDocs(rows.filter((m) => m.message_type === "file").slice(0, 5));
      });
    return () => {
      active = false;
    };
  }, [conversationId]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-wa-panel">
      <header className="flex items-center gap-3 border-b border-wa-divider bg-wa-header px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close contact info"
          className="flex size-8 items-center justify-center rounded-full text-wa-muted hover:bg-wa-divider"
        >
          <X className="size-5" />
        </button>
        <p className="text-sm font-semibold text-wa-text">Contact info</p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col items-center gap-2 border-b border-wa-divider px-6 py-6 text-center">
          <UserAvatar photoPath={other.photo_path} name={other.display_name} className="size-28" />
          <p className="mt-2 text-lg font-semibold text-wa-text">{other.display_name}</p>
          <p className="text-xs text-wa-muted">
            FindMit Verified | JHS Graduate | Accra
          </p>
          <p className="text-xs text-wa-muted">
            {isOnline(other.last_seen) ? "online" : "offline"}
          </p>
        </div>

        <section className="border-b border-wa-divider px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-wa-green">About</p>
          <p className="mt-1 text-sm text-wa-text">@{other.username}</p>

          <p className="mt-3 flex items-center gap-2 text-sm text-wa-text">
            <Phone className="size-4 text-wa-muted" />
            {contactLoading ? (
              <span className="text-wa-muted">Checking…</span>
            ) : contact.phone ? (
              <a href={`tel:+${contact.phone}`} className="text-wa-green">
                +{contact.phone}
              </a>
            ) : (
              <span className="flex items-center gap-1.5 text-wa-muted">
                <Lock className="size-3.5" /> Number hidden
              </span>
            )}
          </p>

          <p className="mt-2 flex items-center gap-2 text-sm text-wa-text">
            <Mail className="size-4 text-wa-muted" />
            {contactLoading ? (
              <span className="text-wa-muted">Checking…</span>
            ) : contact.email ? (
              <a href={`mailto:${contact.email}`} className="break-all text-wa-green">
                {contact.email}
              </a>
            ) : (
              <span className="flex items-center gap-1.5 text-wa-muted">
                <Lock className="size-3.5" /> Email hidden
              </span>
            )}
          </p>

          <p className="mt-2 flex items-center gap-2 text-sm text-wa-text">
            <MapPin className="size-4 text-wa-muted" /> Accra, Ghana
          </p>

          <div className="mt-4 flex items-center justify-between gap-3 rounded-md bg-wa-header px-3 py-2.5">
            <div>
              <p className="text-sm text-wa-text">Show my contact details</p>
              <p className="text-xs text-wa-muted">
                Let {other.display_name} see your number and email
              </p>
            </div>
            <Switch
              checked={shared}
              onCheckedChange={(next) => {
                setShared(next);
                void setContactPermission(meId, other.id, {
                  allowPhone: next,
                  allowEmail: next,
                })
                  .then(() =>
                    toast.success(
                      next
                        ? `${other.display_name} can now see your contact details`
                        : "Your contact details are hidden again",
                    ),
                  )
                  .catch(() => {
                    setShared(!next);
                    toast.error("Could not save that. Please try again.");
                  });
              }}
              aria-label="Share my contact details"
            />
          </div>
        </section>

        <section className="border-b border-wa-divider px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-wa-green">
            Media, links and docs
          </p>
          {media.length === 0 && docs.length === 0 ? (
            <p className="mt-2 text-sm text-wa-muted">Nothing shared yet.</p>
          ) : null}
          {media.length ? (
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {media.map((m) => (
                <MediaThumb key={m.id} message={m} />
              ))}
            </div>
          ) : null}
          {docs.length ? (
            <ul className="mt-3 space-y-1.5">
              {docs.map((d) => (
                <li key={d.id} className="truncate rounded-md bg-wa-header px-2 py-1.5 text-xs text-wa-text">
                  {d.media_name || "Document"}
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <p className="flex items-start gap-2 border-b border-wa-divider px-4 py-4 text-xs text-wa-muted">
          <Lock className="mt-0.5 size-3.5 shrink-0" />
          Messages are end-to-end encrypted. No one outside this chat can read them.
        </p>

        <div className="space-y-1 px-2 py-3">
          <button
            type="button"
            onClick={() => {
              const next = !muted;
              onMutedChange(next);
              void setConversationMuted(meId, conversationId, next).catch(() => undefined);
            }}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-wa-text hover:bg-wa-header"
          >
            {muted ? <BellOff className="size-4" /> : <Bell className="size-4" />}
            {muted ? "Unmute notifications" : "Mute notifications"}
          </button>
          <button
            type="button"
            onClick={() => toast.success(`${other.display_name} blocked`)}
            className={cn("flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-red-600 hover:bg-wa-header")}
          >
            <Ban className="size-4" /> Block {other.display_name}
          </button>
          <button
            type="button"
            onClick={() => toast.success("Report sent to the FindMit team")}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-red-600 hover:bg-wa-header"
          >
            <Flag className="size-4" /> Report
          </button>
        </div>
      </div>
    </div>
  );
}
