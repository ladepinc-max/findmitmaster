import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

/**
 * No swipe gestures. Keeps the app current: whenever it comes back on screen or
 * reconnects, saved screens stay visible and quietly refresh in the background.
 */
export function PullToRefresh() {
  const router = useRouter();
  const queryClient = useQueryClient();
  useEffect(() => {
    const softRefresh = () => {
      void queryClient.invalidateQueries();
      void router.invalidate();
      window.dispatchEvent(new Event("fm:refresh"));
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") softRefresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", softRefresh);
    const id = window.setInterval(softRefresh, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", softRefresh);
      window.clearInterval(id);
    };
  }, [queryClient, router]);
  return null;
}
