import { useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCachedState } from "@/lib/page-cache";
import { useAppPrice } from "@/lib/pricing";
import { categoryRegistrationFee, type ShopCategoryRow } from "@/lib/shop-category-fees";

const table = () => (supabase as unknown as { from: (t: string) => any }).from("shop_categories");

export async function fetchShopCategories(): Promise<ShopCategoryRow[]> {
  const { data } = await table().select("*").order("sort_order").order("label");
  return (data ?? []) as ShopCategoryRow[];
}

/** Live list of admin-managed categories; updates instantly when the admin edits them. */
export function useShopCategories() {
  const [rows, setRows] = useCachedState<ShopCategoryRow[]>("app:shop-categories", []);
  const reload = useCallback(async () => setRows(await fetchShopCategories()), [setRows]);
  useEffect(() => {
    void reload();
    const ch = supabase
      .channel(`shop-categories-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shop_categories" }, () => void reload())
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }, [reload]);
  return { rows, reload };
}

export function useCategoryFee(category: string) {
  const { rows } = useShopCategories();
  const std = useAppPrice("shop_registration");
  return categoryRegistrationFee(rows, category, { amount: std.fullAmount, waived: std.waived });
}

export { table as shopCategoriesTable };
