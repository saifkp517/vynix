"use client";

import React, { useState, useEffect } from "react";
import {
  Play,
  Users,
  Trophy,
  Settings,
  Circle,
  X,
  Volume2,
  VolumeX,
  Monitor,
  Gamepad2,
  Shield,
  Crown,
  Sword,
  Medal,
  Star,
  UserPlus,
  MessageCircle,
  MoreVertical,
  Check,
  UserX
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useThemeConfig } from "./theme-provider";
import { getRadiusClass } from "@/lib/theme-config";
import { redirect } from "next/navigation";
import { Player } from "@/hooks/useRoomStore";

import socket from "@/lib/socket";

import { useRoomStore } from "@/hooks/useRoomStore";

export default function GameLoadoutMenu() {
  const [mounted, setMounted] = useState(false);
  const [matchmakingStatus, setMatchmakingStatus] = useState("Find Match");
  const [isMatchMaking, setIsMatchmaking] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [findMatchHover, setFindMatchHover] = useState(false);


  // Settings state
  const [settings, setSettings] = useState({
    masterVolume: 80,
    musicVolume: 70,
    sfxVolume: 85,
    voiceVolume: 60,
    muteAll: false,
    fullscreen: true,
    vsync: true,
    showFPS: false,
    autoSave: true,
    notifications: true,
    chatEnabled: true,
    friendRequests: true
  });

  // ================= RECIEVE SOCKET EVENTS ==========================

  useEffect(() => {

    socket.on("roomSnapshot", ({ roomPlayers }: { roomPlayers: Record<string, Player> }) => {
      const playersArray = Object.values(roomPlayers);
      console.log("current room players", roomPlayers, playersArray);
      useRoomStore.getState().setPlayers([...playersArray]);
    });

    socket.on("roomAssigned", ({ roomId }) => {
      setMatchmakingStatus("Match Found!!")
      redirect(`forest/${roomId}`);
    })

    socket.on("cancelledMatchmaking", () => {
      setMatchmakingStatus("Find Match")
      setIsMatchmaking(false);
    })

    socket.on("spawnPoint", (spawnPoint) => {
      console.log("got spawn point: ", spawnPoint)
      useRoomStore.getState().setSpawnPoint(spawnPoint)
    })

    return () => {
      socket.off("roomSnapshot", ({ roomPlayers }: { roomPlayers: Record<string, Player> }) => {
        const playersArray = Object.values(roomPlayers);
        console.log("current room players", roomPlayers, playersArray);
        useRoomStore.getState().setPlayers([...playersArray]);
      });

      socket.off("roomAssigned", ({ roomId }) => {
        setMatchmakingStatus("Match Found!!")
        redirect(`forest/${roomId}`);
      })

      socket.off("cancelledMatchmaking", () => {
        setMatchmakingStatus("Find Match")
        setIsMatchmaking(false);
      })
    };
  }, [socket])

  // ==================================================================

  // Mock data for leaderboard and friends
  const [leaderboardData] = useState([
    { rank: 1, name: "DragonSlayer", level: 89, wins: 2847, winRate: 94.2, points: 15420 },
    { rank: 2, name: "ShadowKnight", level: 82, wins: 2156, winRate: 91.8, points: 14890 },
    { rank: 3, name: "WarriorKing", level: 47, wins: 1876, winRate: 74.7, points: 12340 },
    { rank: 4, name: "BattleMage", level: 76, wins: 1654, winRate: 88.3, points: 11950 },
    { rank: 5, name: "StormBreaker", level: 71, wins: 1543, winRate: 85.7, points: 11200 }
  ]);

  const [friendsData, setFriendsData] = useState([
    { id: 1, name: "ShadowKnight", status: "online", level: 82, activity: "In Match" },
    { id: 2, name: "BattleMage", status: "online", level: 76, activity: "Main Menu" },
    { id: 3, name: "StormBreaker", status: "away", level: 71, activity: "Away" },
    { id: 4, name: "IronFist", status: "offline", level: 65, activity: "Last seen 2h ago" },
    { id: 5, name: "FrostBite", status: "online", level: 58, activity: "Training" }
  ]);

  const handleMatchmaking = () => {


    if (isMatchMaking) {

      socket.emit("cancelMatchmaking");
      setIsMatchmaking(false);
      setMatchmakingStatus("Cancelling MatchMaking....")

    } else {

      socket.emit("requestMatchmaking");
      setIsMatchmaking(true);
      setMatchmakingStatus("Matchmaking...")

    }

  };



  const updateSetting = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  // Leaderboard Component
  const LeaderboardSection = () => (
    <Card className="w-full max-w-4xl bg-black/90 border-gray-700 text-white">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-2xl font-light tracking-wide flex items-center gap-2">
            <Trophy className="h-6 w-6 text-yellow-500" />
            GLOBAL LEADERBOARD
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveSection(null)}
            className="text-gray-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-6 overflow-y-auto max-h-[70vh]">
        <div className="space-y-3">
          {leaderboardData.map((player) => (
            <div
              key={player.rank}
              className={`flex items-center justify-between p-4 rounded-lg transition-all duration-200 hover:bg-gray-800/50 ${player.name === "WarriorKing" ? "bg-gray-800/70 border border-gray-600" : "bg-gray-800/30"
                }`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${player.rank === 1 ? "bg-yellow-500 text-black" :
                  player.rank === 2 ? "bg-gray-300 text-black" :
                    player.rank === 3 ? "bg-yellow-600 text-white" :
                      "bg-gray-600 text-white"
                  }`}>
                  {player.rank <= 3 ? <Crown className="h-4 w-4" /> : player.rank}
                </div>
                <div>
                  <div className="font-medium">{player.name}</div>
                  <div className="text-sm text-gray-400">Level {player.level}</div>
                </div>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <div className="text-center">
                  <div className="text-gray-400">Wins</div>
                  <div className="font-medium">{player.wins.toLocaleString()}</div>
                </div>
                <div className="text-center">
                  <div className="text-gray-400">Win Rate</div>
                  <div className="font-medium">{player.winRate}%</div>
                </div>
                <div className="text-center">
                  <div className="text-gray-400">Points</div>
                  <div className="font-medium text-yellow-500">{player.points.toLocaleString()}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  // Friends Section Component
  const FriendsSection = () => (
    <Card className="w-full max-w-4xl bg-black/90 border-gray-700 text-white">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-2xl font-light tracking-wide flex items-center gap-2">
            <Users className="h-6 w-6 text-yellow-500" />
            FRIENDS & ALLIES
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-gray-400 hover:text-white"
            >
              <UserPlus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActiveSection(null)}
              className="text-gray-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6 overflow-y-auto max-h-[70vh]">
        <div className="space-y-3">
          <Input
            placeholder="Search friends..."
            className="bg-gray-800/30 border-gray-600 text-white placeholder-gray-400 rounded-lg p-4 text-sm"
          />
          {friendsData.map((friend) => (
            <div
              key={friend.id}
              className="flex items-center justify-between p-4 bg-gray-800/30 rounded-lg transition-all duration-200 hover:bg-gray-800/50"
            >
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold bg-gray-600 text-white`}>
                    <Sword className="h-4 w-4" />
                  </div>
                  <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-gray-900 ${friend.status === "online" ? "bg-green-500" :
                    friend.status === "away" ? "bg-yellow-600" :
                      "bg-gray-300"
                    }`}></div>
                </div>
                <div>
                  <div className="font-medium">{friend.name}</div>
                  <div className="text-sm text-gray-400">Level {friend.level} • {friend.activity}</div>
                </div>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <div className="text-center">
                  {friend.status === "online" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-gray-400 hover:text-white"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </Button>
                  ) : (
                    <div className="w-8"></div>
                  )}
                </div>
                <div className="text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-gray-400 hover:text-white"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  // Settings Section Component
  const SettingsSection = () => (
    <Card className="w-full max-w-4xl bg-black/90 border-gray-700 text-white">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-2xl font-light tracking-wide flex items-center gap-2">
            <Settings className="h-6 w-6 text-yellow-500" />
            GAME SETTINGS
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveSection(null)}
            className="text-gray-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-6 overflow-y-auto max-h-[70vh]">
        <div className="space-y-3">
          {/* Audio Settings */}
          <div className="p-4 bg-gray-800/30 rounded-lg transition-all duration-200 hover:bg-gray-800/50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-600">
                  {settings.muteAll ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </div>
                <div>
                  <div className="font-medium">Audio Settings</div>
                  <div className="text-sm text-gray-400">Adjust sound levels</div>
                </div>
              </div>
            </div>
            <div className="space-y-3 ml-12">
              <div className="flex items-center justify-between">
                <div className="font-medium">Mute All</div>
                <input
                  type="checkbox"
                  checked={settings.muteAll}
                  onChange={(e) => updateSetting("muteAll", e.target.checked)}
                  className="w-4 h-4 accent-white rounded"
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="font-medium">Master Volume</div>
                <div className="flex items-center gap-6">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={settings.masterVolume}
                    onChange={(e) => updateSetting("masterVolume", parseInt(e.target.value))}
                    disabled={settings.muteAll}
                    className="w-24 h-2 bg-gray-600 rounded-lg appearance-none accent-white cursor-pointer disabled:opacity-50"
                  />
                  <div className="text-sm text-gray-400 min-w-[3rem]">{settings.masterVolume}%</div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="font-medium">Music Volume</div>
                <div className="flex items-center gap-6">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={settings.musicVolume}
                    onChange={(e) => updateSetting("musicVolume", parseInt(e.target.value))}
                    disabled={settings.muteAll}
                    className="w-24 h-2 bg-gray-600 rounded-lg appearance-none accent-white cursor-pointer disabled:opacity-50"
                  />
                  <div className="text-sm text-gray-400 min-w-[3rem]">{settings.musicVolume}%</div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="font-medium">SFX Volume</div>
                <div className="flex items-center gap-6">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={settings.sfxVolume}
                    onChange={(e) => updateSetting("sfxVolume", parseInt(e.target.value))}
                    disabled={settings.muteAll}
                    className="w-24 h-2 bg-gray-600 rounded-lg appearance-none accent-white cursor-pointer disabled:opacity-50"
                  />
                  <div className="text-sm text-gray-400 min-w-[3rem]">{settings.sfxVolume}%</div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="font-medium">Voice Volume</div>
                <div className="flex items-center gap-6">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={settings.voiceVolume}
                    onChange={(e) => updateSetting("voiceVolume", parseInt(e.target.value))}
                    disabled={settings.muteAll}
                    className="w-24 h-2 bg-gray-600 rounded-lg appearance-none accent-white cursor-pointer disabled:opacity-50"
                  />
                  <div className="text-sm text-gray-400 min-w-[3rem]">{settings.voiceVolume}%</div>
                </div>
              </div>
            </div>
          </div>

          {/* Display Settings */}
          <div className="p-4 bg-gray-800/30 rounded-lg transition-all duration-200 hover:bg-gray-800/50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-600">
                  <Monitor className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-medium">Display Settings</div>
                  <div className="text-sm text-gray-400">Adjust visual options</div>
                </div>
              </div>
            </div>
            <div className="space-y-3 ml-12">
              <div className="flex items-center justify-between">
                <div className="font-medium">Fullscreen Mode</div>
                <input
                  type="checkbox"
                  checked={settings.fullscreen}
                  onChange={(e) => updateSetting("fullscreen", e.target.checked)}
                  className="w-4 h-4 accent-white rounded"
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="font-medium">V-Sync</div>
                <input
                  type="checkbox"
                  checked={settings.vsync}
                  onChange={(e) => updateSetting("vsync", e.target.checked)}
                  className="w-4 h-4 accent-white rounded"
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="font-medium">Show FPS Counter</div>
                <input
                  type="checkbox"
                  checked={settings.showFPS}
                  onChange={(e) => updateSetting("showFPS", e.target.checked)}
                  className="w-4 h-4 accent-white rounded"
                />
              </div>
            </div>
          </div>

          {/* Game Settings */}
          <div className="p-4 bg-gray-800/30 rounded-lg transition-all duration-200 hover:bg-gray-800/50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-600">
                  <Gamepad2 className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-medium">Game Settings</div>
                  <div className="text-sm text-gray-400">Adjust gameplay options</div>
                </div>
              </div>
            </div>
            <div className="space-y-3 ml-12">
              <div className="flex items-center justify-between">
                <div className="font-medium">Auto-Save</div>
                <input
                  type="checkbox"
                  checked={settings.autoSave}
                  onChange={(e) => updateSetting("autoSave", e.target.checked)}
                  className="w-4 h-4 accent-white rounded"
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="font-medium">Notifications</div>
                <input
                  type="checkbox"
                  checked={settings.notifications}
                  onChange={(e) => updateSetting("notifications", e.target.checked)}
                  className="w-4 h-4 accent-white rounded"
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="font-medium">Chat Enabled</div>
                <input
                  type="checkbox"
                  checked={settings.chatEnabled}
                  onChange={(e) => updateSetting("chatEnabled", e.target.checked)}
                  className="w-4 h-4 accent-white rounded"
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="font-medium">Friend Requests</div>
                <input
                  type="checkbox"
                  checked={settings.friendRequests}
                  onChange={(e) => updateSetting("friendRequests", e.target.checked)}
                  className="w-4 h-4 accent-white rounded"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between p-4 bg-gray-800/30 rounded-lg transition-all duration-200 hover:bg-gray-800/50">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-600">
                <Check className="h-4 w-4" />
              </div>
              <div>
                <div className="font-medium">Save Settings</div>
                <div className="text-sm text-gray-400">Apply or reset changes</div>
              </div>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <Button
                variant="ghost"
                className="text-gray-400 hover:text-white"
              >
                Reset
              </Button>
              <Button className="text-gray-400 hover:text-white">
                <Check className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-8 relative overflow-hidden">

      {/* Background Image + Blur + Overlay */}
      <div className="absolute inset-0 z-0">
        <div
          className="absolute inset-0 bg-cover bg-center blur-xs"
          style={{ backgroundImage: "url('/images/background.png')" }}
        />
        <div className="absolute inset-0 bg-black/10 backdrop-blur-xs" />
      </div>

      {/* Overlay for active sections */}
      {activeSection && (
        <div className="fixed inset-0 bg-black/50 z-20 flex items-center justify-center p-4">
          {activeSection === "leaderboard" && <LeaderboardSection />}
          {activeSection === "friends" && <FriendsSection />}
          {activeSection === "settings" && <SettingsSection />}
        </div>
      )}

      {/* Main Container */}
      <div className="w-full max-w-4xl relative z-10">

        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-6xl font-bold text-black tracking-wider mb-4">
            Zentra.io
          </h1>
          <div className="w-24 h-px bg-black/40 mx-auto"></div>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-12 gap-8 items-center">

          {/* Left - Player Info */}
          <div className="col-span-3 space-y-8">
            <div className="text-right">
              <div className="text-sm text-white/70 uppercase tracking-wide mb-1">Player</div>
              <div className="text-xl text-white font-medium">WarriorKing</div>
            </div>

            <div className="text-right">
              <div className="text-sm text-white/70 uppercase tracking-wide mb-1">Level</div>
              <div className="text-xl text-white font-medium">47</div>
            </div>

            <div className="text-right">
              <div className="text-sm text-white/70 uppercase tracking-wide mb-1">Rank</div>
              <div className="text-xl text-white font-medium">Diamond III</div>
            </div>
          </div>

          {/* Center - Main Actions */}
          <div className="col-span-6 space-y-12">

            {/* Primary Action */}
            <div className="text-center">
              <Button
                onClick={handleMatchmaking}
                className="w-64 h-16 bg-gray-900 hover:bg-gray-800 text-white text-lg font-light tracking-wider rounded-none border-0 transition-all duration-300 hover:scale-105"
                onMouseEnter={() => setFindMatchHover(true)}
                onMouseLeave={() => setFindMatchHover(false)}
              >
                {findMatchHover && isMatchMaking && matchmakingStatus
                  ? "Cancel Matchmaking"
                  : matchmakingStatus}
              </Button>
            </div>
          </div>

          {/* Right - Game Stats */}
          <div className="col-span-3 space-y-8">
            <div>
              <div className="text-sm text-white/70 uppercase tracking-wide mb-1">Online</div>
              <div className="text-xl text-white font-medium">12,847</div>
            </div>

            <div>
              <div className="text-sm text-white/70 uppercase tracking-wide mb-1">Win Rate</div>
              <div className="text-xl text-white font-medium">74.7%</div>
            </div>

            <div>
              <div className="text-sm text-white/70 uppercase tracking-wide mb-1">Best Streak</div>
              <div className="text-xl text-white font-medium">12</div>
            </div>
          </div>
        </div>

        {/* Bottom Navigation */}
        <div className="flex justify-center space-x-16 mt-20">
          {[
            { icon: Trophy, label: "Leaderboard", key: "leaderboard" },
            { icon: Users, label: "Friends", key: "friends" },
            { icon: Settings, label: "Settings", key: "settings" }
          ].map(({ icon: Icon, label, key }) => (
            <button
              key={label}
              onClick={() => setActiveSection(key)}
              className="flex flex-col items-center space-y-2 text-gray-400 hover:text-gray-600 transition-all duration-300 group"
            >
              <Icon className="h-5 w-5 group-hover:scale-110 transition-transform duration-300" />
              <span className="text-xs uppercase tracking-wide font-light">{label}</span>
            </button>
          ))}
        </div>

      </div>
    </div>
  );
}