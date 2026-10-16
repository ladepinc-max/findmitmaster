import { useEffect, useState } from "react";
import { Check, Search } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/UserAvatar";
import { cn } from "@/lib/utils";
import { searchProfiles, type ProfileLite } from "@/lib/chat";
import {
  COMMUNITY_GROUP_LIMIT,
  GROUP_MEMBER_LIMIT,
  createCommunity,
  createGroup,
} from "@/lib/groups";

interface Props {
  meId: string;
  kind: "group" | "community";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (chatId: string) => void;
}

export function NewGroupDialog({ meId, kind, open, onOpenChange, onCreated }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<ProfileLite[]>([]);
  const [selected, setSelected] = useState<ProfileLite[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setDescription("");
      setTerm("");
      setResults([]);
      setSelected([]);
    }
  }, [open]);

  useEffect(() => {
    const q = term.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const id = setTimeout(() => {
      searchProfiles(q, meId)
        .then(setResults)
        .catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(id);
  }, [term, meId]);

  const toggle = (p: ProfileLite) => {
    setSelected((prev) =>
      prev.some((x) => x.id === p.id) ? prev.filter((x) => x.id !== p.id) : [...prev, p],
    );
  };

  const submit = async () => {
    if (!name.trim()) {
      toast.error(`Give your ${kind} a name`);
      return;
    }
    setBusy(true);
    try {
      const memberIds = selected.map((s) => s.id);
      if (kind === "group") {
        const chatId = await createGroup({ meId, name, description, memberIds });
        toast.success("Group created");
        onCreated(chatId);
      } else {
        const { announcementChatId } = await createCommunity({
          meId,
          name,
          description,
          memberIds,
        });
        toast.success("Community created");
        onCreated(announcementChatId);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Could not create ${kind}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{kind === "group" ? "New group" : "New community"}</DialogTitle>
          <DialogDescription>
            {kind === "group"
              ? `Add up to ${GROUP_MEMBER_LIMIT} members.`
              : `Communities can hold up to ${COMMUNITY_GROUP_LIMIT} groups. We'll create the announcement group for you.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === "group" ? "Group name" : "Community name"}
          />
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Description (optional)"
          />

          {selected.length ? (
            <div className="flex flex-wrap gap-2">
              {selected.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggle(s)}
                  className="flex items-center gap-1.5 rounded-full bg-muted px-2 py-1 text-xs"
                >
                  <UserAvatar photoPath={s.photo_path} name={s.display_name} className="size-5" />
                  {s.display_name}
                </button>
              ))}
            </div>
          ) : null}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search people to add"
              className="pl-9"
            />
          </div>

          <div className="max-h-52 space-y-1 overflow-y-auto">
            {results.map((p) => {
              const on = selected.some((x) => x.id === p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted",
                    on && "bg-muted",
                  )}
                >
                  <UserAvatar photoPath={p.photo_path} name={p.display_name} className="size-9" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.display_name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      @{p.username}
                    </span>
                  </span>
                  {on ? <Check className="size-4 text-wa-green" /> : null}
                </button>
              );
            })}
          </div>

          <Button
            onClick={() => void submit()}
            disabled={busy}
            className="w-full bg-wa-green text-white hover:bg-wa-green/90"
          >
            {busy ? "Creating…" : kind === "group" ? "Create group" : "Create community"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
