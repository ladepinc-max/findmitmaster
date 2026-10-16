import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { completePaystackCheckout } from "@/lib/checkout.functions";
import { completeShopCheckout } from "@/lib/shop.functions";
import { safeReturnPath } from "@/lib/open-checkout";

export const Route = createFileRoute("/payment-verify")({
  head: () => ({
    meta: [
      { title: "Confirming your payment — FindMit" },
      { name: "description", content: "FindMit is confirming your mobile money payment and publishing your listing." },
      { property: "og:title", content: "Confirming your payment — FindMit" },
      { property: "og:description", content: "FindMit is confirming your mobile money payment and publishing your listing." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PaymentVerifyPage,
});

function readParams() {
  if (typeof window === "undefined") return { reference: "", back: null as string | null };
  const q = new URLSearchParams(window.location.search);
  return { reference: q.get("reference") ?? q.get("trxref") ?? "", back: q.get("return") };
}

function PaymentVerifyPage() {
  const navigate = useNavigate();
  const complete = useServerFn(completePaystackCheckout);
  const completeShop = useServerFn(completeShopCheckout);
  const search = useRouterState({ select: (state) => state.location.search }) as Record<string, string>;
  const [reference, setReference] = useState<string>(search["reference"] ?? search["trxref"] ?? "");
  const [back, setBack] = useState<string | null>(search["return"] ?? null);
  const [state, setState] = useState<"checking" | "done" | "failed">("checking");
  const [message, setMessage] = useState("Confirming your payment…");
  const started = useRef(false);

  const isShop = reference.startsWith("fm_shop_");
  const fallback = isShop ? "/my-shop" : "/jobs";
  const goBack = (dest?: string) => {
    const path = safeReturnPath(dest ?? back, fallback);
    void navigate({ href: path, replace: true });
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const fromUrl = readParams();
    const ref = fromUrl.reference || reference;
    const ret = fromUrl.back ?? back;
    setReference(ref);
    setBack(ret);
    if (!ref) {
      setState("failed");
      setMessage("We could not find this payment.");
      return;
    }
    const shop = ref.startsWith("fm_shop_");
    const run = async (attempt: number): Promise<void> => {
      try {
        if (shop) {
          const r = await completeShop({ data: { reference: ref } });
          setMessage(`Payment confirmed — @${r.handle} is live. Taking you back…`);
        } else {
          const r = await complete({ data: { reference: ref } });
          setMessage(
            r.kind === "job"
              ? "Payment confirmed — your job is live. Taking you back…"
              : "Payment confirmed — your listing is live. Taking you back…",
          );
        }
        setState("done");
        setTimeout(() => goBack(safeReturnPath(ret, shop ? "/my-shop" : "/jobs")), 1200);
      } catch (error: unknown) {
        // Mobile Money can take a few seconds to settle — retry before giving up.
        if (attempt < 6) {
          setTimeout(() => void run(attempt + 1), 3000);
          return;
        }
        setState("failed");
        setMessage(error instanceof Error ? error.message : "Payment could not be confirmed.");
      }
    };
    void run(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      {state === "checking" && <Loader2 className="h-10 w-10 animate-spin text-primary" />}
      {state === "done" && <CheckCircle2 className="h-12 w-12 text-primary" />}
      {state === "failed" && <XCircle className="h-12 w-12 text-destructive" />}
      <p className="max-w-sm text-base font-medium text-foreground">{message}</p>
      {state === "failed" && (
        <Button className="rounded-full" onClick={() => goBack()}>
          Go back
        </Button>
      )}
    </div>
  );
}
