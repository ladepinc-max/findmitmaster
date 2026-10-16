import { useCachedState } from "@/lib/page-cache";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PriceKey =
  | "classroom_raise"
  | "job_post"
  | "job_apply"
  | "talent_post"
  | "talent_employ"
  | "tutor_monthly"
  | "graduate_application"
  | "company_application"
  | "shop_registration";

export interface AppPrice {
  key: string;
  label: string;
  amount: number;
}

const FALLBACK: Record<PriceKey, number> = {
  classroom_raise: 20,
  job_post: 100,
  job_apply: 30,
  talent_post: 30,
  talent_employ: 100,
  tutor_monthly: 20,
  graduate_application: 350,
  company_application: 3000,
  shop_registration: 200,
};

// The table isn't in the generated types yet, so query it loosely.
const table = () => (supabase as unknown as { from: (t: string) => any }).from("app_pricing");

export async function fetchPrices(): Promise<AppPrice[]> {
  const { data } = await table().select("key, label, amount").order("key");
  return (data ?? []) as AppPrice[];
}

export async function updatePrice(key: string, amount: number) {
  const { error } = await table().update({ amount }).eq("key", key);
  if (error) throw error;
}

/** Current GHS price for a key, read live from the admin pricing table. */
export function useAppPrice(key: PriceKey) {
  const [amount, setAmount] = useState<number>(FALLBACK[key]);
  const [loading, setLoading] = useState(true);
  const [waived, setWaived] = useState(false);
  useEffect(() => {
    let active = true;
    const load = () =>
      void table()
        .select("amount, is_waived")
        .eq("key", key)
        .maybeSingle()
        .then(({ data }: { data: { amount: number; is_waived?: boolean } | null }) => {
          if (!active) return;
          if (data) {
            setAmount(Number(data.amount));
            setWaived(Boolean(data.is_waived));
          }
          setLoading(false);
        });
    load();
    // Reflect admin price edits everywhere, instantly.
    const channel = supabase
      .channel(`app-pricing-${key}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_pricing" }, () => load())
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [key]);
  // An admin waiver makes the section free for everyone.
  return { amount: waived ? 0 : amount, fullAmount: amount, waived, loading };
}


export function useAllPrices() {
  const [prices, setPrices] = useCachedState<AppPrice[]>("app:prices", []);
  const reload = useCallback(async () => setPrices(await fetchPrices()), []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { prices, reload };
}
