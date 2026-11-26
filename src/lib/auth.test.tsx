import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { AuthProvider, useAuth } from "./auth";
import { AuthContext, type AuthContextValue } from "./auth-context";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {} } }));

function Consumer() {
  const { loading, profile } = useAuth();
  return <span>{profile?.display_name ?? (loading ? "loading" : "signed out")}</span>;
}

describe("shared authentication context", () => {
  it("connects route consumers to the root provider", () => {
    expect(renderToString(<AuthProvider><Consumer /></AuthProvider>)).toContain("loading");
  });
  it("reads the same standalone context used by the provider", () => {
    const value: AuthContextValue = {
      session: null, user: null, profile: null, loading: false,
      refreshProfile: async () => {}, signOut: async () => {},
    };
    expect(renderToString(<AuthContext.Provider value={value}><Consumer /></AuthContext.Provider>)).toContain("signed out");
  });
  it("still rejects consumers rendered outside the provider instead of silently losing sign-in state", () => {
    expect(() => renderToString(<Consumer />)).toThrow("useAuth must be used inside AuthProvider");
  });
});