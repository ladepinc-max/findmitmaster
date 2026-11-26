import { clearPageCache } from "@/lib/page-cache";
import { clearInterfaceImages } from "@/lib/interface-image-cache";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AuthContext, type AuthContextValue, type Profile } from "./auth-context";
export type { Profile } from "./auth-context";

const PROFILE_KEY = "fm-cache:v1:profile";
function cachedProfile(userId: string): Profile | null {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null") as Profile | null;
    return p && p.id === userId ? p : null;
  } catch {
    return null;
  }
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  // Offline (or network failure): keep the last saved profile so the app opens normally.
  if (typeof navigator !== "undefined" && !navigator.onLine) return cachedProfile(userId);
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("Failed to load profile", error);
    return cachedProfile(userId);
  }
  try {
    if (data) localStorage.setItem(PROFILE_KEY, JSON.stringify(data));
  } catch {
    /* storage full */
  }
  return (data as Profile | null) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async (nextSession: Session | null) => {
      if (!active) return;
      setSession(nextSession);
      if (nextSession?.user) {
        const nextProfile = await fetchProfile(nextSession.user.id);
        if (!active) return;
        setProfile(nextProfile);
      } else {
        setProfile(null);
      }
      if (active) setLoading(false);
    };

    supabase.auth.getSession().then(({ data }) => {
      void load(data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "TOKEN_REFRESHED") {
        setSession(nextSession);
        return;
      }
      setLoading(true);
      void load(nextSession);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session?.user) return;
    setProfile(await fetchProfile(session.user.id));
  }, [session?.user]);

  const signOut = useCallback(async () => {
    clearPageCache();
    await clearInterfaceImages();
    try { localStorage.removeItem(PROFILE_KEY); } catch { /* ignore */ }
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      refreshProfile,
      signOut,
    }),
    [session, profile, loading, refreshProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
