import { useEffect, useState } from "react";
import { toast } from "sonner";
import * as F from "@/lib/shop-finance";

export function useShopFinance(shopId: string) {
  const key = `findmit_finance_${shopId}`;
  const [state, setState] = useState<F.FinanceState>(F.emptyFinance);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      setState(raw ? { ...F.emptyFinance(), ...JSON.parse(raw) } : F.emptyFinance());
    } catch {
      setState(F.emptyFinance());
    }
  }, [key]);

  const apply = (r: ReturnType<typeof F.depositInsurance>) => {
    if (!r.ok) {
      toast.error(r.message);
      return false;
    }
    setState(r.state);
    try { localStorage.setItem(key, JSON.stringify(r.state)); } catch { /* ignore */ }
    toast.success(r.message);
    return true;
  };

  return {
    ...state,
    depositInsurance: (amount: number) => apply(F.depositInsurance(state, amount)),
    requestEmergencyLoan: (amount: number, months: number) => apply(F.requestEmergencyLoan(state, amount, months)),
  };
}
