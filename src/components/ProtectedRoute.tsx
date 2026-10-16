import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useRole, type AppRole } from "@/lib/roles";

/** Gates a screen by role. Anyone else is bounced home with a toast. */
export function ProtectedRoute({
  allow,
  children,
  message = "You do not have access to this page",
}: {
  allow: AppRole[];
  children: ReactNode;
  message?: string;
}) {
  const { role, loading } = useRole();
  const navigate = useNavigate();
  const allowed = allow.includes(role);

  useEffect(() => {
    if (loading || allowed) return;
    // Admin-only screens send others home silently so they never learn the page exists.
    if (!allow.includes("admin") || allow.length > 1) toast.error(message);
    void navigate({ to: "/jobs", search: { tab: "ghana" }, replace: true });
  }, [loading, allowed, message, navigate, allow]);

  if (loading || !allowed) return null;
  return <>{children}</>;
}
