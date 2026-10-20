export type FinanceState = {
  insuranceBalance: number;
  insuranceLockedUntil: string | null;
  activeEmergencyLoan: number;
  loanMonthlyDeduction: number;
  loanMonthsLeft: number;
  mainSalesAccount: number;
  partnerBankName: string;
  salesHistory: { at: string; label: string; amount: number }[];
};

export const emptyFinance = (): FinanceState => ({
  insuranceBalance: 0,
  insuranceLockedUntil: null,
  activeEmergencyLoan: 0,
  loanMonthlyDeduction: 0,
  loanMonthsLeft: 0,
  mainSalesAccount: 0,
  partnerBankName: "Partner Local Bank MoMo Merchant",
  salesHistory: [],
});

type Result = { ok: true; state: FinanceState; message: string } | { ok: false; message: string };

export function depositInsurance(s: FinanceState, amount: number, now = new Date()): Result {
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, message: "Enter an amount above zero" };
  const lock = new Date(now);
  lock.setFullYear(lock.getFullYear() + 5);
  return {
    ok: true,
    message: `GH₵ ${amount.toFixed(2)} added to your insurance reserve (locked 5 years)`,
    state: {
      ...s,
      insuranceBalance: s.insuranceBalance + amount,
      insuranceLockedUntil: lock.toISOString(),
      salesHistory: [{ at: now.toISOString(), label: "Insurance deposit", amount }, ...s.salesHistory].slice(0, 50),
    },
  };
}

export function requestEmergencyLoan(s: FinanceState, amount: number, months: number, now = new Date()): Result {
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, message: "Enter an amount above zero" };
  if (!Number.isInteger(months) || months < 1) return { ok: false, message: "Choose at least 1 month to repay" };
  if (amount > s.insuranceBalance) return { ok: false, message: "Loan denied: amount is more than your insurance reserve" };
  if (s.activeEmergencyLoan > 0) return { ok: false, message: "Loan denied: you already have an active emergency loan" };
  return {
    ok: true,
    message: `Loan approved: GH₵ ${amount.toFixed(2)} sent to your sales account`,
    state: {
      ...s,
      activeEmergencyLoan: amount,
      loanMonthlyDeduction: Math.round((amount / months) * 100) / 100,
      loanMonthsLeft: months,
      mainSalesAccount: s.mainSalesAccount + amount,
      salesHistory: [{ at: now.toISOString(), label: "Emergency loan", amount }, ...s.salesHistory].slice(0, 50),
    },
  };
}
