import { useEffect, useState } from "react";
import { newsMediaUrl } from "@/lib/community-news";

export function useNewsMedia(path: string | null | undefined) {
  const [resolved, setResolved] = useState<{ path: string; url: string | null } | null>(null);
  useEffect(() => {
    let active = true;
    if (!path) return;
    void newsMediaUrl(path).then((url) => {
      if (active) setResolved({ path, url });
    }).catch(() => {
      if (active) setResolved({ path, url: null });
    });
    return () => { active = false; };
  }, [path]);
  return resolved && resolved.path === path ? resolved.url : null;
}