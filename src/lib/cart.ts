export type CartItem = { id: string; name: string; price_ghc: number; qty: number };

export function addToCart(cart: CartItem[], p: Omit<CartItem, "qty">): CartItem[] {
  const found = cart.find((i) => i.id === p.id);
  if (found) return cart.map((i) => (i.id === p.id ? { ...i, qty: i.qty + 1 } : i));
  return [...cart, { ...p, qty: 1 }];
}

export function setCartQty(cart: CartItem[], id: string, qty: number): CartItem[] {
  if (qty <= 0) return cart.filter((i) => i.id !== id);
  return cart.map((i) => (i.id === id ? { ...i, qty } : i));
}

export function cartCount(cart: CartItem[]) {
  return cart.reduce((n, i) => n + i.qty, 0);
}

/** Total in GH₵, rounded to pesewas. */
export function cartTotal(cart: CartItem[]) {
  return Math.round(cart.reduce((sum, i) => sum + Number(i.price_ghc) * i.qty, 0) * 100) / 100;
}

export function cartOrderText(cart: CartItem[], handle: string) {
  const lines = cart.map((i) => `• ${i.qty} × ${i.name} @ GH₵ ${Number(i.price_ghc).toFixed(2)} = GH₵ ${(Number(i.price_ghc) * i.qty).toFixed(2)}`);
  return [`🛒 Order for @${handle}`, ...lines, `Total: GH₵ ${cartTotal(cart).toFixed(2)}`].join("\n");
}
