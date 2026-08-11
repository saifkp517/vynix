import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Client-side auth only — the anon key is safe to expose, it's what Supabase's
// row-level security is designed to be used with. The server independently
// verifies the JWT this issues (see server/src/auth/supabase-auth.util.ts),
// it never trusts the client's word for who's logged in.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
