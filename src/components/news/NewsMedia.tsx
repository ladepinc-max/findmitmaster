import { useEffect, useState } from "react";
import { newsMediaUrl } from "@/lib/community-news";

export function useNewsMedia(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!path) return;
    void newsMediaUrl(path).then((u) => active && setUrl(u));
    return () => { active = false; };
  }, [path]);
  return url;
}

export function NewsMedia({ path, type, controls, className }: { path: string; type: string; controls?: boolean; className?: string }) {
  const url = useNewsMedia(path);
  if (!url) return <div className={`bg-muted ${className ?? ""}`} />;
  return type === "video" ? (
    <video src={controls ? url : `${url}#t=0.5`} controls={controls} playsInline muted={!controls} preload="metadata" className={`bg-muted object-cover ${className ?? ""}`} />
  ) : (
    <img src={url} alt="" loading="lazy" className={`object-cover ${className ?? ""}`} />
  );
}
