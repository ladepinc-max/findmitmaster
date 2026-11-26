import { useCallback } from "react";
import { Store, Truck } from "lucide-react";
import { shopPhotoUrl } from "@/lib/shops";
import { useCachedImage } from "@/lib/use-cached-image";

interface DirectoryPhotoProps {
  path: string | null;
  cacheKey: string;
  name: string;
  kind: "shop" | "supplier";
  className?: string;
}

/** A replaceable offline photo slot for each shop or supplier profile. */
export function DirectoryPhoto({ path, cacheKey, name, kind, className = "aspect-square w-full" }: DirectoryPhotoProps) {
  const resolve = useCallback(() => shopPhotoUrl(path), [path]);
  const url = useCachedImage(`directory:${kind}:${cacheKey}`, path, resolve);
  const Icon = kind === "shop" ? Store : Truck;
  return (
    <div className={`flex items-center justify-center overflow-hidden bg-secondary ${className}`}>
      {url ? <img src={url} alt={`${name} profile`} className="size-full object-cover" loading="lazy" /> : <Icon className="size-7 text-muted-foreground" aria-hidden="true" />}
    </div>
  );
}
