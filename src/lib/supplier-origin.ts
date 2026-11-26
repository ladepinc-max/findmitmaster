/** Supplier tier is decided from the phone's GPS position (not IP), so a VPN cannot change it. */
export type SupplierOrigin = "gh" | "intl";

export function originFromGps(lat: number, lng: number): SupplierOrigin {
  return lat >= 4.5 && lat <= 11.2 && lng >= -3.3 && lng <= 1.25 ? "gh" : "intl";
}

export const SUPPLIER_FEE_KEY: Record<SupplierOrigin, "supplier_registration_gh" | "supplier_registration_intl"> = {
  gh: "supplier_registration_gh",
  intl: "supplier_registration_intl",
};

export const SUPPLIER_CURRENCY: Record<SupplierOrigin, "GHS" | "USD"> = { gh: "GHS", intl: "USD" };

export function formatSupplierFee(origin: SupplierOrigin, amount: number) {
  return origin === "gh" ? `GH₵ ${amount.toLocaleString()}` : `$${amount.toLocaleString()}`;
}
