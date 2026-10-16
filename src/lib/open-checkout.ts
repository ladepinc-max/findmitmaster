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
