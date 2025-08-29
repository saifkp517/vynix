"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
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

export default function GameLoadoutMenu() {
  const { theme: configTheme } = useThemeConfig();
  const [mounted, setMounted] = useState(false);
  const [selectedMode, setSelectedMode] = useState(0);
  const [activeSection, setActiveSection] = useState<string | null>(null);

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

  const handleQuickPlay = () => {
    redirect("/forest");
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
      <CardContent className="p-6">
        <div className="space-y-3">
          {leaderboardData.map((player, index) => (
            <div 
              key={player.rank} 
              className={`flex items-center justify-between p-4 rounded-lg transition-all duration-200 hover:bg-gray-800/50 ${
                player.name === "WarriorKing" ? "bg-gray-800/70 border border-gray-600" : "bg-gray-800/30"
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                  player.rank === 1 ? "bg-yellow-500 text-black" :
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
            <Users className="h-6 w-6 text-blue-500" />
            FRIENDS & ALLIES
          </CardTitle>
          <div className="flex gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-gray-400 hover:text-white border-gray-600 hover:bg-gray-800/50"
            >
              <UserPlus className="h-4 w-4 mr-1" />
              Add Friend
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
      <CardContent className="p-6">
        <div className="mb-6">
          <Input 
            placeholder="Search friends..." 
            className="bg-gray-800/30 border-gray-600 text-white placeholder-gray-400 rounded-lg"
          />
        </div>
        <div className="space-y-3">
          {friendsData.map((friend) => (
            <div 
              key={friend.id} 
              className="flex items-center justify-between p-4 bg-gray-800/30 rounded-lg hover:bg-gray-800/50 transition-all duration-200"
            >
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center">
                    <Sword className="h-4 w-4" />
                  </div>
                  <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-gray-900 ${
                    friend.status === "online" ? "bg-green-500" :
                    friend.status === "away" ? "bg-yellow-500" :
                    "bg-gray-500"
                  }`}></div>
                </div>
                <div>
                  <div className="font-medium">{friend.name}</div>
                  <div className="text-sm text-gray-400">Level {friend.level} • {friend.activity}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {friend.status === "online" && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-gray-400 hover:text-white border-gray-600 hover:bg-gray-800/50"
                  >
                    <MessageCircle className="h-4 w-4 mr-1" />
                    Invite
                  </Button>
                )}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-gray-400 hover:text-white"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
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
            <Settings className="h-6 w-6 text-gray-400" />
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
      <CardContent className="p-6 space-y-8">
        
        {/* Audio Settings */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-300 flex items-center gap-2">
            {settings.muteAll ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            Audio Settings
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-800/30 rounded-lg">
                <Label className="text-gray-300 font-medium">Mute All</Label>
                <input 
                  type="checkbox" 
                  checked={settings.muteAll}
                  onChange={(e) => updateSetting("muteAll", e.target.checked)}
                  className="w-4 h-4 text-gray-400"
                />
              </div>
              <div className="space-y-2 p-4 bg-gray-800/30 rounded-lg">
                <div className="flex justify-between">
                  <Label className="text-gray-300 font-medium">Master Volume</Label>
                  <span className="text-sm text-gray-400">{settings.masterVolume}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={settings.masterVolume}
                  onChange={(e) => updateSetting("masterVolume", parseInt(e.target.value))}
                  disabled={settings.muteAll}
                  className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                />
              </div>
              <div className="space-y-2 p-4 bg-gray-800/30 rounded-lg">
                <div className="flex justify-between">
                  <Label className="text-gray-300 font-medium">Music Volume</Label>
                  <span className="text-sm text-gray-400">{settings.musicVolume}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={settings.musicVolume}
                  onChange={(e) => updateSetting("musicVolume", parseInt(e.target.value))}
                  disabled={settings.muteAll}
                  className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                />
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-2 p-4 bg-gray-800/30 rounded-lg">
                <div className="flex justify-between">
                  <Label className="text-gray-300 font-medium">SFX Volume</Label>
                  <span className="text-sm text-gray-400">{settings.sfxVolume}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={settings.sfxVolume}
                  onChange={(e) => updateSetting("sfxVolume", parseInt(e.target.value))}
                  disabled={settings.muteAll}
                  className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                />
              </div>
              <div className="space-y-2 p-4 bg-gray-800/30 rounded-lg">
                <div className="flex justify-between">
                  <Label className="text-gray-300 font-medium">Voice Volume</Label>
                  <span className="text-sm text-gray-400">{settings.voiceVolume}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={settings.voiceVolume}
                  onChange={(e) => updateSetting("voiceVolume", parseInt(e.target.value))}
                  disabled={settings.muteAll}
                  className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Display Settings */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-300 flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Display Settings
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-800/30 rounded-lg">
                <Label className="text-gray-300 font-medium">Fullscreen Mode</Label>
                <input 
                  type="checkbox" 
                  checked={settings.fullscreen}
                  onChange={(e) => updateSetting("fullscreen", e.target.checked)}
                  className="w-4 h-4 text-gray-400"
                />
              </div>
              <div className="flex items-center justify-between p-4 bg-gray-800/30 rounded-lg">
                <Label className="text-gray-300 font-medium">V-Sync</Label>
                <input 
                  type="checkbox" 
                  checked={settings.vsync}
                  onChange={(e) => updateSetting("vsync", e.target.checked)}
                  className="w-4 h-4 text-gray-400"
                />
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-800/30 rounded-lg">
                <Label className="text-gray-300 font-medium">Show FPS Counter</Label>
                <input 
                  type="checkbox" 
                  checked={settings.showFPS}
                  onChange={(e) => updateSetting("showFPS", e.target.checked)}
                  className="w-4 h-4 text-gray-400"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Game Settings */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-300 flex items-center gap-2">
            <Gamepad2 className="h-5 w-5" />
            Game Settings
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-800/30 rounded-lg">
                <Label className="text-gray-300 font-medium">Auto-Save</Label>
                <input 
                  type="checkbox" 
                  checked={settings.autoSave}
                  onChange={(e) => updateSetting("autoSave", e.target.checked)}
                  className="w-4 h-4 text-gray-400"
                />
              </div>
              <div className="flex items-center justify-between p-4 bg-gray-800/30 rounded-lg">
                <Label className="text-gray-300 font-medium">Notifications</Label>
                <input 
                  type="checkbox" 
                  checked={settings.notifications}
                  onChange={(e) => updateSetting("notifications", e.target.checked)}
                  className="w-4 h-4 text-gray-400"
                />
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-800/30 rounded-lg">
                <Label className="text-gray-300 font-medium">Chat Enabled</Label>
                <input 
                  type="checkbox" 
                  checked={settings.chatEnabled}
                  onChange={(e) => updateSetting("chatEnabled", e.target.checked)}
                  className="w-4 h-4 text-gray-400"
                />
              </div>
              <div className="flex items-center justify-between p-4 bg-gray-800/30 rounded-lg">
                <Label className="text-gray-300 font-medium">Friend Requests</Label>
                <input 
                  type="checkbox" 
                  checked={settings.friendRequests}
                  onChange={(e) => updateSetting("friendRequests", e.target.checked)}
                  className="w-4 h-4 text-gray-400"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 pt-4 border-t border-gray-700">
          <Button 
            variant="ghost" 
            className="text-gray-400 hover:text-white border-gray-600 hover:bg-gray-800/50"
          >
            Reset to Defaults
          </Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Check className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
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
          <h1 className="text-6xl font-light text-white tracking-wider mb-4">
            BATTLEFORGE
          </h1>
          <div className="w-24 h-px bg-white/40 mx-auto"></div>
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
                onClick={handleQuickPlay}
                className="w-64 h-16 bg-gray-900 hover:bg-gray-800 text-white text-lg font-light tracking-wider rounded-none border-0 transition-all duration-300 hover:scale-105"
              >
                FIND MATCH
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