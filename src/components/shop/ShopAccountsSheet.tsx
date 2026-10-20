import { useState } from "react";
import { HandCoins, Landmark, Package, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useShopFinance } from "@/hooks/useShopFinance";

const cedi = (n: number) => `GH₵ ${n.toFixed(2)}`;

export function ShopAccountsSheet({ shopId, shopName, productCount, onClose }: { shopId: string; shopName: string; productCount: number; onClose: () => void }) {
  const f = useShopFinance(shopId);
  const [deposit, setDeposit] = useState("");
  const [loan, setLoan] = useState("");
  const [months, setMonths] = useState("3");

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={onClose}>
      <div className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-background p-4 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="font-display text-lg font-bold">Accounts & Finance</h2>
            <p className="text-sm text-muted-foreground">{shopName}</p>
          </div>
          <Button size="icon" variant="ghost" aria-label="Close" onClick={onClose}><X className="size-5" /></Button>
        </div>
        <div className="space-y-3">
          <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
            <p className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 text-wa-green" />Insurance Reserve</p>
            <p className="text-2xl font-bold">{cedi(f.insuranceBalance)}</p>
            <p className="text-xs text-muted-foreground">{f.insuranceLockedUntil ? `Locked until ${new Date(f.insuranceLockedUntil).toLocaleDateString()}` : "Deposits are locked for 5 years"}</p>
            <div className="flex gap-2">
              <Input inputMode="decimal" placeholder="Amount" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
              <Button onClick={() => { if (f.depositInsurance(Number(deposit))) setDeposit(""); }}>Deposit</Button>
            </div>
          </section>
          <section className="space-y-1 rounded-2xl border border-border bg-card p-4">
            <p className="flex items-center gap-2 text-sm font-semibold"><Landmark className="size-4 text-wa-green" />Main Sales Account</p>
            <p className="text-2xl font-bold">{cedi(f.mainSalesAccount)}</p>
            <p className="text-xs text-muted-foreground">{f.partnerBankName}</p>
          </section>
          <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
            <p className="flex items-center gap-2 text-sm font-semibold"><HandCoins className="size-4 text-wa-green" />Emergency Loan</p>
            {f.activeEmergencyLoan > 0 ? (
              <p className="text-sm">Active: <b>{cedi(f.activeEmergencyLoan)}</b> · {cedi(f.loanMonthlyDeduction)}/month for {f.loanMonthsLeft} months</p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">Borrow up to your insurance reserve ({cedi(f.insuranceBalance)})</p>
                <div className="flex gap-2">
                  <Input inputMode="decimal" placeholder="Amount" value={loan} onChange={(e) => setLoan(e.target.value)} />
                  <Input inputMode="numeric" className="w-20" aria-label="Months" value={months} onChange={(e) => setMonths(e.target.value.replace(/\D/g, ""))} />
                  <Button onClick={() => { if (f.requestEmergencyLoan(Number(loan), Number(months))) setLoan(""); }}>Apply</Button>
                </div>
                <p className="text-xs text-muted-foreground">Amount · months to repay</p>
              </>
            )}
          </section>
          <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
            <p className="flex items-center gap-2 text-sm font-semibold"><Package className="size-4 text-wa-green" />Inventory & Activity</p>
            <p className="text-sm">{productCount} products in your shop</p>
            {f.salesHistory.length ? (
              <ul className="space-y-1 text-sm">
                {f.salesHistory.slice(0, 8).map((h, i) => (
                  <li key={i} className="flex justify-between"><span>{h.label} · {new Date(h.at).toLocaleDateString()}</span><b>{cedi(h.amount)}</b></li>
                ))}
              </ul>
            ) : <p className="text-xs text-muted-foreground">No activity yet</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
