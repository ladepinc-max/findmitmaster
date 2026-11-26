import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { shopCategoriesTable, useShopCategories } from "@/lib/shop-categories";
import { categorySlug, type ShopCategoryRow } from "@/lib/shop-category-fees";

/** Admin: big-shop and standard categories, each with its own yearly registration fee. */
export function ShopCategoryPricing() {
  const { rows, reload } = useShopCategories();
  const [label, setLabel] = useState("");
  const [emoji, setEmoji] = useState("🏢");
  const [fee, setFee] = useState("500");
  const [big, setBig] = useState(true);
  const [adding, setAdding] = useState(false);

  const save = async (id: string, patch: Partial<ShopCategoryRow>) => {
    const { error } = await shopCategoriesTable().update(patch).eq("id", id);
    if (error) toast.error("Could not update category");
    else await reload();
  };

  const add = async () => {
    const value = categorySlug(label);
    const amount = Number(fee);
    if (!value || !(amount >= 0)) { toast.error("Enter a category name and fee"); return; }
    setAdding(true);
    const { error } = await shopCategoriesTable().insert({ value, label: label.trim(), emoji: emoji || "🏪", is_big_shop: big, registration_fee: amount, sort_order: big ? 5 : 50 });
    setAdding(false);
    if (error) { toast.error(error.code === "23505" ? "That category already exists" : "Could not add category"); return; }
    toast.success("Category added — it now shows on shop registration");
    setLabel(""); setFee(big ? "500" : "200");
    await reload();
  };

  const column = (title: string, list: ShopCategoryRow[]) => (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</p>
      {list.length === 0 ? <p className="text-xs text-muted-foreground">None yet</p> : null}
      {list.map((r) => <CategoryRow key={r.id} row={r} onSave={save} />)}
    </div>
  );

  return (
    <section className="mt-6 rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-display text-sm font-bold">Shop categories & registration fees</h2>
      <p className="mt-1 text-xs text-muted-foreground">Each category charges its own yearly fee. Changes show on the shop registration page instantly.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {column("Big shops", rows.filter((r) => r.is_big_shop))}
        {column("Standard shops", rows.filter((r) => !r.is_big_shop))}
      </div>
      <div className="mt-4 space-y-2 rounded-xl border border-dashed border-border p-3">
        <p className="text-sm font-medium">Add category</p>
        <div className="flex gap-2">
          <Input className="w-16" value={emoji} onChange={(e) => setEmoji(e.target.value)} aria-label="Category symbol" />
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Category name (e.g. Event Centre)" aria-label="New category name" />
        </div>
        <div className="flex items-center gap-2">
          <Input type="number" min={0} value={fee} onChange={(e) => setFee(e.target.value)} aria-label="New category fee" className="w-28" />
          <span className="text-xs text-muted-foreground">GH₵ / year</span>
          <label className="ml-auto flex items-center gap-2 text-xs">Big shop <Switch checked={big} onCheckedChange={setBig} /></label>
        </div>
        <Button className="w-full" disabled={adding} onClick={() => void add()}>{adding ? "Adding…" : "Add category"}</Button>
      </div>
    </section>
  );
}

function CategoryRow({ row, onSave }: { row: ShopCategoryRow; onSave: (id: string, p: Partial<ShopCategoryRow>) => Promise<void> }) {
  const [fee, setFee] = useState(String(row.registration_fee));
  const dirty = Number(fee) !== Number(row.registration_fee);
  return (
    <div className={`space-y-2 rounded-xl bg-background p-2 ${row.is_active ? "" : "opacity-60"}`}>
      <div className="flex items-center gap-2 text-sm">
        <span>{row.emoji}</span>
        <span className="flex-1 font-medium">{row.label}</span>
        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">Big <Switch checked={row.is_big_shop} onCheckedChange={(v) => void onSave(row.id, { is_big_shop: v })} /></label>
      </div>
      <div className="flex items-center gap-2">
        <Input type="number" min={0} value={fee} onChange={(e) => setFee(e.target.value)} className="h-8 w-24" aria-label={`${row.label} fee`} />
        <span className="text-[11px] text-muted-foreground">GH₵</span>
        {dirty ? <Button size="sm" className="h-8" onClick={() => void onSave(row.id, { registration_fee: Number(fee) || 0 })}>Save</Button> : null}
        <label className="ml-auto flex items-center gap-1 text-[11px]">Free <Switch checked={row.is_waived} onCheckedChange={(v) => void onSave(row.id, { is_waived: v })} /></label>
        <label className="flex items-center gap-1 text-[11px]">On <Switch checked={row.is_active} onCheckedChange={(v) => void onSave(row.id, { is_active: v })} /></label>
      </div>
    </div>
  );
}
