import { useEffect, useState } from "react";
import { Camera, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { shopPhotoUrl, uploadShopPhoto } from "@/lib/shops";
import { backgroundBlur, MAX_BACKGROUND_BLUR } from "@/lib/shop-backgrounds";
import { ShopBackground } from "./ShopBackground";

export function ShopBackgroundEditor({ shop, userId }: { shop: {
  id: string; category: string; bg_photo_url: string | null; bg_opacity: number | null; bg_blur?: number;
}; userId: string }) {
  const [path, setPath] = useState(shop.bg_photo_url);
  const [url, setUrl] = useState<string | null>(null);
  const [opacity, setOpacity] = useState(Math.round((shop.bg_opacity ?? 0.2) * 100));
  const [blur, setBlur] = useState(backgroundBlur(shop.bg_blur));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    void shopPhotoUrl(path).then((next) => { if (alive) setUrl(next); });
    return () => { alive = false; };
  }, [path]);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try { setPath(await uploadShopPhoto(userId, file)); }
    catch { toast.error("Could not upload photo"); }
    finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.from("shops").update({ bg_photo_url: path, bg_opacity: opacity / 100, bg_blur: blur }).eq("id", shop.id);
      if (error) throw error;
      toast.success("Background saved");
    } catch { toast.error("Could not save background"); }
    finally { setBusy(false); }
  };
  return <section className="space-y-3 border-y border-border py-4">
    <h2 className="font-display font-bold">Shop background</h2>
    <div className="relative h-40 overflow-hidden rounded-lg border border-border bg-background">
      <ShopBackground shopId={`${shop.id}:preview`} category={shop.category} customUrl={url} opacity={opacity / 100} blur={blur} />
      <div className="relative flex h-full items-center justify-center text-sm font-semibold">{path ? "Custom background" : "Automatic background"}</div>
    </div>
    <Button asChild variant="outline" className="w-full" disabled={busy}>
      <label className="cursor-pointer"><Camera className="size-4" />{busy ? "Please wait…" : path ? "Change background photo" : "Choose custom photo"}
        <input type="file" accept="image/*" disabled={busy} className="hidden" onChange={(event) => void pick(event.target.files?.[0])} />
      </label>
    </Button>
    <label className="block space-y-2 text-sm"><span>Opacity: {opacity}%</span>
      <Slider aria-label="Background opacity" min={5} max={100} step={1} value={[opacity]} disabled={busy} onValueChange={(values) => setOpacity(values[0] ?? opacity)} />
    </label>
    <label className="block space-y-2 text-sm"><span>Blur: {blur}</span>
      <Slider aria-label="Background blur" min={0} max={MAX_BACKGROUND_BLUR} step={1} value={[blur]} disabled={busy} onValueChange={(values) => setBlur(values[0] ?? blur)} />
    </label>
    <div className="flex gap-2">
      {path ? <Button variant="outline" className="flex-1" disabled={busy} onClick={() => { setPath(null); setUrl(null); }}><RotateCcw className="size-4" />Use automatic</Button> : null}
      <Button className="flex-1" disabled={busy} onClick={() => void save()}>Save background</Button>
    </div>
  </section>;
}