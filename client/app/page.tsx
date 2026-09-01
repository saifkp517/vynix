"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Users, Trophy, Settings, X, Lock, Swords, Loader2, LogOut, Pencil, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useMatchmaking, MATCH_SIZE } from "@/hooks/useMatchmaking";
import { usePlayerStore } from "@/hooks/usePlayerStore";
import { useAuth } from "@/hooks/useAuth";
import {
  MIN_GRAPHICS_LEVEL,
  MAX_GRAPHICS_LEVEL,
  DEFAULT_GRAPHICS_LEVEL,
  getGraphicsLevel,
  setGraphicsLevel,
  getDprForLevel,
} from "@/lib/graphicsSettings";

const LOBBY_TIPS = [
  "Staying away from fire for a while increases health over time.",
  "Try jumping on canopies to ambush enemies.",
  "Sometimes hits may not be detected on the system, due to network lag.",
  "Right click to activate mira red dot for aiming.",
  "Press C to chat with players in the room.",
  "Use Q to activate invincibility.",
];

// The forest key art + darkening scrim that both the menu and the auth screen
// sit on. One component so the two surfaces can never drift apart.
function ArenaBackdrop() {
  return (
    <div className="absolute inset-0">
      <div
        className="absolute inset-0 bg-cover bg-center scale-105"
        style={{ backgroundImage: "url('/images/background.png')" }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/45 to-black/85" />
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />
    </div>
  );
}

// Shared focus ring for dark-glass controls — an emerald ring offset off the
// panel so keyboard users always see where they are.
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black/60";

export default function GameLoadoutMenu() {

  const { session, user, isGuest, loading: authLoading, profile, updateUsername, signOut } = useAuth();

  const {
    status: matchmakingStatus,
    isMatchmaking: isMatchMaking,
    roomId,
    players: lobbyPlayers,
    findMatch,
    cancelMatch,
  } = useMatchmaking();

  const { username, setUsername, setDerivedUsername } = usePlayerStore();

  const [showSettings, setShowSettings] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [graphicsLevel, setGraphicsLevelState] = useState(DEFAULT_GRAPHICS_LEVEL);

  useEffect(() => {
    setGraphicsLevelState(getGraphicsLevel());
  }, []);

  const handleGraphicsLevelChange = (level: number) => {
    setGraphicsLevelState(level);
    setGraphicsLevel(level);
  };

  const inLobby = isMatchMaking && !!roomId;

  // Callsign defaults to the account's display name (profile username, falling
  // back to email if that's ever empty) or a random Guest_ id for anonymous
  // sessions — never persisted, so it's re-derived fresh each session.
  // setDerivedUsername no-ops once the player types their own (see usePlayerStore).
  useEffect(() => {
    if (isGuest) {
      setDerivedUsername(`Guest_${(user?.id ?? Math.random().toString(36).slice(2)).slice(0, 6)}`);
    } else if (profile) {
      setDerivedUsername(profile.username?.trim() || user?.email || "Player");
    }
  }, [isGuest, user, profile, setDerivedUsername]);

  const startEditingName = () => {
    setNameDraft(profile?.username ?? "");
    setIsEditingName(true);
  };

  const saveProfileName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setIsEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      await updateUsername(trimmed);
      setIsEditingName(false);
    } catch (err) {
      console.error("Error updating profile name:", err);
    } finally {
      setSavingName(false);
    }
  };

  const handleMatchmaking = () => {
    if (isMatchMaking) cancelMatch();
    else findMatch(username);
  };

  if (authLoading) {
    return (
      <div className="min-h-[100svh] flex items-center justify-center bg-black">
        <Loader2 className="h-6 w-6 text-emerald-400 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  return (
    <div className="min-h-[100svh] relative flex items-center justify-center px-6 py-8 overflow-x-hidden overflow-y-auto">
      <ArenaBackdrop />

      {/* Signed-in-as / sign out */}
      <div className="absolute top-5 right-5 z-20 flex items-center gap-3">
        <span className="text-[11px] text-neutral-300 font-medium">
          {isGuest ? "Playing as Guest" : user?.email}
        </span>
        <button
          type="button"
          onClick={() => signOut()}
          className={`p-1.5 rounded-lg bg-white/[0.03] border border-white/10 hover:bg-white/[0.08] hover:border-red-400/40 group transition-colors ${FOCUS_RING}`}
          title="Sign out"
        >
          <LogOut className="h-3.5 w-3.5 text-neutral-300 group-hover:text-red-400 transition-colors" />
        </button>
      </div>

      {/* Settings modal — kept as a modal because the graphics panel needs
          protected focus; the locked nav items no longer open one. */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setShowSettings(false)}
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 4 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            >
              <GraphicsSettingsCard
                level={graphicsLevel}
                onChange={handleGraphicsLevelChange}
                onClose={() => setShowSettings(false)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {inLobby ? (
          <LobbyPanel
            key="lobby"
            roomId={roomId!}
            players={lobbyPlayers}
            matchSize={MATCH_SIZE}
            status={matchmakingStatus}
            onCancel={handleMatchmaking}
          />
        ) : (
          <motion.div
            key="menu"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-md"
          >
            {/* Header */}
            <div className="text-center mb-6">
              <h1
                className="font-display text-4xl md:text-5xl font-medium text-white mb-1.5 leading-none"
                style={{ letterSpacing: "-0.04em" }}
              >
                Zentra<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">.io</span>
              </h1>
              <p className="text-neutral-300 text-sm font-normal tracking-wide">Enter the arena</p>
            </div>

            {/* Card */}
            <div className="rounded-3xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] p-5 sm:p-6 space-y-4">

              {/* Callsign input */}
              <div>
                <label htmlFor="callsign" className="sr-only">Callsign</label>
                <div className={`rounded-2xl border border-white/[0.08] bg-black/20 focus-within:border-emerald-400/50 transition-colors px-4 py-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-emerald-400/60`}>
                  <input
                    id="callsign"
                    type="text"
                    placeholder="Choose a callsign…"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full text-sm text-center text-white bg-transparent focus:outline-none placeholder:text-neutral-400 font-normal"
                  />
                </div>
                {username && (
                  <p className="text-xs text-center text-neutral-400 mt-2 font-normal">
                    Dropping in as <span className="font-medium text-emerald-300">{username}</span>
                  </p>
                )}
              </div>

              {/* Profile name (persisted account identity, separate from the per-match callsign above) */}
              {!isGuest && (
                <div className="flex items-center justify-center gap-2">
                  {isEditingName ? (
                    <>
                      <input
                        type="text"
                        autoFocus
                        aria-label="Display name"
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveProfileName();
                          if (e.key === "Escape") setIsEditingName(false);
                        }}
                        className={`text-xs text-center text-white bg-black/20 border border-emerald-400/40 rounded-full px-3.5 py-1.5 focus:outline-none ${FOCUS_RING}`}
                      />
                      <button
                        type="button"
                        onClick={saveProfileName}
                        disabled={savingName}
                        aria-label="Save display name"
                        className={`p-1.5 rounded-full bg-emerald-400/10 border border-emerald-400/20 hover:bg-emerald-400/20 disabled:opacity-50 transition-colors ${FOCUS_RING}`}
                      >
                        {savingName
                          ? <Loader2 className="h-3 w-3 text-emerald-300 animate-spin" />
                          : <Check className="h-3 w-3 text-emerald-300" />}
                      </button>
                    </>
                  ) : profile ? (
                    <button
                      type="button"
                      onClick={startEditingName}
                      className={`flex items-center gap-1.5 text-xs text-neutral-400 hover:text-emerald-300 transition-colors font-normal rounded-full px-1 ${FOCUS_RING}`}
                    >
                      <span className="text-neutral-500">Display name:</span>
                      {profile.username?.trim() || "Set one"}
                      <Pencil className="h-3 w-3 text-neutral-500" />
                    </button>
                  ) : (
                    <div className="h-4 w-32 rounded-full bg-white/[0.06] animate-pulse" />
                  )}
                </div>
              )}

              {/* Matchmaking Button */}
              <button
                type="button"
                onClick={handleMatchmaking}
                className={`w-full group relative overflow-hidden rounded-full transition-transform hover:scale-[1.01] active:scale-[0.985] shadow-[0_10px_30px_-8px_rgba(16,185,129,0.5)] ${FOCUS_RING}`}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-teal-300" />
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-white/10" />
                <div className="relative px-6 py-3.5 flex items-center justify-center gap-2.5">
                  {isMatchMaking ? (
                    <>
                      <Loader2 className="h-4 w-4 text-emerald-950 animate-spin" />
                      <span className="font-display text-emerald-950 text-sm font-semibold tracking-wide">{matchmakingStatus}</span>
                    </>
                  ) : (
                    <>
                      <Swords className="h-4 w-4 text-emerald-950" />
                      <span className="font-display text-emerald-950 text-sm font-semibold tracking-wide">Find Match</span>
                    </>
                  )}
                </div>
              </button>

              {/* Lifetime record */}
              <div className="flex items-center justify-center gap-6 pt-1">
                {([
                  { label: "Matches", value: profile?.matchesPlayed },
                  { label: "Kills", value: profile?.totalKills },
                  { label: "K/D", value: profile?.kdRatio?.toFixed(2) },
                ] as const).map((stat, i) => (
                  <React.Fragment key={stat.label}>
                    {i > 0 && <div className="w-px h-8 bg-white/[0.1]" />}
                    <div className="text-center">
                      <p className="text-neutral-400 text-[10px] uppercase tracking-wider mb-1 font-normal">
                        {stat.label}
                      </p>
                      <p className="font-display text-neutral-100 text-sm font-medium tabular-nums">
                        {stat.value ?? "—"}
                      </p>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Bottom navigation */}
            <nav className="flex items-center justify-center gap-8 pt-5">
              {[
                { icon: Trophy, label: "Leaderboard", key: "leaderboard", locked: true },
                { icon: Users, label: "Friends", key: "friends", locked: true },
                { icon: Settings, label: "Settings", key: "settings", locked: false },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={item.locked ? undefined : () => setShowSettings(true)}
                  disabled={item.locked}
                  title={item.locked ? `${item.label} — coming after beta` : item.label}
                  className={`relative group flex flex-col items-center gap-1.5 transition-transform enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed rounded-xl ${FOCUS_RING}`}
                >
                  <div className="relative p-2.5 rounded-full bg-white/[0.03] border border-white/[0.08] transition-colors group-enabled:group-hover:border-emerald-400/30 group-enabled:group-hover:bg-emerald-400/10 group-disabled:opacity-45">
                    <item.icon className="h-4 w-4 text-neutral-300 transition-colors group-enabled:group-hover:text-emerald-300" />
                    {item.locked && (
                      <Lock className="h-2 w-2 text-amber-300 absolute -top-1 -right-1 bg-neutral-900 rounded-full p-0.5" />
                    )}
                  </div>
                  <span className="text-neutral-400 text-[10px] font-normal tracking-wide transition-colors group-enabled:group-hover:text-emerald-300 group-disabled:opacity-70">
                    {item.label}
                  </span>
                </button>
              ))}
            </nav>

            {/* Footer */}
            <p className="text-center mt-5 text-neutral-500 text-[11px] font-normal tracking-wide">
              Season 1 · Open beta — Leaderboard and Friends coming soon
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const QUALITY_PRESET_NAMES = ["Very Low", "Low", "Medium", "High", "Ultra"];

// A settings row in the style of a console shooter's video menu: label on the
// left, current value on the right flanked by ‹ › steppers, with a meter under
// the value showing where it sits in its range. `onStep` omitted = read-only
// row (a derived value the player doesn't set directly).
function SettingRow({
  label,
  value,
  fill,
  onStep,
  hint,
}: {
  label: string;
  value: string;
  fill: number;
  onStep?: (delta: number) => void;
  hint?: string;
}) {
  const interactive = !!onStep;

  return (
    <div
      className={`group flex items-center justify-between gap-6 px-6 py-4 border-l-2 transition-colors ${
        interactive
          ? "border-transparent hover:border-emerald-400/60 hover:bg-white/[0.04]"
          : "border-transparent"
      }`}
    >
      <div className="min-w-0">
        <p className={`text-sm font-normal ${interactive ? "text-neutral-100" : "text-neutral-400"}`}>
          {label}
        </p>
        {hint && <p className="text-[10px] text-neutral-500 font-normal mt-0.5">{hint}</p>}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={() => onStep?.(-1)}
          disabled={!interactive}
          aria-label={`Decrease ${label}`}
          className="p-1 rounded text-neutral-400 enabled:hover:text-emerald-300 disabled:opacity-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="w-[104px]">
          <div className="border-l border-white/20 pl-3">
            <p
              className={`text-xs font-normal tabular-nums ${
                interactive ? "text-white" : "text-neutral-400"
              }`}
            >
              {value}
            </p>
          </div>
          <div className="h-[2px] mt-1.5 ml-3 bg-white/[0.1] overflow-hidden">
            <div
              className={`h-full transition-all duration-200 ${
                interactive ? "bg-gradient-to-r from-emerald-400 to-teal-300" : "bg-neutral-500"
              }`}
              style={{ width: `${Math.round(fill * 100)}%` }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => onStep?.(1)}
          disabled={!interactive}
          aria-label={`Increase ${label}`}
          className="p-1 rounded text-neutral-400 enabled:hover:text-emerald-300 disabled:opacity-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function GraphicsSettingsCard({
  level,
  onChange,
  onClose,
}: {
  level: number;
  onChange: (level: number) => void;
  onClose: () => void;
}) {
  const step = (delta: number) => {
    const next = Math.min(MAX_GRAPHICS_LEVEL, Math.max(MIN_GRAPHICS_LEVEL, level + delta));
    if (next !== level) onChange(next);
  };

  const range = MAX_GRAPHICS_LEVEL - MIN_GRAPHICS_LEVEL;
  const fill = (level - MIN_GRAPHICS_LEVEL) / range;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Graphics settings"
      className="bg-neutral-900/95 backdrop-blur-xl rounded-2xl border border-white/[0.08] shadow-[0_24px_70px_-20px_rgba(0,0,0,0.8)] max-w-lg w-full my-auto max-h-[calc(100svh-2rem)] overflow-y-auto"
    >
      {/* Tab bar */}
      <div className="flex items-center justify-between px-6 pt-5 border-b border-white/[0.08]">
        <div className="flex items-end">
          <span className="relative text-[11px] uppercase tracking-[0.2em] text-white font-medium pb-3">
            Quality
            <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-gradient-to-r from-emerald-400 to-teal-300" />
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 mb-2 rounded hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
          aria-label="Close settings"
        >
          <X className="h-4 w-4 text-neutral-300" />
        </button>
      </div>

      {/* Section header */}
      <div className="px-6 pt-6 pb-2">
        <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-400 font-medium">
          Details &amp; Textures
        </p>
      </div>
      <div className="h-px mx-6 bg-white/[0.08]" />

      <div className="py-2">
        <SettingRow
          label="Graphics Quality"
          value={QUALITY_PRESET_NAMES[level - MIN_GRAPHICS_LEVEL]}
          fill={fill}
          onStep={step}
        />
        <SettingRow
          label="Render Resolution"
          value={`${Math.round(getDprForLevel(level) * 100)}%`}
          fill={fill}
          hint="Derived from quality"
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-white/[0.08] bg-black/20">
        <p className="text-[10px] text-neutral-400 font-normal">
          Lower quality gives higher FPS
        </p>
        <p className="text-[10px] text-neutral-500 font-normal">
          Applies next match
        </p>
      </div>
    </div>
  );
}

function AuthScreen() {
  const { signIn, signUp, signInAsGuest } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);

  const handleGuest = async () => {
    setError(null);
    setGuestLoading(true);
    try {
      await signInAsGuest();
    } catch (err: any) {
      setError(err?.message ?? "Couldn't start a guest session");
      setGuestLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);

    try {
      if (mode === "signup") {
        await signUp(email, password);
        setInfo("Account created — check your email to confirm, then log in.");
        setMode("login");
      } else {
        await signIn(email, password);
      }
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100svh] relative flex items-center justify-center px-6 py-8 overflow-x-hidden overflow-y-auto">
      <ArenaBackdrop />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-sm"
      >
        <div className="text-center mb-6">
          <h1
            className="font-display text-4xl md:text-5xl font-medium text-white mb-1.5 leading-none"
            style={{ letterSpacing: "-0.04em" }}
          >
            Zentra<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">.io</span>
          </h1>
          <p className="text-neutral-300 text-sm font-normal tracking-wide">
            {mode === "login" ? "Sign in to play" : "Create an account"}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] p-5 sm:p-6 space-y-4"
        >
          <div className="rounded-2xl border border-white/[0.08] bg-black/20 focus-within:border-emerald-400/50 transition-colors px-4 py-3">
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full text-sm text-white bg-transparent focus:outline-none placeholder:text-neutral-400 font-normal"
            />
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-black/20 focus-within:border-emerald-400/50 transition-colors px-4 py-3">
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full text-sm text-white bg-transparent focus:outline-none placeholder:text-neutral-400 font-normal"
            />
          </div>

          {error && <p className="text-xs text-red-300 text-center font-normal" role="alert">{error}</p>}
          {info && <p className="text-xs text-emerald-300 text-center font-normal" role="status">{info}</p>}

          <button
            type="submit"
            disabled={submitting}
            className={`w-full group relative overflow-hidden rounded-full transition-transform hover:scale-[1.01] active:scale-[0.985] shadow-[0_10px_30px_-8px_rgba(16,185,129,0.5)] disabled:opacity-60 ${FOCUS_RING}`}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-teal-300" />
            <div className="relative px-6 py-3.5 flex items-center justify-center gap-2.5">
              {submitting ? (
                <Loader2 className="h-4 w-4 text-emerald-950 animate-spin" />
              ) : (
                <span className="font-display text-emerald-950 text-sm font-semibold tracking-wide">
                  {mode === "login" ? "Sign In" : "Sign Up"}
                </span>
              )}
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError(null);
              setInfo(null);
            }}
            className={`w-full text-center text-xs text-neutral-400 hover:text-emerald-300 transition-colors font-normal rounded-full py-1 ${FOCUS_RING}`}
          >
            {mode === "login" ? "Need an account? Sign up" : "Already have an account? Sign in"}
          </button>

          <div className="flex items-center gap-3 pt-1">
            <div className="h-px flex-1 bg-white/[0.08]" />
            <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-normal">or</span>
            <div className="h-px flex-1 bg-white/[0.08]" />
          </div>

          <button
            type="button"
            onClick={handleGuest}
            disabled={guestLoading}
            className={`w-full rounded-full border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] transition-colors py-3 text-xs font-normal text-neutral-200 tracking-wide disabled:opacity-60 ${FOCUS_RING}`}
          >
            {guestLoading ? "Starting…" : "Continue as Guest"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

function LobbyPanel({
  roomId,
  players,
  matchSize,
  status,
  onCancel,
}: {
  roomId: string;
  players: { socketId: string; username: string }[];
  matchSize: number;
  status: string;
  onCancel: () => void;
}) {
  const filled = Math.min(players.length, matchSize);
  const isFull = filled >= matchSize;
  const slots = useMemo(() => Array.from({ length: matchSize }), [matchSize]);
  const tip = useMemo(() => LOBBY_TIPS[Math.floor(Math.random() * LOBBY_TIPS.length)], []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="relative z-10 w-full max-w-lg"
    >
      <div className="rounded-3xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] p-5 sm:p-6">
        <div className="text-center mb-5">
          <p className="text-neutral-400 text-[10px] uppercase tracking-[0.3em] mb-1.5 font-normal">Lobby</p>
          <h2 className="font-display text-2xl font-medium text-white flex items-center justify-center gap-2" style={{ letterSpacing: "-0.02em" }}>
            {isFull ? (
              <span className="text-emerald-300">{status}</span>
            ) : (
              <>
                Waiting for players
                <span className="inline-flex gap-1" aria-hidden="true">
                  <span className="w-1.5 h-1.5 bg-emerald-300 rounded-full animate-dot-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 bg-emerald-300 rounded-full animate-dot-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 bg-emerald-300 rounded-full animate-dot-bounce" style={{ animationDelay: "300ms" }} />
                </span>
              </>
            )}
          </h2>
        </div>

        {/* Progress */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-normal">Players</span>
            <span className="font-display text-sm font-medium text-white tabular-nums">{filled}/{matchSize}</span>
          </div>
          <div className="h-1.5 rounded-full bg-black/30 border border-white/[0.08] overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-300"
              animate={{ width: `${(filled / matchSize) * 100}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* Player slots */}
        <div className="grid grid-cols-5 gap-2.5 mb-5">
          {slots.map((_, i) => {
            const player = players[i];
            return (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <div
                  className={`relative w-11 h-11 rounded-2xl flex items-center justify-center border transition-all ${
                    player
                      ? "bg-emerald-400/10 border-emerald-400/30"
                      : "bg-white/[0.02] border-white/[0.08] border-dashed"
                  }`}
                >
                  <AnimatePresence>
                    {player && (
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 300, damping: 18 }}
                        className="font-display text-xs font-medium text-emerald-300"
                      >
                        {player.username?.slice(0, 2).toUpperCase() ?? "??"}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <span className="text-[9px] text-neutral-400 max-w-[44px] truncate font-normal">
                  {player ? player.username : "Open"}
                </span>
              </div>
            );
          })}
        </div>

        {/* Recent join feed */}
        <div className="mb-4 h-6 overflow-hidden text-center" aria-live="polite">
          <AnimatePresence mode="popLayout">
            {players.length > 0 && (
              <motion.p
                key={players[players.length - 1]?.socketId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                className="text-xs text-neutral-300 font-normal"
              >
                <span className="font-medium text-emerald-300">
                  {players[players.length - 1]?.username}
                </span>{" "}
                joined the room
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Loading tip */}
        <div className="mb-6 text-center">
          <p className="text-[10px] text-neutral-400 uppercase tracking-[0.2em] mb-1.5 font-normal">Tip</p>
          <p className="text-xs text-neutral-300 font-normal">{tip}</p>
        </div>

        <button
          type="button"
          onClick={onCancel}
          disabled={isFull}
          className={`w-full rounded-full border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed transition-colors py-3 text-xs font-normal text-neutral-200 tracking-wide ${FOCUS_RING}`}
        >
          {isFull ? "Launching…" : "Cancel"}
        </button>
      </div>
    </motion.div>
  );
}
