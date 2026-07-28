"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Users, Trophy, Settings, X, Lock, Swords, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useSocketHandlers } from "@/hooks/useSocketHandlersMain";
import { useRoomStore } from "@/hooks/useRoomStore";
import socket from "@/lib/socket";
import { useRouter } from "next/navigation";
import axios from "axios";

// Must match BOT_FILL_TARGET in server-nest/src/game/bots/bots.constants.ts —
// the lobby only fills to that count, so the redirect never fires if this is higher.
const MATCH_SIZE = 5;

export default function GameLoadoutMenu() {

  const router = useRouter();

  const [matchmakingStatus, setMatchmakingStatus] = useState("Find Match");
  const [isMatchMaking, setIsMatchmaking] = useState(false);
  const [activeSection, setActiveSection] = useState('');
  const [onlinePlayers, setOnlinePlayers] = useState(0);
  const [username, setUsername] = useState("");
  const [savedUsername, setSavedUsername] = useState("");
  const [roomId, setRoomId] = useState<string | null>(null);

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

  useEffect(() => {
    const stored = localStorage.getItem("username");
    if (stored) {
      setSavedUsername(stored);
      socket.emit("updateUsername", stored);
    }

    const handleUsernameSet = (newName: string) => setSavedUsername(newName);
    socket.on("usernameSet", handleUsernameSet);

    return () => {
      socket.off("usernameSet", handleUsernameSet);
    };
  }, []);


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
    setUsername(value);
    localStorage.setItem("username", value);
  };

  const ComingSoonCard = ({ icon: Icon, title, description }: any) => (
    <div className="bg-neutral-900/90 backdrop-blur-xl rounded-2xl border border-white/10 p-5 shadow-2xl max-w-xs w-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500">
            <Icon className="h-3.5 w-3.5 text-white" />
          </div>
          <h3 className="text-sm font-bold text-white">{title}</h3>
        </div>
        <button
          onClick={() => setActiveSection('')}
          className="p-1 hover:bg-white/10 rounded-lg transition-colors"
        >
          <X className="h-3.5 w-3.5 text-neutral-400" />
        </button>
      </div>
      <div className="flex flex-col items-center justify-center py-6">
        <div className="relative mb-2">
          <Icon className="h-10 w-10 text-emerald-400/50" />
          <Lock className="h-3 w-3 text-amber-400 absolute -bottom-0.5 -right-0.5 bg-neutral-900 rounded-full p-0.5" />
        </div>
        <p className="text-white text-xs font-semibold mb-1">Coming Soon</p>
        <p className="text-neutral-400 text-[10px] text-center">{description}</p>
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
      setUsername(savedUsername)
      useRoomStore.getState().setPlayers([]);
      setRoomId(null);
      socket.emit("requestMatchmaking", username);
      setIsMatchmaking(true);
      setMatchmakingStatus("Searching...");
      setTimeout(() => setMatchmakingStatus("Finding opponents..."), 1500);
    }
  };

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

      {/* Modal overlay */}
      {activeSection && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setActiveSection('')}>
          <div onClick={(e) => e.stopPropagation()}>
            {activeSection === "leaderboard" && <ComingSoonCard icon={Trophy} title="Leaderboard" description="Global rankings launching post-beta" />}
            {activeSection === "friends" && <ComingSoonCard icon={Users} title="Friends" description="Connect with players post-beta" />}
            {activeSection === "settings" && <ComingSoonCard icon={Settings} title="Settings" description="Customize your experience soon" />}
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
            <div className="text-center mb-9">
              <h1 className="text-5xl md:text-6xl font-black text-white mb-2 tracking-tight drop-shadow-[0_2px_20px_rgba(16,185,129,0.35)]">
                Zentra<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">.io</span>
              </h1>
              <p className="text-neutral-300 text-xs font-semibold uppercase tracking-[0.3em]">Enter the Arena</p>
            </div>

            {/* Card */}
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-2xl shadow-[0_8px_40px_rgba(0,0,0,0.5)] p-6 space-y-5">

              {/* Username input */}
              <div>
                <div className="rounded-xl border border-white/10 bg-black/30 focus-within:border-emerald-400/50 transition-colors px-4 py-3">
                  <input
                    type="text"
                    placeholder="Choose a callsign..."
                    value={username}
                    onChange={(e) => handleUsernameChange(e.target.value)}
                    className="w-full text-sm text-center text-white bg-transparent focus:outline-none placeholder:text-neutral-500 font-medium"
                  />
                </div>
                {savedUsername && (
                  <p className="text-[10px] text-center text-neutral-400 mt-2">
                    Playing as <span className="font-bold text-emerald-400">{savedUsername}</span>
                  </p>
                )}
              </div>

              {/* Matchmaking Button */}
              <button
                onClick={handleMatchmaking}
                className="w-full group relative overflow-hidden rounded-xl transition-all hover:scale-[1.015] active:scale-[0.98] shadow-lg shadow-emerald-950/50"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 bg-[length:200%_100%] animate-gradient" />
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-white/10" />
                <div className="relative px-6 py-4 flex items-center justify-center gap-2.5">
                  {isMatchMaking ? (
                    <>
                      <Loader2 className="h-4 w-4 text-white animate-spin" />
                      <span className="text-white text-sm font-bold">{matchmakingStatus}</span>
                    </>
                  ) : (
                    <>
                      <Swords className="h-4 w-4 text-white" />
                      <span className="text-white text-sm font-bold tracking-wide">Find Match</span>
                    </>
                  )}
                </div>
              </button>

              {/* Stats row */}
              <div className="flex items-center justify-center gap-6 pt-1">
                {[
                  { label: "Rank" },
                  { label: "Win Rate" },
                  { label: "Level" },
                ].map((stat, i) => (
                  <React.Fragment key={stat.label}>
                    {i > 0 && <div className="w-px h-8 bg-white/10" />}
                    <div className="text-center">
                      <p className="text-neutral-500 text-[9px] uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
                        <Lock className="h-2 w-2 text-amber-400/80" />
                        {stat.label}
                      </p>
                      <p className="text-neutral-300 text-sm font-bold">—</p>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Bottom navigation */}
            <div className="flex items-center justify-center gap-8 pt-6">
              {[
                { icon: Trophy, label: "Leaderboard", key: "leaderboard" },
                { icon: Users, label: "Friends", key: "friends" },
                { icon: Settings, label: "Settings", key: "settings" },
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() => setActiveSection(item.key)}
                  className="relative group flex flex-col items-center gap-1.5 hover:-translate-y-0.5 transition-transform"
                >
                  <div className="relative p-2 rounded-lg bg-white/[0.03] border border-white/10 group-hover:border-emerald-400/40 group-hover:bg-emerald-400/10 transition-colors">
                    <item.icon className="h-4 w-4 text-neutral-400 group-hover:text-emerald-400 transition-colors" />
                    <Lock className="h-2 w-2 text-amber-400 absolute -top-1 -right-1 bg-neutral-900 rounded-full p-0.5" />
                  </div>
                  <span className="text-neutral-500 text-[9px] font-semibold group-hover:text-emerald-400 transition-colors uppercase tracking-wide">
                    {item.label}
                  </span>
                </button>
              ))}
            </div>

            {/* Footer */}
            <div className="text-center mt-6 text-neutral-500 text-[10px] font-medium">
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.25 }}
      className="relative z-10 w-full max-w-lg"
    >
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-2xl shadow-[0_8px_40px_rgba(0,0,0,0.5)] p-6">
        <div className="text-center mb-5">
          <p className="text-neutral-400 text-[10px] uppercase tracking-[0.3em] mb-1">Lobby</p>
          <h2 className="text-2xl font-black text-white flex items-center justify-center gap-2">
            {isFull ? (
              <span className="text-emerald-400">{status}</span>
            ) : (
              <>
                Waiting for players
                <span className="inline-flex gap-1">
                  <span className="w-1 h-1 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1 h-1 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1 h-1 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
              </>
            )}
          </h2>
        </div>

        {/* Progress */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-neutral-400 uppercase tracking-wider">Players</span>
            <span className="text-sm font-bold text-white tabular-nums">{filled}/{matchSize}</span>
          </div>
          <div className="h-2 rounded-full bg-black/40 border border-white/10 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
              animate={{ width: `${(filled / matchSize) * 100}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* Player slots */}
        <div className="grid grid-cols-5 gap-2.5 mb-6">
          {slots.map((_, i) => {
            const player = players[i];
            return (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <div
                  className={`relative w-11 h-11 rounded-xl flex items-center justify-center border transition-all ${
                    player
                      ? "bg-emerald-400/10 border-emerald-400/40"
                      : "bg-white/[0.02] border-white/10 border-dashed"
                  }`}
                >
                  <AnimatePresence>
                    {player && (
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 300, damping: 18 }}
                        className="text-xs font-bold text-emerald-300"
                      >
                        {player.username?.slice(0, 2).toUpperCase() ?? "??"}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <span className="text-[8px] text-neutral-500 max-w-[44px] truncate">
                  {player ? player.username : "Open"}
                </span>
              </div>
            );
          })}
        </div>

        {/* Recent join feed */}
        <div className="mb-6 h-6 overflow-hidden text-center">
          <AnimatePresence mode="popLayout">
            {players.length > 0 && (
              <motion.p
                key={players[players.length - 1]?.socketId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                className="text-xs text-neutral-300"
              >
                <span className="font-bold text-emerald-400">
                  {players[players.length - 1]?.username}
                </span>{" "}
                joined the room
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <button
          onClick={onCancel}
          disabled={isFull}
          className="w-full rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed transition-colors py-3 text-xs font-semibold text-neutral-300 uppercase tracking-wide"
        >
          {isFull ? "Launching..." : "Cancel"}
        </button>
      </div>
    </motion.div>
  );
}
