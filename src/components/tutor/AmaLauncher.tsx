import { useNavigate } from "@tanstack/react-router";
import { AmaAvatar } from "@/components/tutor/AmaAvatar";
import { useTutorSettings } from "@/lib/tutor";
import { cn } from "@/lib/utils";

/**
 * Floating AI tutor button. Tapping it opens the full tutor page.
 * Used in the chat header (same lane as the FindMit logo) and on the profile.
 */
export function AmaLauncher({
  className,
  label,
}: {
  className?: string;
  label?: string;
}) {
  const navigate = useNavigate();
  const { settings } = useTutorSettings();

  return (
    <button
      type="button"
      aria-label={`Open ${settings.tutor_name}, your AI tutor`}
      onClick={() => void navigate({ to: "/tutor" })}
      className={cn("ama-float flex shrink-0 flex-col items-center gap-0.5", className)}
    >
      <AmaAvatar src={settings.avatar_url} name={settings.tutor_name} size="sm" />
      {label ? (
        <span className="text-[10px] font-semibold text-muted-foreground">{label}</span>
      ) : null}
    </button>
  );
}

export default AmaLauncher;
