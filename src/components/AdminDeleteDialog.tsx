import { useState } from "react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { adminDelete } from "@/lib/admin-delete.functions";

export type DeleteTarget = { kind: "shop" | "supplier" | "news"; id: string; name: string } | null;

export function AdminDeleteDialog({ target, onClose, onDeleted }: { target: DeleteTarget; onClose: () => void; onDeleted: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const run = async (kind: "shop" | "supplier" | "news" | "news_and_community") => {
    if (!target) return;
    setBusy(true);
    try {
      await adminDelete({ data: { kind, id: target.id } });
      toast.success("Deleted from FindMit");
      onDeleted(target.id);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete");
    } finally {
      setBusy(false);
    }
  };
  return (
    <AlertDialog open={Boolean(target)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{target?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>This permanently removes it from FindMit. It cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          {target?.kind === "news" ? (
            <>
              <Button variant="destructive" disabled={busy} onClick={() => void run("news")}>Delete news only</Button>
              <Button variant="destructive" disabled={busy} onClick={() => void run("news_and_community")}>Delete news + community chat page</Button>
            </>
          ) : (
            <Button variant="destructive" disabled={busy} onClick={() => target && void run(target.kind)}>Delete permanently</Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
