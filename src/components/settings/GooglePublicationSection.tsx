import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";

export function GooglePublicationSection() {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let active = true;
    void supabase.from("publication_settings").select("google_indexing_enabled").eq("id", true).single().then(({ data, error }) => {
      if (!active) return;
      setEnabled(data?.google_indexing_enabled === true);
      setBusy(false);
      if (error) toast.error("Could not read Google visibility");
    });
    return () => { active = false; };
  }, []);
  async function change(value: boolean) {
    setBusy(true);
    const { data, error } = await supabase.from("publication_settings").update({ google_indexing_enabled: value }).eq("id", true).select("id").single();
    setBusy(false);
    if (error || !data) { toast.error("Could not change Google visibility"); return; }
    setEnabled(value);
    toast.success(value ? "Google indexing enabled" : "Google indexing disabled");
  }
  return <section className="space-y-3 px-6 py-6">
    <h2 className="font-bold">Google visibility</h2>
    <div className="flex items-center justify-between gap-4">
      <label htmlFor="google-publication" className="text-sm font-medium">Allow FindMit pages in Google</label>
      <Switch id="google-publication" checked={enabled} disabled={busy} onCheckedChange={(value) => void change(value)} />
    </div>
    <p className="text-sm text-muted-foreground">{enabled ? "Public shops, suppliers, jobs, news and offers can be indexed." : "Trial pages stay out of search. Shared FindMit links still open normally."} Google may take time to update existing results.</p>
  </section>;
}