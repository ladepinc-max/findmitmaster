import { User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAvatarUrl } from "@/lib/avatar";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  photoPath?: string | null | undefined;
  /** Convenience: pass a profile-like object instead of photoPath/name. */
  profile?: { display_name?: string | null; photo_path?: string | null } | null | undefined;
  name?: string | undefined;
  className?: string | undefined;
}

export function UserAvatar({ photoPath, profile, name, className }: UserAvatarProps) {
  const path = photoPath ?? profile?.photo_path ?? null;
  const label = name ?? profile?.display_name ?? "?";
  const url = useAvatarUrl(path);
  return (
    <Avatar className={cn("bg-muted", className)}>
      {url ? <AvatarImage src={url} alt={label} /> : null}
      <AvatarFallback className="bg-muted text-muted-foreground">
        <User className="h-[55%] w-[55%]" strokeWidth={1.75} />
      </AvatarFallback>
    </Avatar>
  );
}
