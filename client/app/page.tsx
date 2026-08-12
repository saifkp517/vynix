"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Users, Trophy, Settings, X, Lock, Swords, Loader2, LogOut, Pencil, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useSocketHandlers } from "@/hooks/useSocketHandlersMain";
import { useRoomStore } from "@/hooks/useRoomStore";
import { useAuth } from "@/hooks/useAuth";
import socket from "@/lib/socket";
import { useRouter } from "next/navigation";
import axios from "axios";
import {
  MIN_GRAPHICS_LEVEL,
  MAX_GRAPHICS_LEVEL,
  DEFAULT_GRAPHICS_LEVEL,
  getGraphicsLevel,
  setGraphicsLevel,
  getDprForLevel,
} from "@/lib/graphicsSettings";

const MATCH_SIZE = 5;

const LOBBY_TIPS = [
  "Staying away from fire for a while increases health over time.",
  "Try jumping on canopies to ambush enemies.",
  "Sometimes hits may not be detected on the system, due to network lag.",
  "Right click to activate mira red dot for aiming.",
  "Press C to chat with players in the room.",
  "Use Q to activate invincibility.",
];

export default function GameLoadoutMenu() {

  const router = useRouter();
  const { session, user, isGuest, loading: authLoading, signOut } = useAuth();

  const [matchmakingStatus, setMatchmakingStatus] = useState("Find Match");
  const [isMatchMaking, setIsMatchmaking] = useState(false);
  const [activeSection, setActiveSection] = useState('');
  const [onlinePlayers, setOnlinePlayers] = useState(0);
  const [username, setUsername] = useState("");
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);

  const [profile, setProfile] = useState<{
    username: string;
    rank: number;
    matchesPlayed: number;
    totalKills: number;
    totalDeaths: number;
    kdRatio: number;
  } | null>(null);
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

  const lobbyPlayers = useRoomStore((s) => s.players);
  const inLobby = isMatchMaking && !!roomId;

  useSocketHandlers(socket, {
    setMatchmakingStatus,
    setIsMatchmaking,
    setRoomId,
    redirect: (path) => {
      router.push('/' + path);
    },
  });

  // Callsign defaults to the account's display name (profile username, falling
  // back to email if that's ever empty) or a random Guest_ id for anonymous
  // sessions — never persisted, so it's re-derived fresh each session unless
  // the player types their own.
  useEffect(() => {
    if (usernameEdited) return;

    if (isGuest) {
      setUsername(`Guest_${(user?.id ?? Math.random().toString(36).slice(2)).slice(0, 6)}`);
    } else if (profile) {
      setUsername(profile.username?.trim() || user?.email || "Player");
    }
  }, [isGuest, user, profile, usernameEdited]);

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

  const startEditingName = () => {
    setNameDraft(profile?.username ?? "");
    setIsEditingName(true);
  };

  const saveProfileName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || !session?.access_token) {
      setIsEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      const res = await axios.patch(
        `${process.env.NEXT_PUBLIC_REST_API_URL}/profiles/me`,
        { username: trimmed },
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      );
      setProfile(res.data);
      setIsEditingName(false);
    } catch (err) {
      console.error("Error updating profile name:", err);
    } finally {
      setSavingName(false);
    }
  };

  useEffect(() => {
    let isFetching = false;

    async function fetchOnlinePlayers() {
      if (isFetching) return; //wait until previous fetch has been completed
      isFetching = true;
      try {
        const res = await axios.get(`${process.env.NEXT_PUBLIC_REST_API_URL}/game/onlinePlayers`);
        setOnlinePlayers(res.data.players)
      } catch (err) {
        console.error("Error fetching players:", err);
        setOnlinePlayers(0)
      } finally {
        isFetching = false;
      }
    }

    fetchOnlinePlayers();

    const interval = setInterval(fetchOnlinePlayers, 5000);

    return () => clearInterval(interval)

  }, [])

  // Once the room fills to match size, hold briefly on "Match starting" then
  // hand off to the room route (roomAssigned already fired earlier).
  useEffect(() => {
    if (!inLobby || !roomId) return;
    if (lobbyPlayers.length < MATCH_SIZE) return;

    setMatchmakingStatus("Match starting...");
    const timeout = setTimeout(() => {
      router.push(`/forest/${roomId}`);
    }, 900);

    return () => clearTimeout(timeout);
  }, [inLobby, roomId, lobbyPlayers.length, router]);

  const handleUsernameChange = (value: string) => {
    setUsernameEdited(true);
    setUsername(value);
  };

  const ComingSoonCard = ({ icon: Icon, title, description }: any) => (
    <div className="bg-neutral-900/90 backdrop-blur-xl rounded-[24px] border border-white/[0.08] p-5 shadow-2xl max-w-xs w-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-full bg-gradient-to-br from-emerald-400 to-teal-300">
            <Icon className="h-3.5 w-3.5 text-neutral-900" />
          </div>
          <h3 className="font-display text-sm font-medium text-white">{title}</h3>
        </div>
        <button
          onClick={() => setActiveSection('')}
          className="p-1 hover:bg-white/10 rounded-full transition-colors"
        >
          <X className="h-3.5 w-3.5 text-neutral-400" />
        </button>
      </div>
      <div className="flex flex-col items-center justify-center py-6">
        <div className="relative mb-2">
          <Icon className="h-10 w-10 text-emerald-400/40" />
          <Lock className="h-3 w-3 text-amber-400 absolute -bottom-0.5 -right-0.5 bg-neutral-900 rounded-full p-0.5" />
        </div>
        <p className="font-display text-white text-xs font-medium mb-1">Coming Soon</p>
        <p className="text-neutral-500 text-[10px] text-center font-normal">{description}</p>
      </div>
    </div>
  );

  const handleMatchmaking = () => {

    if (!socket.connected) {
      socket.connect()
    }

    if (isMatchMaking) {
      socket.emit("cancelMatchmaking");
      setIsMatchmaking(false);
      setMatchmakingStatus("Find Match");
      setRoomId(null);
      useRoomStore.getState().setPlayers([]);
    } else {
      useRoomStore.getState().setPlayers([]);
      setRoomId(null);
      socket.emit("requestMatchmaking", username);
      setIsMatchmaking(true);
      setMatchmakingStatus("Searching...");
      setTimeout(() => setMatchmakingStatus("Finding opponents..."), 1500);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <Loader2 className="h-6 w-6 text-emerald-400 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-6 overflow-hidden">
      {/* Background image with overlay */}
      <div className="absolute inset-0">
        <div
          className="absolute inset-0 bg-cover bg-center scale-105"
          style={{ backgroundImage: "url('/images/background.png')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/40 to-black/80" />
        <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />
      </div>

      {/* Signed-in-as / sign out */}
      <div className="absolute top-5 right-5 z-20 flex items-center gap-3">
        <span className="text-[11px] text-neutral-400 font-medium">
          {isGuest ? "Playing as Guest" : user?.email}
        </span>
        <button
          onClick={() => signOut()}
          className="p-1.5 rounded-lg bg-white/[0.03] border border-white/10 hover:bg-white/[0.08] hover:border-red-400/40 group transition-colors"
          title="Sign out"
        >
          <LogOut className="h-3.5 w-3.5 text-neutral-400 group-hover:text-red-400 transition-colors" />
        </button>
      </div>

      {/* Modal overlay */}
      {activeSection && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setActiveSection('')}>
          <div onClick={(e) => e.stopPropagation()}>
            {activeSection === "leaderboard" && <ComingSoonCard icon={Trophy} title="Leaderboard" description="Global rankings launching post-beta" />}
            {activeSection === "friends" && <ComingSoonCard icon={Users} title="Friends" description="Connect with players post-beta" />}
            {activeSection === "settings" && (
              <GraphicsSettingsCard
                level={graphicsLevel}
                onChange={handleGraphicsLevelChange}
                onClose={() => setActiveSection('')}
              />
            )}
          </div>
        </div>
      )}

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
            transition={{ duration: 0.25 }}
            className="relative z-10 w-full max-w-md"
          >
            {/* Header */}
            <div className="text-center mb-10">
              <span className="inline-block mb-4 px-3.5 py-1.5 rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-md text-[11px] text-neutral-300 font-medium tracking-wide">
                Season 1 • Beta
              </span>
              <h1 className="font-display text-5xl md:text-6xl font-medium text-white mb-3 tracking-tight leading-none">
                Zentra<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">.io</span>
              </h1>
              <p className="text-neutral-400 text-sm font-normal tracking-wide">Enter the arena</p>
            </div>

            {/* Card */}
            <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] backdrop-blur-2xl shadow-[0_8px_40px_rgba(0,0,0,0.4)] p-7 space-y-6">

              {/* Username input */}
              <div>
                <div className="rounded-2xl border border-white/[0.08] bg-black/20 focus-within:border-emerald-400/40 transition-colors px-4 py-3.5">
                  <input
                    type="text"
                    placeholder="Choose a callsign..."
                    value={username}
                    onChange={(e) => handleUsernameChange(e.target.value)}
                    className="w-full text-sm text-center text-white bg-transparent focus:outline-none placeholder:text-neutral-500 font-normal"
                  />
                </div>
                {username && (
                  <p className="text-xs text-center text-neutral-500 mt-2.5 font-normal">
                    Playing as <span className="font-medium text-emerald-300">{username}</span>
                  </p>
                )}
              </div>

              {/* Profile name (persisted account identity, separate from the per-match callsign above) */}
              <div className="flex items-center justify-center gap-2">
                {isEditingName ? (
                  <>
                    <input
                      type="text"
                      autoFocus
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveProfileName()}
                      className="text-xs text-center text-white bg-black/20 border border-emerald-400/30 rounded-full px-3.5 py-1.5 focus:outline-none"
                    />
                    <button
                      onClick={saveProfileName}
                      disabled={savingName}
                      className="p-1.5 rounded-full bg-emerald-400/10 border border-emerald-400/20 hover:bg-emerald-400/20"
                    >
                      <Check className="h-3 w-3 text-emerald-300" />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={startEditingName}
                    className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-emerald-300 transition-colors font-normal"
                  >
                    {profile?.username ?? "..."}
                    <Pencil className="h-3 w-3 text-neutral-600" />
                  </button>
                )}
              </div>

              {/* Matchmaking Button */}
              <button
                onClick={handleMatchmaking}
                className="w-full group relative overflow-hidden rounded-full transition-all hover:scale-[1.01] active:scale-[0.98] shadow-lg shadow-emerald-950/30"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-teal-300" />
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-white/10" />
                <div className="relative px-6 py-4 flex items-center justify-center gap-2.5">
                  {isMatchMaking ? (
                    <>
                      <Loader2 className="h-4 w-4 text-neutral-900 animate-spin" />
                      <span className="font-display text-neutral-900 text-sm font-medium">{matchmakingStatus}</span>
                    </>
                  ) : (
                    <>
                      <Swords className="h-4 w-4 text-neutral-900" />
                      <span className="font-display text-neutral-900 text-sm font-medium">Find Match</span>
                    </>
                  )}
                </div>
              </button>

              {/* Stats row */}
              <div className="flex items-center justify-center gap-6 pt-1">
                {[
                  { label: "Matches", value: profile?.matchesPlayed },
                  { label: "Kills", value: profile?.totalKills },
                  { label: "K/D", value: profile?.kdRatio?.toFixed(2) },
                ].map((stat, i) => (
                  <React.Fragment key={stat.label}>
                    {i > 0 && <div className="w-px h-8 bg-white/[0.08]" />}
                    <div className="text-center">
                      <p className="text-neutral-500 text-[10px] uppercase tracking-wider mb-1 font-normal">
                        {stat.label}
                      </p>
                      <p className="font-display text-neutral-200 text-sm font-medium">
                        {stat.value ?? "—"}
                      </p>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Bottom navigation */}
            <div className="flex items-center justify-center gap-8 pt-7">
              {[
                { icon: Trophy, label: "Leaderboard", key: "leaderboard", locked: true },
                { icon: Users, label: "Friends", key: "friends", locked: true },
                { icon: Settings, label: "Settings", key: "settings", locked: false },
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() => setActiveSection(item.key)}
                  className="relative group flex flex-col items-center gap-2 hover:-translate-y-0.5 transition-transform"
                >
                  <div className="relative p-2.5 rounded-full bg-white/[0.03] border border-white/[0.08] group-hover:border-emerald-400/30 group-hover:bg-emerald-400/10 transition-colors">
                    <item.icon className="h-4 w-4 text-neutral-400 group-hover:text-emerald-300 transition-colors" />
                    {item.locked && (
                      <Lock className="h-2 w-2 text-amber-400 absolute -top-1 -right-1 bg-neutral-900 rounded-full p-0.5" />
                    )}
                  </div>
                  <span className="text-neutral-500 text-[10px] font-normal group-hover:text-emerald-300 transition-colors tracking-wide">
                    {item.label}
                  </span>
                </button>
              ))}
            </div>

            {/* Footer */}
            <div className="text-center mt-7 text-neutral-600 text-xs font-normal">
              <p>Beta • More features coming soon</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        @keyframes gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-gradient {
          animation: gradient 3s ease infinite;
        }
      `}</style>
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
        <p className={`text-sm font-normal ${interactive ? "text-neutral-200" : "text-neutral-500"}`}>
          {label}
        </p>
        {hint && <p className="text-[10px] text-neutral-600 font-normal mt-0.5">{hint}</p>}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={() => onStep?.(-1)}
          disabled={!interactive}
          aria-label={`Decrease ${label}`}
          className="p-1 rounded text-neutral-600 enabled:hover:text-emerald-300 disabled:opacity-0 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="w-[104px]">
          <div className="border-l border-white/20 pl-3">
            <p
              className={`text-xs font-normal tabular-nums ${
                interactive ? "text-white" : "text-neutral-500"
              }`}
            >
              {value}
            </p>
          </div>
          <div className="h-[2px] mt-1.5 ml-3 bg-white/[0.08] overflow-hidden">
            <div
              className={`h-full transition-all duration-200 ${
                interactive ? "bg-gradient-to-r from-emerald-400 to-teal-300" : "bg-neutral-600"
              }`}
              style={{ width: `${Math.round(fill * 100)}%` }}
            />
          </div>
        </div>

        <button
          onClick={() => onStep?.(1)}
          disabled={!interactive}
          aria-label={`Increase ${label}`}
          className="p-1 rounded text-neutral-600 enabled:hover:text-emerald-300 disabled:opacity-0 transition-colors"
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
    <div className="bg-neutral-900/95 backdrop-blur-xl rounded-2xl border border-white/[0.08] shadow-2xl max-w-lg w-full overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center justify-between px-6 pt-5 border-b border-white/[0.08]">
        <div className="flex items-end">
          <span className="relative text-[11px] uppercase tracking-[0.2em] text-white font-medium pb-3">
            Quality
            <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-gradient-to-r from-emerald-400 to-teal-300" />
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 mb-2 rounded hover:bg-white/10 transition-colors"
          aria-label="Close settings"
        >
          <X className="h-4 w-4 text-neutral-400" />
        </button>
      </div>

      {/* Section header */}
      <div className="px-6 pt-6 pb-2">
        <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500 font-medium">
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
        <p className="text-[10px] text-neutral-500 font-normal">
          Lower quality gives higher FPS
        </p>
        <p className="text-[10px] text-neutral-600 font-normal">
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
    <div className="min-h-screen relative flex items-center justify-center p-6 overflow-hidden">
      <div className="absolute inset-0">
        <div
          className="absolute inset-0 bg-cover bg-center scale-105"
          style={{ backgroundImage: "url('/images/background.png')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/40 to-black/80" />
        <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="relative z-10 w-full max-w-sm"
      >
        <div className="text-center mb-10">
          <h1 className="font-display text-5xl md:text-6xl font-medium text-white mb-3 tracking-tight leading-none">
            Zentra<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">.io</span>
          </h1>
          <p className="text-neutral-400 text-sm font-normal tracking-wide">
            {mode === "login" ? "Sign in to play" : "Create an account"}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] backdrop-blur-2xl shadow-[0_8px_40px_rgba(0,0,0,0.4)] p-7 space-y-4"
        >
          <div className="rounded-2xl border border-white/[0.08] bg-black/20 focus-within:border-emerald-400/40 transition-colors px-4 py-3.5">
            <input
              type="email"
              required
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full text-sm text-white bg-transparent focus:outline-none placeholder:text-neutral-500 font-normal"
            />
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-black/20 focus-within:border-emerald-400/40 transition-colors px-4 py-3.5">
            <input
              type="password"
              required
              minLength={6}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full text-sm text-white bg-transparent focus:outline-none placeholder:text-neutral-500 font-normal"
            />
          </div>

          {error && <p className="text-xs text-red-400 text-center font-normal">{error}</p>}
          {info && <p className="text-xs text-emerald-300 text-center font-normal">{info}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full group relative overflow-hidden rounded-full transition-all hover:scale-[1.01] active:scale-[0.98] shadow-lg shadow-emerald-950/30 disabled:opacity-60"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-teal-300" />
            <div className="relative px-6 py-3.5 flex items-center justify-center gap-2.5">
              {submitting ? (
                <Loader2 className="h-4 w-4 text-neutral-900 animate-spin" />
              ) : (
                <span className="font-display text-neutral-900 text-sm font-medium">
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
            className="w-full text-center text-xs text-neutral-500 hover:text-emerald-300 transition-colors font-normal"
          >
            {mode === "login" ? "Need an account? Sign up" : "Already have an account? Sign in"}
          </button>

          <div className="flex items-center gap-3 pt-1">
            <div className="h-px flex-1 bg-white/[0.08]" />
            <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-normal">or</span>
            <div className="h-px flex-1 bg-white/[0.08]" />
          </div>

          <button
            type="button"
            onClick={handleGuest}
            disabled={guestLoading}
            className="w-full rounded-full border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] transition-colors py-3 text-xs font-normal text-neutral-300 tracking-wide disabled:opacity-60"
          >
            {guestLoading ? "Starting..." : "Continue as Guest"}
          </button>
        </form>
      </motion.div>

      <style jsx global>{`
        @keyframes gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-gradient {
          animation: gradient 3s ease infinite;
        }
      `}</style>
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
      transition={{ duration: 0.25 }}
      className="relative z-10 w-full max-w-lg"
    >
      <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] backdrop-blur-2xl shadow-[0_8px_40px_rgba(0,0,0,0.4)] p-7">
        <div className="text-center mb-6">
          <p className="text-neutral-500 text-[10px] uppercase tracking-[0.3em] mb-1.5 font-normal">Lobby</p>
          <h2 className="font-display text-2xl font-medium text-white flex items-center justify-center gap-2">
            {isFull ? (
              <span className="text-emerald-300">{status}</span>
            ) : (
              <>
                Waiting for players
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-300 rounded-full animate-dot-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 bg-emerald-300 rounded-full animate-dot-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 bg-emerald-300 rounded-full animate-dot-bounce" style={{ animationDelay: "300ms" }} />
                </span>
              </>
            )}
          </h2>
        </div>

        {/* Progress */}
        <div className="mb-7">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-normal">Players</span>
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
        <div className="grid grid-cols-5 gap-2.5 mb-7">
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
                <span className="text-[9px] text-neutral-500 max-w-[44px] truncate font-normal">
                  {player ? player.username : "Open"}
                </span>
              </div>
            );
          })}
        </div>

        {/* Recent join feed */}
        <div className="mb-7 h-6 overflow-hidden text-center">
          <AnimatePresence mode="popLayout">
            {players.length > 0 && (
              <motion.p
                key={players[players.length - 1]?.socketId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                className="text-xs text-neutral-400 font-normal"
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
        <div className="mb-7 text-center">
          <p className="text-[10px] text-neutral-500 uppercase tracking-[0.2em] mb-1.5 font-normal">Tip</p>
          <p className="text-xs text-neutral-400 font-normal">{tip}</p>
        </div>

        <button
          onClick={onCancel}
          disabled={isFull}
          className="w-full rounded-full border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed transition-colors py-3 text-xs font-normal text-neutral-300 tracking-wide"
        >
          {isFull ? "Launching..." : "Cancel"}
        </button>
      </div>
    </motion.div>
  );
}
