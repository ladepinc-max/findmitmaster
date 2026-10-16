import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Bug, LogOut, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRole } from "@/lib/roles";
import { deleteMyAccount } from "@/lib/account.functions";
import { isDebugPanelEnabled, setDebugPanelEnabled } from "@/lib/webrtc-debug";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { ContactPrivacySection } from "@/components/settings/ContactPrivacySection";
import { ApplicationsSection } from "@/components/settings/ApplicationsSection";
import { PricingSection } from "@/components/settings/PricingSection";
import { StoriesAccessSection } from "@/components/settings/StoriesAccessSection";
import { TutorSettingsSection } from "@/components/settings/TutorSettingsSection";
import { AmaVoiceTuning } from "@/components/settings/AmaVoiceTuning";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — FindMit" },
      { name: "description", content: "Manage your FindMit account and sign out." },
      { property: "og:title", content: "Settings — FindMit" },
      { property: "og:description", content: "Manage your FindMit account and sign out." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { session, profile } = useAuth();
  const { isAdmin } = useRole();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const removeAccount = useServerFn(deleteMyAccount);
  const [deleting, setDeleting] = useState(false);
  const [debugOn, setDebugOn] = useState(() => isDebugPanelEnabled());

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      await removeAccount();
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
      toast.success("Your account and all its content were deleted.");
      void navigate({ to: "/auth", replace: true });
    } catch (error) {
      console.error(error);
      toast.error("Could not delete your account. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/auth", replace: true });
  };

  return (
    <main className="mx-auto min-h-screen max-w-lg bg-background pb-16">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur">
        <Link to="/profile" aria-label="Back" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="font-display text-base font-bold">Settings</h1>
      </header>

      <section className="px-6 py-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Account</h2>
        <dl className="mt-3 space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Username</dt>
            <dd className="font-medium">@{profile?.username}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Email</dt>
            <dd className="truncate font-medium">{session?.user.email}</dd>
          </div>
        </dl>

        <Button variant="outline" className="mt-8 w-full gap-2" onClick={signOut}>
          <LogOut className="size-4" />
          Log out
        </Button>
      </section>

      <ContactPrivacySection />

      <ApplicationsSection />

      {isAdmin ? <StoriesAccessSection /> : null}

      {isAdmin ? <PricingSection /> : null}

      {isAdmin ? <TutorSettingsSection /> : null}

      {isAdmin ? <AmaVoiceTuning /> : null}

      <SettingsSection />

      {isAdmin ? (
      <section className="px-6 pb-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Developer
        </h2>
        <div className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-border bg-surface px-4 py-3">
          <div className="flex items-center gap-3">
            <Bug className="size-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Debug panel</p>
              <p className="text-xs text-muted-foreground">
                Show live camera/mic and WebRTC logs on screen
              </p>
            </div>
          </div>
          <Switch
            checked={debugOn}
            onCheckedChange={(checked) => {
              setDebugOn(checked);
              setDebugPanelEnabled(checked);
            }}
            aria-label="Toggle debug panel"
          />
        </div>
      </section>
      ) : null}

      <section className="px-6 pb-10">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-destructive">Danger zone</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Deleting your account permanently removes your profile, posts, videos, chats, calls, live
          sessions, jobs, talent profiles and applications. This cannot be undone.
        </p>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="mt-4 w-full gap-2" disabled={deleting}>
              <Trash2 className="size-4" />
              {deleting ? "Deleting account…" : "Delete my account"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes @{profile?.username} and everything linked to it — posts,
                media, chats, jobs and live sessions. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault();
                  void deleteAccount();
                }}
              >
                Delete forever
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </main>
  );
}
