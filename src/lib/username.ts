import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const USERNAME_HINT = "3–20 characters. Letters, numbers, dots and underscores only.";
const PATTERN = /^[a-z0-9._]{3,20}$/;

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export type UsernameStatus = "idle" | "invalid" | "checking" | "available" | "taken";

export interface UsernameCheck {
  status: UsernameStatus;
  message: string | null;
}

/** Live-checks username availability with debounce. `ignoreId` skips the current user's own row. */
export function useUsernameCheck(raw: string, ignoreId?: string): UsernameCheck {
  const value = normalizeUsername(raw);
  const [check, setCheck] = useState<UsernameCheck>({ status: "idle", message: null });

  useEffect(() => {
    if (!value) {
      setCheck({ status: "idle", message: null });
      return;
    }
    if (!PATTERN.test(value)) {
      setCheck({ status: "invalid", message: USERNAME_HINT });
      return;
    }

    setCheck({ status: "checking", message: "Checking availability…" });
    let active = true;
    const timer = setTimeout(async () => {
      let query = supabase.from("profiles").select("id").eq("username", value).limit(1);
      if (ignoreId) query = query.neq("id", ignoreId);
      const { data, error } = await query;
      if (!active) return;
      if (error) {
        setCheck({ status: "idle", message: null });
        return;
      }
      if (data && data.length > 0) {
        setCheck({ status: "taken", message: `@${value} is already taken` });
      } else {
        setCheck({ status: "available", message: `@${value} is available` });
      }
    }, 400);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [value, ignoreId]);

  return check;
}
