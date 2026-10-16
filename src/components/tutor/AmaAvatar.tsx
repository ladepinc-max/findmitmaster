import amaDefault from "@/assets/ama-tutor.png";
import { cn } from "@/lib/utils";

interface Props {
  src?: string | null;
  name: string;
  speaking?: boolean;
  size?: "sm" | "lg";
  className?: string;
}

/**
 * Lightweight 2D tutor avatar: a single illustration with CSS blink and
 * talking motion, so it stays instant and data-cheap on Ghanaian phones.
 */
export function AmaAvatar({ src, name, speaking = false, size = "lg", className }: Props) {
  const dimension = size === "lg" ? "size-28" : "size-12";
  return (
    <div className={cn("relative shrink-0", dimension, className)}>
      <div
        className={cn(
          "size-full overflow-hidden rounded-full border-2 border-primary/60 bg-primary/10",
          speaking ? "ama-speaking" : "ama-idle",
        )}
      >
        <img
          src={src || amaDefault}
          alt={name}
          loading="lazy"
          width={816}
          height={816}
          className="size-full object-cover object-top"
        />
        {/* Blink overlay: a soft eyelid sweep keeps her feeling alive. */}
        <span className="ama-blink pointer-events-none absolute inset-x-0 top-[26%] h-[8%] bg-foreground/70" />
      </div>
      {speaking ? (
        <span className="absolute -bottom-1 left-1/2 flex -translate-x-1/2 items-end gap-0.5">
          <i className="ama-bar h-2 w-1 rounded-full bg-primary" />
          <i className="ama-bar h-3 w-1 rounded-full bg-primary [animation-delay:120ms]" />
          <i className="ama-bar h-2 w-1 rounded-full bg-primary [animation-delay:240ms]" />
        </span>
      ) : null}
    </div>
  );
}
