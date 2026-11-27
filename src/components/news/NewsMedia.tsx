import { useNewsMedia } from "@/hooks/use-news-media";

export function NewsMedia({ path, type, controls, className }: { path: string; type: string; controls?: boolean; className?: string }) {
  const url = useNewsMedia(path);
  if (!url) return <div className={`bg-muted ${className ?? ""}`} />;
  return type === "video" ? (
    <video src={controls ? url : `${url}#t=0.5`} controls={controls} controlsList="nodownload noremoteplayback" disablePictureInPicture disableRemotePlayback onContextMenu={(event) => event.preventDefault()} playsInline muted={!controls} preload="metadata" className={`bg-muted object-contain ${className ?? ""}`} />
  ) : (
    <img src={url} alt="" loading="lazy" draggable={false} onContextMenu={(event) => event.preventDefault()} className={`select-none object-contain ${className ?? ""}`} />
  );
}
