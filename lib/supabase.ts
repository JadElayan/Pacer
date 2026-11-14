import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;
export const supabaseConfigured = () => !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
/** Google sign-in appears only after the Google provider is configured and NEXT_PUBLIC_AUTH_ENABLED=1. Guests always work. */
export const authEnabled = () => supabaseConfigured() && process.env.NEXT_PUBLIC_AUTH_ENABLED === "1";

/** One shared browser client (auth session + realtime). */
export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigured()) return null;
  if (!client) client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { realtime: { params: { eventsPerSecond: 20 } } });
  return client;
}
