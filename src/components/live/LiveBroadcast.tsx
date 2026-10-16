import { useEffect, useRef, useState } from "react";
import { Heart, MessageCircle, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  onEnd: () => void;
  isBroadcaster?: boolean;
}

/** TikTok-style full-screen broadcast with optional news overlays. */
export function LiveBroadcast({ onEnd, isBroadcaster = true }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [topic, setTopic] = useState("Educational News Live");
  const [showLowerThird, setShowLowerThird] = useState(true);
  const [tickerText, setTickerText] = useState("Breaking News");
  const [showTicker, setShowTicker] = useState(true);
  const [overflowImage, setOverflowImage] = useState<string | null>(null);
  const [showOverflow, setShowOverflow] = useState(false);
  const [showControls, setShowControls] = useState(true);

  useEffect(() => {
    let active = true;
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 640 },
            height: { ideal: 960 },
          },
          audio: true,
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {});
        }
      } catch (err) {
        console.error("Broadcast camera failed", err);
      }
    };
    void start();
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (overflowImage) URL.revokeObjectURL(overflowImage);
    };
  }, [overflowImage]);

  const handleOverflowFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (overflowImage) URL.revokeObjectURL(overflowImage);
    setOverflowImage(URL.createObjectURL(file));
  };

  const end = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    onEnd();
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="fixed inset-0 h-full w-full -scale-x-100 object-cover"
      />

      {/* Top overlay */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center gap-2 p-4 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <span className="flex items-center gap-1.5 rounded-full bg-destructive px-2.5 py-1 text-[0.7rem] font-black text-destructive-foreground">
          <span className="size-2 animate-pulse rounded-full bg-destructive-foreground" /> LIVE
        </span>
        <span className="rounded-full bg-black/50 px-2.5 py-1 text-[0.7rem] font-bold text-white">
          12.3K viewers
        </span>
        {isBroadcaster ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowControls((v) => !v)}
            className="ml-auto rounded-full bg-black/50 px-3 text-xs font-bold text-white hover:bg-black/70 hover:text-white"
          >
            {showControls ? "Hide" : "Controls"}
          </Button>
        ) : null}
        <Button
          size="icon"
          variant="ghost"
          onClick={end}
          aria-label="End broadcast"
          className="ml-2 rounded-full bg-black/50 text-white hover:bg-black/70 hover:text-white"
        >
          <X className="size-5" />
        </Button>
      </div>

      {/* Broadcaster control panel */}
      {isBroadcaster && showControls ? (
        <div className="absolute right-4 top-16 z-20 w-64 space-y-3 rounded-xl bg-black/30 p-4 text-white shadow-lg backdrop-blur-xl">
          <div className="space-y-1.5">
            <Label htmlFor="broadcast-topic" className="text-xs font-bold uppercase tracking-wide text-white">
              Topic / Title
            </Label>
            <Input
              id="broadcast-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="h-8 border-white/20 bg-black/20 text-sm text-white placeholder:text-white/50"
            />
            <div className="flex items-center gap-2">
              <Checkbox
                id="show-lower-third"
                checked={showLowerThird}
                onCheckedChange={(v) => setShowLowerThird(Boolean(v))}
                className="border-white/40 data-[state=checked]:bg-white data-[state=checked]:text-black"
              />
              <Label htmlFor="show-lower-third" className="text-xs font-medium text-white">
                Show to viewers
              </Label>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="broadcast-ticker" className="text-xs font-bold uppercase tracking-wide text-white">
              Ticker Text
            </Label>
            <Input
              id="broadcast-ticker"
              value={tickerText}
              onChange={(e) => setTickerText(e.target.value)}
              className="h-8 border-white/20 bg-black/20 text-sm text-white placeholder:text-white/50"
            />
            <div className="flex items-center gap-2">
              <Checkbox
                id="show-ticker"
                checked={showTicker}
                onCheckedChange={(v) => setShowTicker(Boolean(v))}
                className="border-white/40 data-[state=checked]:bg-white data-[state=checked]:text-black"
              />
              <Label htmlFor="show-ticker" className="text-xs font-medium text-white">
                Show to viewers
              </Label>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="broadcast-overflow" className="text-xs font-bold uppercase tracking-wide text-white">
              Overflow Image
            </Label>
            <Input
              id="broadcast-overflow"
              type="file"
              accept="image/*"
              onChange={handleOverflowFile}
              className="h-auto border-white/20 bg-black/20 text-xs text-white file:bg-white/10 file:text-white"
            />
            <div className="flex items-center gap-2">
              <Checkbox
                id="show-overflow"
                checked={showOverflow}
                onCheckedChange={(v) => setShowOverflow(Boolean(v))}
                className="border-white/40 data-[state=checked]:bg-white data-[state=checked]:text-black"
              />
              <Label htmlFor="show-overflow" className="text-xs font-medium text-white">
                Show to viewers
              </Label>
            </div>
          </div>

          <Button
            onClick={end}
            className="w-full bg-red-600 text-white hover:bg-red-700"
          >
            End Broadcast
          </Button>
        </div>
      ) : isBroadcaster ? null : (
        /* Viewer interaction rail */
        <div className="absolute bottom-24 right-4 z-20 flex flex-col items-center gap-5 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
          <button className="flex flex-col items-center gap-1 text-white">
            <span className="flex size-11 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
              <Heart className="size-5 fill-white" />
            </span>
            <span className="text-[0.65rem] font-bold">2.1k</span>
          </button>
          <button className="flex flex-col items-center gap-1 text-white">
            <span className="flex size-11 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
              <MessageCircle className="size-5" />
            </span>
            <span className="text-[0.65rem] font-bold">124</span>
          </button>
          <button className="flex flex-col items-center gap-1 text-white">
            <span className="flex size-11 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
              <Share2 className="size-5" />
            </span>
            <span className="text-[0.65rem] font-bold">Share</span>
          </button>
        </div>
      )}

      {/* Overflow picture-in-picture */}
      {showOverflow && overflowImage ? (
        <img
          src={overflowImage}
          alt="Overflow"
          className="absolute right-4 top-20 z-20 h-28 w-40 rounded-lg border-2 border-white object-cover shadow-lg"
        />
      ) : null}

      {/* Lower third */}
      {showLowerThird ? (
        <div className="absolute bottom-20 left-4 z-20 max-w-xs rounded-r-lg border-l-4 border-red-500 bg-white p-3 shadow-lg">
          <p className="text-sm font-black leading-tight text-black">{topic}</p>
        </div>
      ) : null}

      {/* Breaking-news ticker */}
      {showTicker ? (
        <div className="absolute inset-x-0 bottom-0 z-20 overflow-hidden bg-red-600 py-2">
          <div className="animate-marquee whitespace-nowrap px-2 text-sm font-bold text-white">
            {tickerText}
          </div>
        </div>
      ) : null}
    </div>
  );
}
