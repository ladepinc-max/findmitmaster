import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeGhanaPhone } from "./phone-verify.functions";

const FIREBASE_WEB_KEY = "AIzaSyBGx35APycc0KVp5xIH1QH-5jrPfjNhgKs";

/** Verifies a Firebase ID token with Google and returns the verified phone (233XXXXXXXXX). */
async function phoneFromFirebaseToken(idToken: string): Promise<string | null> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as { users?: { phoneNumber?: string }[] };
  const raw = json.users?.[0]?.phoneNumber;
  return raw ? normalizeGhanaPhone(raw) : null;
}

/** Checks whether a phone number or email already belongs to an account. */
export const checkAccountExists = createServerFn({ method: "POST" })
  .inputValidator((d: { phone?: string | undefined; email?: string | undefined }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const phone = data.phone ? normalizeGhanaPhone(data.phone) : null;
    if (data.phone && !phone) return { invalidPhone: true, phoneExists: false, emailExists: false };
    let phoneExists = false;
    let emailExists = false;
    if (phone) {
      const { count } = await supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("phone_number", phone);
      phoneExists = (count ?? 0) > 0;
    }
    const email = data.email?.trim().toLowerCase();
    if (email) {
      const { count } = await supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .ilike("contact_email", email);
      emailExists = (count ?? 0) > 0;
    }
    return { invalidPhone: false, phoneExists, emailExists };
  });

/** Confirms the Firebase OTP result server-side and returns the verified phone. */
export const confirmFirebasePhone = createServerFn({ method: "POST" })
  .inputValidator((d: { idToken: string }) => d)
  .handler(async ({ data }) => {
    const phone = await phoneFromFirebaseToken(data.idToken);
    if (!phone) return { ok: false as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("phone_number", phone);
    return { ok: true as const, phone, exists: (count ?? 0) > 0 };
  });

/** For signed-in users without a verified phone (e.g. new Google users). */
export const attachVerifiedPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { idToken: string }) => d)
  .handler(async ({ data, context }) => {
    const phone = await phoneFromFirebaseToken(data.idToken);
    if (!phone) return { ok: false as const, reason: "invalid" as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: taken } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("phone_number", phone)
      .neq("id", context.userId)
      .limit(1);
    if (taken && taken.length) return { ok: false as const, reason: "taken" as const };
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      user_metadata: { ...(u?.user?.user_metadata ?? {}), phone_number: phone, phone_verified: true },
    });
    await supabaseAdmin
      .from("profiles")
      .update({ phone_number: phone, phone_verified: true })
      .eq("id", context.userId);
    return { ok: true as const, phone };
  });
