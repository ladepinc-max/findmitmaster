import { useCallback, type ComponentProps } from "react";
import { useCachedImage } from "@/lib/use-cached-image";

export function CachedInterfaceImage({ cacheKey, src, ...props }: ComponentProps<"img"> & { cacheKey: string; src: string }) {
  const resolve = useCallback(async () => src, [src]);
  const url = useCachedImage(cacheKey, src, resolve, src);
  return <img {...props} src={url ?? src} />;
}