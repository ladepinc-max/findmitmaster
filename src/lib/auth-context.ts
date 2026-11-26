import { createContext } from "react";
import type { Session, User } from "@supabase/supabase-js";

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  photo_path: string | null;
  bio: string | null;
  website: string | null;
  social_links: Record<string, string>;
  is_verified: boolean;
  followers_count: number;
  following_count: number;
  posts_count: number;
  likes_count: number;
  created_at: string;
}

export interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

// Keep the context outside the provider/hook module: Fast Refresh may replace that
// module while mounted routes still use its previous context object.
export const AuthContext = createContext<AuthContextValue | undefined>(undefined);