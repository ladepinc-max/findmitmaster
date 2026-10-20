import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { openShopConversation, useShopInbox } from "@/lib/shop-chat";
import { ShopChatSheet } from "@/components/shop/ShopChatSheet";
import { ShopInboxSheet } from "@/components/shop/ShopInboxSheet";
import { useCachedState } from "@/lib/page-cache";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { BadgeCheck, ChevronLeft, CreditCard, MessageCircle, Minus, Plus, Send, ShoppingCart, X, Home as HomeIcon, IdCard, Loader2, MapPin, Navigation, Phone, ShieldAlert, Store, Users } from "lucide-react";
import { addToCart, cartCount, cartOrderText, cartTotal, setCartQty, type CartItem } from "@/lib/cart";
import policeCrest from "@/assets/ghana-police-crest.png.asset.json";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
const LiveNavigation = lazy(() => import("@/components/chat/LiveNavigation").then((m) => ({ default: m.LiveNavigation })));
import { categoryEmoji, categoryLabel, isPoliceShop, normaliseHandle, shopPhotoUrl, priceLabel } from "@/lib/shops";

export const Route = createFileRoute("/$handle")({
  beforeLoad: ({ params }) => {
    if (!decodeURIComponent(params.handle).startsWith("@")) throw notFound();
  },
  head: ({ params }) => {
    const h = normaliseHandle(decodeURIComponent(params.handle));
    return {
      meta: [
        { title: `@${h} — Shop on FindMit` },
        { name: "description", content: `Visit @${h} on FindMit: see products, call to order and get directions.` },
        { property: "og:title", content: `@${h} — Shop on FindMit` },
        { property: "og:description", content: `See products, call to order and get live directions to @${h}.` },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: StorefrontPage,
});

type Shop = {
  id: string;
  handle: string;
  name: string;
  category: string;
  phone: string;
  landmark: string | null;
  description: string | null;
  lat: number | null;
  lng: number | null;
  photo_url: string | null;
  owner_id: string;
  is_open: boolean;
  opening_hours: string | null;
  bg_photo_url?: string | null;
  bg_opacity?: number | null;
};
type Product = { id: string; name: string; description: string | null; price_ghc: number; photo_url: string | null; is_available: boolean };
const db = supabase as unknown as { from: (t: string) => any };

function StorefrontPage() {
  const { handle } = Route.useParams();
  const h = normaliseHandle(decodeURIComponent(handle));
  const { session, user } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const [zoom, setZoom] = useState<Product | null>(null);
  const [menu, setMenu] = useState<Product | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [chat, setChat] = useState<{ id: string; draft: string | undefined } | null>(null);
  const [ownerInboxOpen, setOwnerInboxOpen] = useState(false);
  const countedView = useRef<string | null>(null);
  const pressTimer = useRef<number | null>(null);
  const lastTap = useRef<{ id: string; t: number } | null>(null);
  const longFired = useRef(false);
  const navigate = useNavigate();
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [shop, setShop] = useCachedState<Shop | null>(`shop:${h}`, null, (s) => {
    if (s) setState("ready");
  });
  const [cover, setCover] = useCachedState<string | null>(`shop:${h}:cover`, null);
  const [bg, setBg] = useCachedState<string | null>(`shop:${h}:bg`, null);
  const [products, setProducts] = useCachedState<Product[]>(`shop:${h}:products`, []);
  const [thumbs, setThumbs] = useCachedState<Record<string, string | null>>(`shop:${h}:thumbs`, {});
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const cartKey = `findmit:cart:${h}`;
  useEffect(() => {
    try { const raw = localStorage.getItem(cartKey); setCart(raw ? (JSON.parse(raw) as CartItem[]) : []); } catch { /* ignore */ }
  }, [cartKey]);
  useEffect(() => {
    try { if (cart.length) localStorage.setItem(cartKey, JSON.stringify(cart)); else localStorage.removeItem(cartKey); } catch { /* ignore */ }
  }, [cart, cartKey]);
  const inbox = useShopInbox(shop?.id ?? "", user?.id);
  useEffect(() => {
    if (!shop || countedView.current === shop.id || user?.id === shop.owner_id) return;
    countedView.current = shop.id;
    void supabase.rpc("increment_shop_view", { _shop_id: shop.id });
  }, [shop, user?.id]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      // Only paid, unexpired shops are visible to customers.
      const { data, error } = await db
        .from("shops")
        .select("id, owner_id, handle, name, category, phone, landmark, description, lat, lng, photo_url, subscription_status, subscription_expires_at, is_open, opening_hours, bg_photo_url, bg_opacity")
        .eq("handle", h)
        .eq("subscription_status", "active")
        .gt("subscription_expires_at", new Date().toISOString())
        .maybeSingle();
      if (!alive || error) return;
      if (!data) {
        setShop(null);
        return setState("missing");
      }
      const s = data as Shop;
      setShop(s);
      setState("ready");
      const c = await shopPhotoUrl(s.photo_url);
      if (alive) setCover((prev) => (prev === c ? prev : c));
      const bgu = await shopPhotoUrl(s.bg_photo_url ?? null);
      if (alive) setBg(bgu);
      const { data: list } = await db.from("shop_products").select("*").eq("shop_id", s.id).order("sort_order").order("created_at");
      if (!alive || !list) return;
      const ps = list as Product[];
      setProducts(ps);
      const urls = await Promise.all(ps.map((p) => shopPhotoUrl(p.photo_url)));
      if (alive) setThumbs(Object.fromEntries(ps.map((p, i) => [p.id, urls[i] ?? null])));
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h]);

  if (state === "loading")
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );

  if (state === "missing" || !shop)
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <Store className="size-10 text-muted-foreground" />
        <h1 className="font-display text-xl font-bold">@{h} is not open</h1>
        <p className="max-w-xs text-sm text-muted-foreground">This shop doesn't exist yet or its yearly registration has not been paid.</p>
        <Button onClick={() => void navigate({ to: "/my-shop" })}>Register your own shop</Button>
      </main>
    );

  const directions = () => {
    if (shop.lat == null || shop.lng == null) return void toast.error("This shop has no map location yet");
    setNavOpen(true);
  };

  const openChat = async (product?: Product, presetDraft?: string) => {
    if (!session || !user) {
      toast("Sign in to chat with this shop");
      return void navigate({ to: "/auth" });
    }
    if (user.id === shop.owner_id) { setOwnerInboxOpen(true); return; }
    setChatBusy(true);
    try {
      const id = await openShopConversation(shop.id, user.id, shop.owner_id);
      let draft: string | undefined = presetDraft;
      if (product) {
        const link = `${window.location.origin}/@${shop.handle}`;
        const lines = [
          `🛍️ ${product.name}`,
          `${priceLabel(product.price_ghc)} · ${product.is_available ? "Available" : "Sold out"}`,
          product.description ? product.description : null,
          `From @${shop.handle}: ${link}`,
        ].filter(Boolean);
        draft = lines.join("\n");
      }
      setChat({ id, draft });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open chat");
    } finally {
      setChatBusy(false);
    }
  };

  const pressStart = (p: Product) => {
    longFired.current = false;
    pressTimer.current = window.setTimeout(() => {
      longFired.current = true;
      navigator.vibrate?.(30);
      setMenu(p);
    }, 500);
  };
  const pressEnd = () => {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };
  const tapProduct = (p: Product) => {
    if (longFired.current) return;
    const now = Date.now();
    if (lastTap.current && lastTap.current.id === p.id && now - lastTap.current.t < 300) {
      lastTap.current = null;
      setZoom(p);
    } else lastTap.current = { id: p.id, t: now };
  };

  const ActionButtons = ({ big }: { big?: boolean }) => {
    const size = big ? "size-12" : "size-10";
    const icon = big ? "size-5" : "size-4";
    return (
      <div className="flex gap-2">
        <Button asChild size="icon" className={`${size} rounded-full`} aria-label="Call">
          <a href={tel}><Phone className={icon} /></a>
        </Button>
        {(
          <Button size="icon" variant="secondary" className={`${size} relative rounded-full`} aria-label={user?.id === shop.owner_id ? "Shop messages" : "Chat with shop"} disabled={chatBusy} onClick={() => void openChat()}>
            {chatBusy ? <Loader2 className={`${icon} animate-spin`} /> : <MessageCircle className={icon} />}
            {inbox.unread > 0 ? <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{inbox.unread}</span> : null}
          </Button>
        )}
        {shop.lat != null ? (
          <Button size="icon" variant="outline" className={`${size} rounded-full`} aria-label="Directions to shop" onClick={directions}>
            <Navigation className={icon} />
          </Button>
        ) : null}
      </div>
    );
  };

  const police = isPoliceShop(shop);
  const tel = `tel:${shop.phone.replace(/\s/g, "")}`;
  const avatar = police ? policeCrest.url : cover;
  const policeServices = [
    { label: "Report Theft", Icon: ShieldAlert, tone: "text-orange-400" },
    { label: "Domestic Case", Icon: HomeIcon, tone: "text-rose-400" },
    { label: "Lost ID", Icon: IdCard, tone: "text-sky-400" },
    { label: "Community Help", Icon: Users, tone: "text-emerald-400" },
  ];

  return (
    <main className="min-h-dvh bg-background pb-28">
      <header className="sticky top-0 z-10 flex items-center border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <button type="button" aria-label="Back" onClick={() => window.history.length > 1 ? window.history.back() : void navigate({ to: "/jobs", search: { tab: "jobs" } })}>
          <ChevronLeft className="size-6" />
        </button>
        <p className="flex-1 text-center font-display text-base font-semibold">FindMit</p>
        <span className="size-6" />
      </header>

      <section className="mx-auto max-w-lg px-4 pt-5">
        <div className="flex items-center gap-4 rounded-3xl bg-card p-4 shadow-sm">
          <div className={`size-24 shrink-0 overflow-hidden rounded-full ${police ? "" : "border border-border bg-muted"}`}>
            {avatar ? (
              <img src={avatar} alt={`${shop.name} logo`} className={`size-full ${police ? "object-contain" : "object-cover"}`} />
            ) : (
              <div className="flex size-full items-center justify-center text-4xl">{categoryEmoji(shop.category)}</div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <h1 className="flex items-center gap-1.5 font-display text-lg font-bold leading-tight">
              <span className="min-w-0 break-words">{shop.name}</span>
              <BadgeCheck className={`size-5 shrink-0 ${police ? "text-sky-400" : "text-wa-green"}`} aria-label="Verified" />
            </h1>
            <p className="truncate text-sm text-muted-foreground">@{shop.handle}</p>
            <p className="flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-xs">
              <MapPin className="size-3.5 shrink-0" /> <span className="truncate">{shop.landmark || categoryLabel(shop.category)}</span>
            </p>
            <ActionButtons />
          </div>
        </div>

        <div className="mt-3 space-y-1 border-y border-border py-3"><p className={`text-sm font-semibold ${shop.is_open === false ? "text-destructive" : "text-wa-green"}`}>{shop.is_open === false ? "Currently Closed" : "Open"}</p><p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">Opening hours: {shop.opening_hours || "Not provided yet"}</p></div>
        {shop.description && !police ? <p className="mt-3 text-sm text-muted-foreground">{shop.description}</p> : null}

        <div className="mt-6 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">Services</h2>
          {!police ? <span className="text-sm text-muted-foreground">Available now</span> : null}
        </div>

        {police ? (
          <>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {policeServices.map(({ label, Icon, tone }) => (
                <a key={label} href={tel} className="flex aspect-square flex-col items-center justify-center gap-3 rounded-3xl bg-card p-3 text-center shadow-sm">
                  <Icon className={`size-14 ${tone}`} strokeWidth={1.75} />
                  <span className="text-sm font-semibold">{label}</span>
                </a>
              ))}
            </div>
            <p className="mt-4 text-center text-sm text-muted-foreground">Call your station for assistance</p>
          </>
        ) : products.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No services listed yet — call to ask.</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3">
            {products.map((p) => (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                onPointerDown={() => pressStart(p)}
                onPointerUp={pressEnd}
                onPointerLeave={pressEnd}
                onPointerCancel={pressEnd}
                onContextMenu={(e) => e.preventDefault()}
                onClick={() => tapProduct(p)}
                onDoubleClick={() => setZoom(p)}
                className={`select-none rounded-2xl border border-border bg-card p-2.5 shadow-sm [-webkit-touch-callout:none] ${p.is_available ? "" : "opacity-60"}`}
              >
                <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted">
                  {thumbs[p.id] ? (
                    <img src={thumbs[p.id] ?? ""} alt={p.name} className="pointer-events-none size-full object-cover" loading="lazy" draggable={false} />
                  ) : (
                    <div className="flex size-full items-center justify-center text-3xl">{categoryEmoji(shop.category)}</div>
                  )}
                  {!p.is_available ? (
                    <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 bg-destructive py-1 text-center text-xs font-bold uppercase tracking-wide text-destructive-foreground">
                      Out of stock
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 line-clamp-2 font-display text-sm font-bold">{p.name}</p>
                <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px]">
                  <span className={`size-2 rounded-full ${p.is_available ? "bg-wa-green" : "bg-destructive"}`} />
                  {p.is_available ? "In stock" : "Out of stock"}
                </span>
                <p className="mt-1 font-display text-base font-bold text-wa-green">{priceLabel(p.price_ghc)}</p>
                {p.is_available && user?.id !== shop.owner_id ? (() => {
                  const inCart = cart.find((i) => i.id === p.id);
                  return inCart ? (
                    <div className="mt-2 flex items-center justify-between" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                      <Button size="icon" variant="outline" className="size-8" aria-label={`Less ${p.name}`} onClick={() => setCart((c) => setCartQty(c, p.id, inCart.qty - 1))}><Minus className="size-3" /></Button>
                      <QtyInput qty={inCart.qty} name={p.name} onChange={(q) => setCart((c) => setCartQty(c, p.id, q))} />
                      <Button size="icon" variant="outline" className="size-8" aria-label={`More ${p.name}`} onClick={() => setCart((c) => setCartQty(c, p.id, inCart.qty + 1))}><Plus className="size-3" /></Button>
                    </div>
                  ) : (
                    <Button size="sm" className="mt-2 w-full" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setCart((c) => addToCart(c, { id: p.id, name: p.name, price_ghc: Number(p.price_ghc) })); }}><ShoppingCart className="size-3" /> Add to cart</Button>
                  );
                })() : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 p-3 backdrop-blur">
        {cart.length ? (
          <button type="button" className="mx-auto mb-2 flex w-full max-w-lg items-center justify-between rounded-xl bg-primary px-4 py-3 text-primary-foreground" onClick={() => setCartOpen(true)}>
            <span className="flex items-center gap-2 text-sm font-semibold"><ShoppingCart className="size-4" /> {cartCount(cart)} item{cartCount(cart) === 1 ? "" : "s"}</span>
            <span className="font-display font-bold">GH₵ {cartTotal(cart).toFixed(2)}</span>
          </button>
        ) : null}
        <div className="mx-auto flex max-w-lg items-center justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-medium">
            {police ? "Tap to Call Police" : products.length ? "Double-tap to view · hold to send to chat" : shop.name}
          </p>
          <ActionButtons big />
        </div>
      </div>

      {cartOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/60" onClick={() => setCartOpen(false)}>
          <div className="max-h-[85dvh] w-full max-w-lg space-y-3 overflow-y-auto rounded-t-3xl bg-card p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><p className="font-display text-lg font-bold">Your cart</p><Button size="icon" variant="ghost" aria-label="Close cart" onClick={() => setCartOpen(false)}><X className="size-5" /></Button></div>
            {cart.map((i) => (
              <div key={i.id} className="flex items-center gap-3">
                {thumbs[i.id] ? <img src={thumbs[i.id] ?? ""} alt="" className="size-12 rounded-lg object-cover" /> : <span className="flex size-12 items-center justify-center rounded-lg bg-muted">{categoryEmoji(shop.category)}</span>}
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{i.name}</p><p className="text-xs text-muted-foreground">GH₵ {Number(i.price_ghc).toFixed(2)} each</p></div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" className="size-8" aria-label={`Less ${i.name}`} onClick={() => setCart((c) => setCartQty(c, i.id, i.qty - 1))}><Minus className="size-3" /></Button>
                  <QtyInput qty={i.qty} name={i.name} onChange={(q) => setCart((c) => setCartQty(c, i.id, q))} />
                  <Button size="icon" variant="outline" className="size-8" aria-label={`More ${i.name}`} onClick={() => setCart((c) => setCartQty(c, i.id, i.qty + 1))}><Plus className="size-3" /></Button>
                </div>
                <p className="w-20 text-right text-sm font-bold">GH₵ {(Number(i.price_ghc) * i.qty).toFixed(2)}</p>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-border pt-3"><span className="font-semibold">Total</span><span className="font-display text-xl font-bold text-wa-green">GH₵ {cartTotal(cart).toFixed(2)}</span></div>
            <Button size="lg" className="w-full bg-wa-green text-primary-foreground hover:bg-wa-green/90" onClick={() => toast.info("Online payment is coming soon. Your cart is saved.")}><CreditCard className="size-4" /> Pay GH₵ {cartTotal(cart).toFixed(2)}</Button>
            <Button variant="outline" className="w-full" disabled={chatBusy} onClick={() => { setCartOpen(false); void openChat(undefined, cartOrderText(cart, shop.handle)); }}><Send className="size-4" /> Send order to shop chat</Button>
            <Button variant="ghost" className="w-full" onClick={() => { setCart([]); setCartOpen(false); }}>Clear cart</Button>
          </div>
        </div>
      ) : null}


      {chat && user ? <ShopChatSheet key={chat.id} conversationId={chat.id} meId={user.id} otherId={shop.owner_id} title={shop.name} subtitle={`@${shop.handle} · ${shop.is_open === false ? "Closed" : "Open"}`} draft={chat.draft} onClose={() => { setChat(null); void inbox.refresh(); }} /> : null}
      {ownerInboxOpen && user ? <ShopInboxSheet shopId={shop.id} meId={user.id} onClose={() => { setOwnerInboxOpen(false); void inbox.refresh(); }} /> : null}
      {zoom ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur" onClick={() => setZoom(null)}>
          <div className="flex justify-end p-3">
            <Button size="icon" variant="ghost" aria-label="Close"><X className="size-6" /></Button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center px-4">
            {thumbs[zoom.id] ? (
              <img src={thumbs[zoom.id] ?? ""} alt={zoom.name} className="max-h-full max-w-full rounded-2xl object-contain" />
            ) : (
              <div className="text-7xl">{categoryEmoji(shop.category)}</div>
            )}
          </div>
          <div className="mx-auto w-full max-w-lg space-y-2 p-5" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-xl font-bold">{zoom.name}</p>
            <div className="flex items-center gap-3">
              <span className="font-display text-lg font-bold text-wa-green">{priceLabel(zoom.price_ghc)}</span>
              <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${zoom.is_available ? "bg-muted" : "bg-destructive text-destructive-foreground"}`}>{zoom.is_available ? "In stock" : "Out of stock"}</span>
            </div>
            {zoom.description ? <p className="whitespace-pre-wrap text-sm text-muted-foreground">{zoom.description}</p> : null}
            <Button className="w-full" onClick={() => { const p = zoom; setZoom(null); void openChat(p); }}>
              <Send className="size-4" /> Send to chat
            </Button>
          </div>
        </div>
      ) : null}

      {menu ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/60 p-4" onClick={() => setMenu(null)}>
          <div className="w-full max-w-sm space-y-2 rounded-2xl bg-card p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <p className="truncate text-sm font-semibold">{menu.name} · {priceLabel(menu.price_ghc)}</p>
            <Button className="w-full" disabled={chatBusy} onClick={() => { const p = menu; setMenu(null); void openChat(p); }}>
              <MessageCircle className="size-4" /> Send to chat with @{shop.handle}
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setMenu(null)}>Cancel</Button>
          </div>
        </div>
      ) : null}

      {navOpen && shop.lat != null && shop.lng != null ? (
        <div className="fixed inset-0 z-50 bg-background">
          <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="size-6 animate-spin" /></div>}>
            <LiveNavigation
              target={{ lat: shop.lat, lng: shop.lng, label: shop.name, landmark: shop.landmark ?? undefined }}
              onClose={() => setNavOpen(false)}
            />
          </Suspense>
        </div>
      ) : null}
    </main>
  );
}

function QtyInput({ qty, name, onChange }: { qty: number; name: string; onChange: (q: number) => void }) {
  const [text, setText] = useState(String(qty));
  useEffect(() => setText(String(qty)), [qty]);
  const commit = () => {
    const n = Math.floor(Number(text));
    if (Number.isFinite(n) && n > 0) onChange(Math.min(n, 9999));
    else setText(String(qty));
  };
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={`Quantity of ${name}`}
      value={text}
      onChange={(e) => setText(e.target.value.replace(/\D/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className="h-8 w-12 rounded-md border border-input bg-background text-center text-sm font-semibold"
    />
  );
}
