/** Instant answers for the Home search bar: currency conversion and simple maths. Pure helpers. */

const CURRENCY_WORDS: Record<string, string> = {
  usd: "USD", dollar: "USD", dollars: "USD", $: "USD",
  ghs: "GHS", ghc: "GHS", cedi: "GHS", cedis: "GHS",
  gbp: "GBP", pound: "GBP", pounds: "GBP",
  eur: "EUR", euro: "EUR", euros: "EUR",
  ngn: "NGN", naira: "NGN",
  xof: "XOF", cfa: "XOF",
  cny: "CNY", yuan: "CNY",
  cad: "CAD", zar: "ZAR", rand: "ZAR",
};

export interface ForexQuery { amount: number; from: string; to: string }

/** Recognises "usd to ghs", "100 dollars in cedis", "cedi rate", "dollar rate". */
export function parseForexQuery(raw: string): ForexQuery | null {
  const q = raw.toLowerCase().replace(/,/g, "").trim();
  const pair = q.match(/^(?:([\d.]+)\s*)?([a-z$]+)\s+(?:to|in|into|=)\s+([a-z$]+)(?:\s+rate)?$/);
  if (pair) {
    const from = CURRENCY_WORDS[pair[2]!];
    const to = CURRENCY_WORDS[pair[3]!];
    if (from && to && from !== to) return { amount: pair[1] ? Number(pair[1]) || 1 : 1, from, to };
  }
  const rate = q.match(/^(?:([\d.]+)\s*)?([a-z$]+)\s+(?:exchange\s+)?rates?(?:\s+today)?$/);
  if (rate) {
    const c = CURRENCY_WORDS[rate[2]!];
    if (c === "GHS") return { amount: 1, from: "USD", to: "GHS" };
    if (c) return { amount: rate[1] ? Number(rate[1]) || 1 : 1, from: c, to: "GHS" };
  }
  if (/^(forex|exchange rates?)(\s+today)?$/.test(q)) return { amount: 1, from: "USD", to: "GHS" };
  return null;
}

/** Evaluates simple arithmetic like "500 * 15%" or "(20+5)/2". Returns null when not maths. */
export function evaluateMath(raw: string): number | null {
  const s = raw.replace(/\s+/g, "").replace(/x/gi, "*").replace(/÷/g, "/");
  if (!/^[\d.+\-*/()%]+$/.test(s) || !/[+\-*/%]/.test(s) || !/\d/.test(s)) return null;
  const expr = s.replace(/(\d+(?:\.\d+)?)%/g, "($1/100)");
  let i = 0;
  const peek = () => expr[i];
  const num = (): number => {
    if (peek() === "(") { i++; const v = add(); if (peek() !== ")") throw new Error("paren"); i++; return v; }
    if (peek() === "-") { i++; return -num(); }
    const m = expr.slice(i).match(/^\d+(?:\.\d+)?/);
    if (!m) throw new Error("num");
    i += m[0].length;
    return Number(m[0]);
  };
  const mul = (): number => {
    let v = num();
    while (peek() === "*" || peek() === "/") { const op = expr[i++]; const r = num(); v = op === "*" ? v * r : v / r; }
    return v;
  };
  const add = (): number => {
    let v = mul();
    while (peek() === "+" || peek() === "-") { const op = expr[i++]; const r = mul(); v = op === "+" ? v + r : v - r; }
    return v;
  };
  try {
    const v = add();
    return i === expr.length && Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : null;
  } catch {
    return null;
  }
}
