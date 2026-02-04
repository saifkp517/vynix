"use client";

import React, { useState, useEffect } from "react";
import { Users, Trophy, Settings, X, Lock, Activity } from "lucide-react";
import { useSocketHandlers } from "@/hooks/useSocketHandlersMain";
import socket from "@/lib/socket";
import { useRouter } from "next/navigation";
import axios from "axios";

export default function GameLoadoutMenu() {

  const router = useRouter();

  const [matchmakingStatus, setMatchmakingStatus] = useState("Find Match");
  const [isMatchMaking, setIsMatchmaking] = useState(false);
  const [activeSection, setActiveSection] = useState('');
  const [onlinePlayers, setOnlinePlayers] = useState(0);
  const [username, setUsername] = useState("");
  const [savedUsername, setSavedUsername] = useState("");

  useSocketHandlers(socket, {
    setMatchmakingStatus,
    setIsMatchmaking,
    redirect: (path) => {
      // your router navigation
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

  const handleUsernameChange = (value: string) => {
    setUsername(value);
    localStorage.setItem("username", value);
  };

  const ComingSoonCard = ({ icon: Icon, title, description }: any) => (
    <div className="bg-white/95 backdrop-blur-xl rounded-xl border border-slate-200 p-5 shadow-xl max-w-xs w-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-400">
            <Icon className="h-3.5 w-3.5 text-white" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        </div>
        <button
          onClick={() => setActiveSection('')}
          className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <X className="h-3.5 w-3.5 text-slate-600" />
        </button>
      </div>
      <div className="flex flex-col items-center justify-center py-6">
        <div className="relative mb-2">
          <Icon className="h-10 w-10 text-emerald-400/60" />
          <Lock className="h-3 w-3 text-amber-500 absolute -bottom-0.5 -right-0.5 bg-white rounded-full p-0.5 shadow" />
        </div>
        <p className="text-slate-900 text-xs font-semibold mb-1">Coming Soon</p>
        <p className="text-slate-600 text-[10px] text-center">{description}</p>
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
    } else {

      setUsername(savedUsername)
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
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/images/background.png')" }}
        />
        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
      </div>

      {/* Modal overlay */}
      {activeSection && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setActiveSection('')}>
          <div onClick={(e) => e.stopPropagation()}>
            {activeSection === "leaderboard" && <ComingSoonCard icon={Trophy} title="Leaderboard" description="Global rankings launching post-beta" />}
            {activeSection === "friends" && <ComingSoonCard icon={Users} title="Friends" description="Connect with players post-beta" />}
            {activeSection === "settings" && <ComingSoonCard icon={Settings} title="Settings" description="Customize your experience soon" />}
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="relative z-10 w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-black text-slate-900 mb-1 tracking-tight">
            Zentra<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-500">.io</span>
          </h1>
          <p className="text-slate-700 text-xs font-medium">Enter the Arena</p>
        </div>

        {/* Center content */}
        <div className="space-y-4">
          {/* Online counter */}
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 ">
              <Activity className="h-3 w-3 text-emerald-300 animate-pulse" />
              <span className="text-sm font-bold text-slate-900">{onlinePlayers.toLocaleString()}</span>
              <span className="text-sm text-slate-200 uppercase tracking-wide">Online</span>
            </div>
          </div>

          {/* Main CTA */}
          <div className="max-w-sm mx-auto">
            {/* Set Username Form*/}
            {/* Username input section */}
            <div className="max-w-sm mx-auto mb-4">
              <div className="bg-transparent backdrop-blur-xl rounded-lg border border-slate-200 shadow-md px-4 py-3 flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Enter your username..."
                  value={username}
                  onChange={(e) => handleUsernameChange(e.target.value)}
                  className="flex-1 text-sm text-center text-slate-200 bg-transparent focus:outline-none placeholder:text-slate-400"
                />
              </div>
              {savedUsername && (
                <p className="text-[10px] text-center text-slate-300 mt-1">
                  Playing as <span className="font-bold text-emerald-300">{savedUsername}</span>
                </p>
              )}
            </div>

            {/* Matchmaking Button */}
            <button
              onClick={handleMatchmaking}
              className="w-full group relative overflow-hidden rounded-lg transition-all hover:scale-[1.01] active:scale-[0.99] shadow-lg hover:shadow-xl"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-700 to-emerald-500 bg-[length:200%_100%] animate-gradient" />
              <div className="relative px-6 py-3 flex items-center justify-center gap-2">
                {isMatchMaking ? (
                  <>
                    <div className="flex gap-1">
                      <div className="w-1 h-1 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1 h-1 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1 h-1 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-white text-sm font-bold group-hover:opacity-0 transition-opacity duration-200">{matchmakingStatus}</span>
                    <span className="absolute left-10 right-0 mx-auto text-white text-sm font-bold opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                      Cancel Matchmaking?
                    </span>
                  </>
                ) : (
                  <span className="text-white text-sm font-bold">Find Match</span>
                )}
              </div>
            </button>
          </div>

          {/* Simple stats row */}
          <div className="flex items-center justify-center gap-6 text-center">
            <div className="group">
              <p className="text-slate-200 text-[10px] uppercase tracking-wide mb-0.5 flex items-center justify-center gap-1">
                <Lock className="h-2 w-2 text-amber-400" />
                Rank
              </p>
              <p className="text-slate-700 text-xs font-semibold">—</p>
            </div>
            <div className="w-px h-6 bg-slate-300"></div>
            <div className="group">
              <p className="text-slate-200 text-[10px] uppercase tracking-wide mb-0.5 flex items-center justify-center gap-1">
                <Lock className="h-2 w-2 text-amber-400" />
                Win Rate
              </p>
              <p className="text-slate-700 text-xs font-semibold">—</p>
            </div>
            <div className="w-px h-6 bg-slate-300"></div>
            <div className="group">
              <p className="text-slate-200 text-[10px] uppercase tracking-wide mb-0.5 flex items-center justify-center gap-1">
                <Lock className="h-2 w-2 text-amber-400" />
                Level
              </p>
              <p className="text-slate-700 text-xs font-semibold">—</p>
            </div>
          </div>

          {/* Bottom navigation */}
          <div className="flex items-center justify-center gap-6 pt-2">
            {[
              { icon: Trophy, label: "Leaderboard", key: "leaderboard" },
              { icon: Users, label: "Friends", key: "friends" },
              { icon: Settings, label: "Settings", key: "settings" },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => setActiveSection(item.key)}
                className="relative group flex flex-col items-center gap-1 hover:scale-105 transition-transform"
              >
                <div className="relative">
                  <item.icon className="h-4 w-4 text-slate-300 group-hover:text-emerald-600 transition-colors" />
                  <Lock className="h-2 w-2 text-amber-400 absolute -top-0.5 -right-0.5 rounded-full" />
                </div>
                <span className="text-slate-200 text-[9px] font-semibold group-hover:text-emerald-700 transition-colors uppercase tracking-wide">
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-slate-500 text-shadow-lg text-shadow-white text-[10px] font-medium">
          <p>Beta • More features coming soon</p>
        </div>
      </div>

      <style jsx>{`
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