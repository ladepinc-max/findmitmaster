export type ShopCategoryRow = {
  id: string;
  value: string;
  label: string;
  emoji: string;
  is_big_shop: boolean;
  registration_fee: number;
  is_waived: boolean;
  is_active: boolean;
  sort_order: number;
};

/** "Car Wash & Spa" -> "car-wash-spa" */
export function categorySlug(label: string) {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

/** Yearly fee for a shop's category; unknown/owner-written categories use the standard fee. */
export function categoryRegistrationFee(
  rows: Pick<ShopCategoryRow, "value" | "registration_fee" | "is_waived" | "is_active">[],
  category: string,
  standard: { amount: number; waived: boolean },
) {
  const hit = rows.find((r) => r.value === category && r.is_active);
  if (!hit) return { amount: standard.waived ? 0 : standard.amount, waived: standard.waived || standard.amount <= 0 };
  const amount = Number(hit.registration_fee);
  const waived = hit.is_waived || amount <= 0;
  return { amount: waived ? 0 : amount, waived };
}
