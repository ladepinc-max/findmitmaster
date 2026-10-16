/** Opens a Paystack checkout page at the top level so it is never blocked inside an embedded preview. */
export function openCheckout(url: string) {
  try {
    if (window.top && window.top !== window.self) {
      window.top.location.href = url;
      return;
    }
  } catch {
    const tab = window.open(url, "_blank", "noopener");
    if (tab) return;
  }
  window.location.href = url;
}

/** Callback URL for Paystack that remembers the page the user paid from. */
export function checkoutCallbackUrl() {
  const back = window.location.pathname + window.location.search;
  return `${window.location.origin}/payment-verify?return=${encodeURIComponent(back)}`;
}

/** Only allow same-site paths as the return destination. */
export function safeReturnPath(raw: string | null | undefined, fallback: string) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/payment-verify")) return fallback;
  return raw;
}
