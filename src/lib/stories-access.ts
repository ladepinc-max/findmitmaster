import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useAppSections, useIsSuperAdmin } from "@/lib/app-sections";
import { useRole } from "@/lib/roles";

/** Stories is visible to everyone once published; before that only admins + testers. */
export function canSeeStories(opts: { published: boolean; isAdmin: boolean; isTester: boolean }) {
  return opts.published || opts.isAdmin || opts.isTester;
}

export function useStoriesAccess() {
  const { user } = useAuth();
  const { sections, loading } = useAppSections();
  const isSuper = useIsSuperAdmin();
  const { isAdmin, loading: roleLoading } = useRole();
  const [isTester, setIsTester] = useState(false);
  const [testerLoading, setTesterLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setIsTester(false);
      setTesterLoading(false);
      return;
    }
    let on = true;
    void supabase
      .from("stories_testers" as never)
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!on) return;
        setIsTester(Boolean(data));
        setTesterLoading(false);
      });
    return () => {
      on = false;
    };
  }, [user]);

  const row = sections["stories_tab"];
  // Unknown row (not loaded yet) counts as unpublished so Stories never flashes to the public.
  const published = row ? !row.is_hidden : false;
  return {
    allowed: canSeeStories({ published, isAdmin: isSuper || isAdmin, isTester }),
    published,
    loading: (loading && !row) || roleLoading || testerLoading,
  };
}
