import { toast } from "sonner";
import { normaliseMomoNumber } from "@/lib/momo";


const PAYSTACK_KEY = import.meta.env["VITE_PAYSTACK_PUBLIC_KEY"] as string | undefined;

interface PaystackHandler {
  openIframe: () => void;
}

interface PaystackPop {
  setup: (options: Record<string, unknown>) => PaystackHandler;
}

function loadScript(): Promise<PaystackPop | null> {
  return new Promise((resolve) => {
    const existing = (window as unknown as { PaystackPop?: PaystackPop }).PaystackPop;
    if (existing) return resolve(existing);
    const current = document.querySelector<HTMLScriptElement>('script[src="https://js.paystack.co/v1/inline.js"]');
    if (current) {
      current.addEventListener("load", () =>
        resolve((window as unknown as { PaystackPop?: PaystackPop }).PaystackPop ?? null),
      );
      current.addEventListener("error", () => resolve(null));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://js.paystack.co/v1/inline.js";
    script.async = true;
    script.onload = () =>
      resolve((window as unknown as { PaystackPop?: PaystackPop }).PaystackPop ?? null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}


/**
 * Charges the practical seat with Paystack inline when a public key is configured.
 * Without a key the caller is asked to confirm instead so live testing still works.
 */
export async function payForPractical(params: {
  amount: number;
  email: string;
  reference: string;
}): Promise<boolean> {
  if (!PAYSTACK_KEY) {
    toast.info("Payments are not configured yet — joining the practical session for now");
    return true;
  }
  const paystack = await loadScript();
  if (!paystack) {
    toast.error("Could not load the payment window");
    return false;
  }

  return new Promise((resolve) => {
    const handler = paystack.setup({
      key: PAYSTACK_KEY,
      email: params.email || "student@findmeet.app",
      amount: params.amount * 100,
      currency: "GHS",
      ref: params.reference,
      onClose: () => resolve(false),
      callback: () => resolve(true),
    });
    handler.openIframe();
  });
}

/**
 * Opens Paystack Ghana checkout (MTN MoMo, Vodafone Cash, AirtelTigo, card).
 * Resolves true when the customer completes the payment.
 */
type PayParams = {
  amount: number;
  email: string;
  reference: string;
  phone?: string;
  provider?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Simple form: payWithPaystack(email, amountGHS, onSuccess).
 * Object form is kept for existing callers.
 */
export async function payWithPaystack(
  email: string,
  amountGHS: number,
  onSuccess?: (reference: string) => void,
): Promise<boolean>;
export async function payWithPaystack(params: PayParams): Promise<boolean>;
export async function payWithPaystack(
  arg: PayParams | string,
  amountGHS?: number,
  onSuccess?: (reference: string) => void,
): Promise<boolean> {
  if (typeof arg === "string") {
    const reference = `fm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const ok = await payWithPaystackObject({ email: arg, amount: amountGHS ?? 0, reference });
    if (ok) onSuccess?.(reference);
    return ok;
  }
  return payWithPaystackObject(arg);
}

async function payWithPaystackObject(params: PayParams): Promise<boolean> {
  if (!PAYSTACK_KEY) {
    toast.error("Payments are not configured yet — add your Paystack public key");
    return false;
  }
  const paystack = await loadScript();
  if (!paystack) {
    toast.error("Could not load the payment window");
    return false;
  }

  const phone = params.phone ? normaliseMomoNumber(params.phone) : "";
  const extra = params.metadata ?? {};
  const metadata: Record<string, unknown> = {
    ...extra,
    user_id: params.userId ?? null,
    ...(phone
      ? { mobile_money: { phone, provider: params.provider ?? "mtn" } }
      : {}),
    custom_fields: [
      ...(phone
        ? [{ display_name: "Phone", variable_name: "phone", value: phone }]
        : []),
      ...Object.entries(extra).map(([key, value]) => ({
        display_name: key,
        variable_name: key,
        value: String(value),
      })),
    ],
  };

  return new Promise((resolve) => {
    const handler = paystack.setup({
      key: PAYSTACK_KEY,
      email: params.email || "employer@findmeet.app",
      // Paystack expects the smallest unit: GHS 25 -> 2500, GHS 200 -> 20000.
      amount: Math.round(params.amount * 100),
      currency: "GHS",
      ref: params.reference,
      channels: ["mobile_money", "card"],
      ...(phone ? { phone } : {}),
      metadata,
      onClose: () => resolve(false),
      callback: () => resolve(true),
    });
    handler.openIframe();
  });
}


export const PAYSTACK_CONFIGURED = Boolean(PAYSTACK_KEY);
