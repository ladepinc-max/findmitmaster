import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { completePaystackCheckout } from "@/lib/checkout.functions";
import { completeShopCheckout } from "@/lib/shop.functions";

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

function PaymentVerifyPage() {
  const navigate = useNavigate();
  const complete = useServerFn(completePaystackCheckout);
  const completeShop = useServerFn(completeShopCheckout);
  const [shopHandle, setShopHandle] = useState<string | null>(null);
  const search = useRouterState({ select: (state) => state.location.search }) as Record<string, string>;
  const reference = search["reference"] ?? search["trxref"] ?? "";
  const [state, setState] = useState<"checking" | "done" | "failed">("checking");
  const [message, setMessage] = useState("Confirming your payment…");
  const [kind, setKind] = useState<"job" | "expertise">("job");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!reference) {
      setState("failed");
      setMessage("We could not find this payment.");
      return;
    }
    if (reference.startsWith("fm_shop_")) {
      void completeShop({ data: { reference } })
        .then((r) => {
          setShopHandle(r.handle);
          setState("done");
          setMessage(`Payment received — @${r.handle} is live for one year.`);
        })
        .catch((error: unknown) => {
          setState("failed");
          setMessage(error instanceof Error ? error.message : "Payment could not be confirmed.");
        });
      return;
    }
    void complete({ data: { reference } })
      .then((result) => {
        setKind(result.kind);
        setState("done");
        setMessage(
          result.kind === "job"
            ? "Payment received — your job is live for 30 days."
            : "Payment received — your expertise listing is live.",
        );
      })
      .catch((error: unknown) => {
        setState("failed");
        setMessage(error instanceof Error ? error.message : "Payment could not be confirmed.");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      {state === "checking" && <Loader2 className="h-10 w-10 animate-spin text-primary" />}
      {state === "done" && <CheckCircle2 className="h-12 w-12 text-emerald-500" />}
      {state === "failed" && <XCircle className="h-12 w-12 text-destructive" />}
      <p className="max-w-sm text-base font-medium text-foreground">{message}</p>
      {state !== "checking" && reference.startsWith("fm_shop_") ? (
        <Button className="rounded-full" onClick={() => navigate({ to: "/my-shop" })}>
          {shopHandle ? "Manage my shop" : "Back to my shop"}
        </Button>
      ) : null}
      {state !== "checking" && !reference.startsWith("fm_shop_") && (
        <Button
          className="rounded-full"
          onClick={() =>
            navigate({
              to: "/jobs",
              search: { tab: state === "done" && kind === "expertise" ? "talent" : "jobs" },
            })
          }
        >
          Back to Jobs
        </Button>
      )}
    </div>
  );
}
