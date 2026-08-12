import { createClient } from '@supabase/supabase-js';

// This project is on Supabase's newer "JWT Signing Keys" model, so tokens are
// no longer verifiable locally with a shared HS256 secret (that field is now
// legacy/vestigial). Instead we ask Supabase directly whether a token is valid
// via auth.getUser — this works regardless of the signing algorithm/key
// rotation happening on Supabase's side, at the cost of one network call per
// verification (fine here: it only runs once per socket connect, not per
// game event).
const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
);

export interface SupabaseJwtClaims {
    sub: string; // Supabase auth user id (uuid) — this is the durable identity
    email?: string;
    user_metadata?: { username?: string };
}

export class InvalidTokenError extends Error {}

export async function verifySupabaseToken(token: string): Promise<SupabaseJwtClaims> {
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
        throw new InvalidTokenError('Invalid or expired Supabase token');
    }

    return {
        sub: data.user.id,
        email: data.user.email,
        user_metadata: data.user.user_metadata,
    };
}

export function usernameFromClaims(claims: SupabaseJwtClaims): string {
    return (
        claims.user_metadata?.username ??
        claims.email?.split('@')[0] ??
        `player-${claims.sub.slice(0, 8)}`
    );
}
