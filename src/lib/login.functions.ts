import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

/**
 * Signs in with either an email address or a username.
 * The username is resolved server-side so email addresses are never exposed to the browser.
 */
export const loginWithIdentifier = createServerFn({ method: "POST" })
  .inputValidator((data: { identifier: string; password: string }) => data)
  .handler(async ({ data }) => {
    const identifier = data.identifier.trim();
    if (!identifier || !data.password) return { ok: false as const, reason: "invalid" as const };

    let email = identifier;

    if (!identifier.includes("@")) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { normalizeGhanaPhone } = await import("./phone-verify.functions");
      const phone = /^[+\d\s-]+$/.test(identifier) ? normalizeGhanaPhone(identifier) : null;
      const { data: row } = phone
        ? await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("phone_number", phone)
            .limit(1)
            .maybeSingle()
        : await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("username", identifier.toLowerCase())
            .maybeSingle();
      if (!row) return { ok: false as const, reason: "bad_credentials" as const };
      const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(row.id as string);
      if (!userRes?.user?.email) return { ok: false as const, reason: "bad_credentials" as const };
      email = userRes.user.email;
    }

    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const client = createClient(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
            h.delete("Authorization");
          }
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });

    const { data: signIn, error } = await client.auth.signInWithPassword({
      email,
      password: data.password,
    });
    if (error || !signIn.session) return { ok: false as const, reason: "bad_credentials" as const };

    return {
      ok: true as const,
      access_token: signIn.session.access_token,
      refresh_token: signIn.session.refresh_token,
    };
  });
