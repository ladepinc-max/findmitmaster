import { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MOMO_PROVIDERS, loadMomoDetails, type MomoDetails } from "@/lib/momo";

/**
 * Collects the mobile money number used for checkout.
 * Pre-fills from the saved profile value but stays editable.
 */
export function MomoFields({
  userId,
  value,
  onChange,
  enabled = true,
}: {
  userId: string | undefined;
  value: MomoDetails;
  onChange: (details: MomoDetails) => void;
  enabled?: boolean;
}) {
  useEffect(() => {
    if (!userId || !enabled || value.number) return;
    void loadMomoDetails(userId).then((saved) => {
      if (saved) onChange(saved);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, enabled]);

  if (!enabled) return null;

  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">MoMo Payment Number *</Label>
        <Input
          inputMode="tel"
          value={value.number}
          onChange={(event) => onChange({ ...value, number: event.target.value })}
          placeholder="055XXXXXXX"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Provider *</Label>
        <Select value={value.provider} onValueChange={(provider) => onChange({ ...value, provider })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MOMO_PROVIDERS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
