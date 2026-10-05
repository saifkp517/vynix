import { useEffect, useState, useCallback } from "react";
import type { Session } from "@supabase/supabase-js";
import axios from "axios";
import { supabase } from "@/lib/supabase";

export interface Profile {
  username: string;
  rank: number;
  matchesPlayed: number;
  totalKills: number;
  totalDeaths: number;
  kdRatio: number;
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    // Fires on sign-in/sign-out/token-refresh — keeps `session` (and therefore
    // the socket's auth token, see lib/socket.ts) always current.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // The player's durable profile (lifetime K/D, rank, canonical username) — a
  // REST resource guarded by the same Supabase token, refetched whenever the
  // access token changes and cleared on sign-out.
  useEffect(() => {
    if (!session?.access_token) {
      setProfile(null);
      return;
    }

    let cancelled = false;
    axios
      .get(`${process.env.NEXT_PUBLIC_REST_API_URL}/profiles/me`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      .then((res) => {
        if (!cancelled) setProfile(res.data);
      })
      .catch((err) => console.error("Error fetching profile:", err));

    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signInAsGuest = useCallback(async () => {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  // PATCH /profiles/me — updates the durable username and folds the fresh
  // profile row back into state. Reads the token fresh (same rationale as
  // lib/socket.ts) rather than closing over `session`.
  const updateUsername = useCallback(async (username: string) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Not authenticated");

    const res = await axios.patch(
      `${process.env.NEXT_PUBLIC_REST_API_URL}/profiles/me`,
      { username },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    setProfile(res.data);
  }, []);

  const isGuest = session?.user?.is_anonymous ?? false;

  return {
    session,
    user: session?.user ?? null,
    isGuest,
    loading,
    profile,
    updateUsername,
    signUp,
    signIn,
    signInAsGuest,
    signOut,
  };
}
