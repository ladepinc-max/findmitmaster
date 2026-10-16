import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as SupabaseClient;

export type ContactAudience = "approved" | "friends" | "public";

export interface VisibleContact {
  phone: string | null;
  email: string | null;
}

/** Reads another person's contact details — the server hides them unless you're allowed. */
export async function fetchVisibleContact(ownerId: string): Promise<VisibleContact> {
  const { data, error } = await db.rpc("get_visible_contact", { _owner_id: ownerId });
  if (error) return { phone: null, email: null };
  const row = Array.isArray(data) ? data[0] : data;
  return { phone: row?.phone ?? null, email: row?.email ?? null };
}

export function useVisibleContact(ownerId: string | null) {
  const [contact, setContact] = useState<VisibleContact>({ phone: null, email: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ownerId) {
      setContact({ phone: null, email: null });
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void fetchVisibleContact(ownerId).then((value) => {
      if (!active) return;
      setContact(value);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [ownerId]);

  return { contact, loading };
}

/** Whether I have already allowed this person to see my contact details. */
export async function fetchMyPermission(viewerId: string, meId: string) {
  const { data } = await db
    .from("contact_permissions")
    .select("allow_phone, allow_email")
    .eq("owner_id", meId)
    .eq("viewer_id", viewerId)
    .maybeSingle();
  return {
    allowPhone: Boolean(data?.allow_phone),
    allowEmail: Boolean(data?.allow_email),
  };
}

export async function setContactPermission(
  meId: string,
  viewerId: string,
  allow: { allowPhone: boolean; allowEmail: boolean },
) {
  if (!allow.allowPhone && !allow.allowEmail) {
    await db.from("contact_permissions").delete().eq("owner_id", meId).eq("viewer_id", viewerId);
    return;
  }
  await db.from("contact_permissions").upsert(
    {
      owner_id: meId,
      viewer_id: viewerId,
      allow_phone: allow.allowPhone,
      allow_email: allow.allowEmail,
    },
    { onConflict: "owner_id,viewer_id" },
  );
}

export interface ContactPrefs {
  phoneNumber: string | null;
  phoneVerified: boolean;
  contactEmail: string | null;
  showPhoneTo: ContactAudience;
  showEmailTo: ContactAudience;
}

export async function fetchMyContactPrefs(meId: string): Promise<ContactPrefs | null> {
  const { data } = await db
    .from("profiles")
    .select("phone_number, phone_verified, contact_email, show_phone_to, show_email_to")
    .eq("id", meId)
    .maybeSingle();
  if (!data) return null;
  return {
    phoneNumber: data.phone_number ?? null,
    phoneVerified: Boolean(data.phone_verified),
    contactEmail: data.contact_email ?? null,
    showPhoneTo: (data.show_phone_to ?? "approved") as ContactAudience,
    showEmailTo: (data.show_email_to ?? "approved") as ContactAudience,
  };
}

export async function updateMyContactPrefs(
  meId: string,
  patch: Partial<{ show_phone_to: ContactAudience; show_email_to: ContactAudience }>,
) {
  await db.from("profiles").update(patch).eq("id", meId);
}
