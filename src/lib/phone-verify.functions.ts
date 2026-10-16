import { createServerFn } from "@tanstack/react-start";

/** Normalises a Ghana number to international format: 0244123456 -> 233244123456 */
export function normalizeGhanaPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (/^0\d{9}$/.test(digits)) return `233${digits.slice(1)}`;
  if (/^233\d{9}$/.test(digits)) return digits;
  if (/^\d{9}$/.test(digits)) return `233${digits}`;
  return null;
}

export const sendPhoneCode = createServerFn({ method: "POST" })
  .inputValidator((data: { phone: string }) => data)
  .handler(async ({ data }) => {
    const phone = normalizeGhanaPhone(data.phone);
    if (!phone) return { ok: false as const, reason: "invalid" as const };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Throttle: one code per 45 seconds per number.
    const { data: recent } = await supabaseAdmin
      .from("phone_verifications")
      .select("created_at")
      .eq("phone", phone)
      .order("created_at", { ascending: false })
      .limit(1);
    const last = recent?.[0]?.created_at as string | undefined;
    if (last && Date.now() - new Date(last).getTime() < 45_000) {
      return { ok: false as const, reason: "wait" as const };
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));

    const apiKey = process.env["ARKESEL_API_KEY"];
    if (!apiKey) return { ok: false as const, reason: "not_configured" as const };

    const res = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: "FindMit",
        message: `Your FindMit verification code is ${code}. It expires in 10 minutes.`,
        recipients: [phone],
      }),
    });
    if (!res.ok) return { ok: false as const, reason: "send_failed" as const };

    await supabaseAdmin.from("phone_verifications").insert({ phone, code });
    return { ok: true as const };
  });

export const verifyPhoneCode = createServerFn({ method: "POST" })
  .inputValidator((data: { phone: string; code: string }) => data)
  .handler(async ({ data }) => {
    const phone = normalizeGhanaPhone(data.phone);
    if (!phone) return { ok: false as const, reason: "invalid" as const };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("phone_verifications")
      .select("id, code, attempts, consumed, expires_at")
      .eq("phone", phone)
      .eq("consumed", false)
      .order("created_at", { ascending: false })
      .limit(1);

    const row = rows?.[0];
    if (!row) return { ok: false as const, reason: "no_code" as const };
    if (new Date(row.expires_at as string).getTime() < Date.now()) {
      return { ok: false as const, reason: "expired" as const };
    }
    if ((row.attempts as number) >= 5) return { ok: false as const, reason: "too_many" as const };

    if ((row.code as string) !== data.code.trim()) {
      await supabaseAdmin
        .from("phone_verifications")
        .update({ attempts: (row.attempts as number) + 1 })
        .eq("id", row.id as string);
      return { ok: false as const, reason: "wrong" as const };
    }

    await supabaseAdmin
      .from("phone_verifications")
      .update({ consumed: true })
      .eq("id", row.id as string);
    return { ok: true as const, phone };
  });
