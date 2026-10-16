import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Folder,
  FolderOpen,
  MoreVertical,
  Pencil,
  Play,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { useMediaUrl } from "@/lib/media";
import {
  FOLDER_COLORS,
  formatDuration,
  type FolderItemType,
  type ProfileFolder,
} from "@/lib/folders";
import { cn } from "@/lib/utils";
import wallpaperSrc from "@/assets/chat-wallpaper.jpg";
const wallpaper = { url: wallpaperSrc };

export interface MediaItem {
  id: string;
  type: FolderItemType;
  title: string;
  subject: string | null;
  duration: number | null;
  createdAt: string;
  thumbPath: string | null;
  progress?: number | null;
}

/* ------------------------------- create/edit ------------------------------ */

export function FolderDialog({
  open,
  onOpenChange,
  folder,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder?: ProfileFolder | null;
  onSubmit: (name: string, color: string) => Promise<void> | void;
}) {
  const [name, setName] = useState(folder?.name ?? "");
  const [color, setColor] = useState(folder?.color ?? FOLDER_COLORS[0]!.value);
  const [busy, setBusy] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setName(folder?.name ?? "");
          setColor(folder?.color ?? FOLDER_COLORS[0]!.value);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{folder ? "Edit folder" : "Create new folder"}</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Folder name e.g. Integrated Science, Maths, JHS 2"
        />
        <div className="flex items-center gap-3">
          {FOLDER_COLORS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-label={option.label}
              onClick={() => setColor(option.value)}
              className={cn(
                "size-8 rounded-full border-2 transition-transform",
                color === option.value ? "scale-110 border-foreground" : "border-transparent",
              )}
              style={{ backgroundColor: option.value }}
            />
          ))}
        </div>
        <DialogFooter>
          <Button
            disabled={!name.trim() || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSubmit(name.trim(), color);
                onOpenChange(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {folder ? "Save" : "Create folder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------- folder card ----------------------------- */

export function FolderCard({
  folder,
  count,
  active,
  onOpen,
  onRename,
  onDelete,
}: {
  folder: ProfileFolder;
  count: number;
  active: boolean;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const startPress = () => {
    timer.current = setTimeout(() => setMenuOpen(true), 500);
  };
  const endPress = () => {
    if (timer.current) clearTimeout(timer.current);
  };

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <motion.div
        data-folder-id={folder.id}
        layout
        animate={active ? { scale: 1.04 } : { scale: 1 }}
        onClick={onOpen}
        onPointerDown={startPress}
        onPointerUp={endPress}
        onPointerLeave={endPress}
        className={cn(
          "relative cursor-pointer rounded-2xl border p-3 transition-shadow",
          active ? "border-transparent shadow-lg" : "border-border",
        )}
        style={{
          backgroundColor: `${folder.color}14`,
          boxShadow: active ? `0 0 0 2px ${folder.color}, 0 0 24px ${folder.color}66` : undefined,
        }}
      >
        <div className="flex items-start justify-between">
          <Folder className="size-7" style={{ color: folder.color }} />
          <DropdownMenuTrigger asChild onClick={(event) => event.stopPropagation()}>
            <button type="button" aria-label="Folder options" className="text-muted-foreground">
              <MoreVertical className="size-4" />
            </button>
          </DropdownMenuTrigger>
        </div>
        <p className="mt-2 truncate font-display text-sm font-bold">{folder.name}</p>
        <p className="text-xs text-muted-foreground">
          {count} item{count === 1 ? "" : "s"}
        </p>
        <p className="text-[11px] text-muted-foreground">
          Updated {new Date(folder.updated_at).toLocaleDateString()}
        </p>
      </motion.div>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onRename}>
          <Pencil className="size-4" /> Rename / change colour
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onDelete} className="text-destructive">
          <Trash2 className="size-4" /> Delete folder
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* -------------------------------- media card ------------------------------ */

export function MediaCard({
  item,
  folders,
  onDropOnFolder,
  onHoverFolder,
  onAddToFolder,
  onRemove,
}: {
  item: MediaItem;
  folders: ProfileFolder[];
  onDropOnFolder: (folderId: string, item: MediaItem) => void;
  onHoverFolder: (folderId: string | null) => void;
  onAddToFolder: (item: MediaItem) => void;
  onRemove?: () => void;
}) {
  const url = useMediaUrl(item.thumbPath ?? undefined, 320);
  const duration = formatDuration(item.duration);

  const folderUnderPoint = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    return el?.closest<HTMLElement>("[data-folder-id]")?.dataset["folderId"] ?? null;
  };

  return (
    <motion.div
      layout
      drag={folders.length > 0}
      dragSnapToOrigin
      dragElastic={0.2}
      whileDrag={{ scale: 1.06, zIndex: 50, opacity: 0.9 }}
      onDrag={(_, info) => onHoverFolder(folderUnderPoint(info.point.x, info.point.y))}
      onDragEnd={(_, info) => {
        const folderId = folderUnderPoint(info.point.x, info.point.y);
        onHoverFolder(null);
        if (folderId) onDropOnFolder(folderId, item);
      }}
      className="relative overflow-hidden rounded-xl border border-border bg-card touch-none"
    >
      <div className="relative aspect-square bg-secondary">
        {url ? (
          <img src={url} alt={item.title} className="size-full object-cover" loading="lazy" />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <Play className="size-6" />
          </div>
        )}
        {duration ? (
          <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 text-[11px] text-white">
            {duration}
          </span>
        ) : null}
        {typeof item.progress === "number" ? (
          <span className="absolute bottom-1 left-1 rounded bg-primary/90 px-1.5 text-[11px] font-semibold text-primary-foreground">
            Watched {item.progress}%
          </span>
        ) : null}
      </div>
      <div className="flex items-start justify-between gap-1 p-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium">{item.title}</p>
          {item.subject ? (
            <span className="mt-1 inline-block rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary">
              {item.subject}
            </span>
          ) : null}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Item options" className="text-muted-foreground">
              <MoreVertical className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onAddToFolder(item)}>
              <FolderOpen className="size-4" /> Add to folder
            </DropdownMenuItem>
            {onRemove ? (
              <DropdownMenuItem onSelect={onRemove} className="text-destructive">
                <Trash2 className="size-4" /> Remove from folder
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  );
}

/* ------------------------------ move-to drawer ---------------------------- */

export function MoveToFolderDrawer({
  item,
  folders,
  onClose,
  onPick,
}: {
  item: MediaItem | null;
  folders: ProfileFolder[];
  onClose: () => void;
  onPick: (folderId: string) => void;
}) {
  return (
    <Drawer open={!!item} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Move to folder</DrawerTitle>
        </DrawerHeader>
        <div className="max-h-[50vh] space-y-1 overflow-y-auto px-4 pb-8">
          {folders.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Create a folder first using the folder button on your profile.
            </p>
          ) : (
            folders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                onClick={() => onPick(folder.id)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-secondary"
              >
                <Folder className="size-5" style={{ color: folder.color }} />
                <span className="text-sm font-medium">{folder.name}</span>
              </button>
            ))
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/* ------------------------------- folder view ------------------------------ */

export function FolderView({
  folder,
  items,
  onBack,
  onRemove,
}: {
  folder: ProfileFolder;
  items: MediaItem[];
  onBack: () => void;
  onRemove: (item: MediaItem) => void;
}) {
  const [term, setTerm] = useState("");
  const filtered = useMemo(
    () =>
      items.filter((item) =>
        `${item.title} ${item.subject ?? ""}`.toLowerCase().includes(term.trim().toLowerCase()),
      ),
    [items, term],
  );

  return (
    <section className="px-4 pb-8">
      <nav className="flex items-center gap-1 py-3 text-sm text-muted-foreground">
        <button type="button" onClick={onBack} className="hover:text-foreground">
          Profile
        </button>
        <span>›</span>
        <span className="font-medium text-foreground">{folder.name}</span>
      </nav>

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={`Search in ${folder.name}`}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyFolder />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {filtered.map((item) => (
            <MediaCard
              key={`${item.type}-${item.id}`}
              item={item}
              folders={[]}
              onDropOnFolder={() => undefined}
              onHoverFolder={() => undefined}
              onAddToFolder={() => undefined}
              onRemove={() => onRemove(item)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function EmptyFolder() {
  return (
    <div
      className="flex h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-cover bg-center text-center"
      style={{
        backgroundImage: `linear-gradient(rgba(0,0,0,0.72), rgba(0,0,0,0.72)), url(${wallpaper.url})`,
      }}
    >
      <FolderOpen className="mb-2 size-8 text-primary" />
      <p className="text-sm font-medium text-white">Drag videos here to organize</p>
      <p className="text-xs text-white/70">Or use the 3-dot menu → Add to folder</p>
    </div>
  );
}
