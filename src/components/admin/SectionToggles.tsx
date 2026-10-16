import { Eye, EyeOff, Lock, LockOpen } from "lucide-react";
import type { AppSection, SectionId } from "@/lib/app-sections";
import { cn } from "@/lib/utils";

/** Super-admin only: Eye (hide/show) + Padlock (lock/unlock) controls for one section. */
export function SectionToggles({
  section,
  onToggle,
  className,
}: {
  section: AppSection | undefined;
  onToggle: (id: SectionId, field: "is_hidden" | "is_locked") => void;
  className?: string;
}) {
  if (!section) return null;
  const hidden = section.is_hidden;
  const locked = section.is_locked;

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <button
        type="button"
        aria-label={hidden ? "Show to users" : "Hide from users"}
        onClick={(event) => {
          event.stopPropagation();
          onToggle(section.id, "is_hidden");
        }}
        className="grid size-7 place-items-center rounded-full bg-black/70 text-white"
      >
        {hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
      <button
        type="button"
        aria-label={locked ? "Unlock for users" : "Lock for users"}
        onClick={(event) => {
          event.stopPropagation();
          onToggle(section.id, "is_locked");
        }}
        className="grid size-7 place-items-center rounded-full bg-black/70 text-white"
      >
        {locked ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
      </button>
      <span className="rounded-full bg-black/70 px-2 py-0.5 text-[0.6rem] font-bold text-white">
        {hidden ? "👁️ Hidden" : "👁️ Visible"} + {locked ? "🔒 Locked" : "🔓 Open"}
      </span>
    </div>
  );
}
