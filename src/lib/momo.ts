import { supabase } from "@/integrations/supabase/client";

export const MOMO_PROVIDERS = [
  { value: "mtn", label: "MTN MoMo" },
  { value: "vod", label: "Vodafone Cash" },
  { value: "atl", label: "AirtelTigo Money" },
] as const;

export interface MomoDetails {
  number: string;
  provider: string;
}

/** Ghana mobile numbers: 10 digits starting with 0, or 233XXXXXXXXX. */
export function normaliseMomoNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("233")) return `0${digits.slice(3)}`;
  return digits;
}

export function isValidMomoNumber(value: string) {
  const number = normaliseMomoNumber(value);
  return /^0\d{9}$/.test(number);
}

/** Reads the saved mobile money details so the checkout can be pre-filled. */
export async function loadMomoDetails(userId: string): Promise<MomoDetails | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("payment_momo_number, payment_momo_provider")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data?.payment_momo_number) return null;
  return {
    number: data.payment_momo_number,
    provider: data.payment_momo_provider ?? "mtn",
  };
}

/** Stores the mobile money details on the profile for next time. */
export async function saveMomoDetails(userId: string, details: MomoDetails) {
  const { error } = await supabase
    .from("profiles")
    .update({
      payment_momo_number: normaliseMomoNumber(details.number),
      payment_momo_provider: details.provider,
    })
    .eq("id", userId);
  if (error) throw error;
}
