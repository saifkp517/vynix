'use client'
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Gamepad2, 
  Users, 
  Timer, 
  ArrowRightToLine, 
  UserPlus, 
  Trophy, 
  Globe,
  PlusSquare 
} from 'lucide-react';
import Navbar from '@/components/custom/navbar/Navbar';
import { redirect, useRouter } from 'next/navigation';
import { useAuth } from './utils/AuthContext';

const GameNexusPlatform = () => {
  const { user, loading, loggedIn } = useAuth();
  const [username, setUsername] = useState("");
  const [roomCode, setRoomCode] = useState('');
  const [selectedTeamSize, setSelectedTeamSize] = useState(4);
  const router = useRouter();

  useEffect(() => {
    if(loading === false && loggedIn === false) {
      redirect("/login");
    }
    setUsername(user?.username);
  }, [user, loading, loggedIn]);

  // Available matches
  const availableMatches = [
    { 
      id: 'nx-2425', 
      name: 'Nebula Explorers', 
      currentPlayers: 6, 
      maxPlayers: 8, 
      difficulty: 'Standard', 
      creator: 'stellarQuest' 
    },
    { 
      id: 'cr-1872', 
      name: 'Cosmic Raiders', 
      currentPlayers: 3, 
      maxPlayers: 4, 
      difficulty: 'Advanced', 
      creator: 'voidWalker' 
    },
    { 
      id: 'vx-3310', 
      name: 'Void Explorers', 
      currentPlayers: 2, 
      maxPlayers: 6, 
      difficulty: 'Standard', 
      creator: 'nebulaHunter' 
    }
  ];

  // Recent players
  const recentPlayers = [
    { username: 'nebulaHunter', avatar: '/api/placeholder/30/30', status: 'online' },
    { username: 'voidWalker', avatar: '/api/placeholder/30/30', status: 'offline' },
    { username: 'stellarQuest', avatar: '/api/placeholder/30/30', status: 'online' },
    { username: 'cosmicShift', avatar: '/api/placeholder/30/30', status: 'online' },
  ];

  const handleJoinMatch = () => {
    if (roomCode.trim()) {
      router.push(`/game?room=${roomCode}&user=${username}`);
    }
  };

  const handleCreateMatch = () => {
    // Generate random room code and redirect
    const generatedCode = 'NX-' + Math.floor(1000 + Math.random() * 9000);
    router.push(`/game?room=${generatedCode}&user=${username}&host=true&teamSize=${selectedTeamSize}`);
  };

  const handleQuickJoin = (matchId: string) => {
    router.push(`/game?room=${matchId}&user=${username}`);
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <Navbar eloscore={231} username={username || "Guest"} icon={user?.icon || "default"} />

      {/* Main content */}
      <div className="flex-1 w-full max-w-6xl mx-auto p-4 space-y-6">
        <div className="grid md:grid-cols-3 gap-6">
          {/* Main Panel */}
          <div className="md:col-span-2 space-y-6">
            <Card className="bg-gray-900 border-gray-800 text-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-2xl flex items-center">
                  <Gamepad2 className="w-6 h-6 mr-2 text-purple-400" />
                  Game Nexus
                </CardTitle>
                <CardDescription className="text-gray-400">
                  Enter the void with your team
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-gray-400">JOIN EXISTING MATCH</h3>
                    <div className="flex gap-2">
                      <Input
                        value={roomCode}
                        onChange={e => setRoomCode(e.target.value)}
                        placeholder="Enter room code"
                        className="flex-1 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
                      />
                      <Button
                        onClick={handleJoinMatch}
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        <ArrowRightToLine className="w-4 h-4 mr-2" />
                        Join
                      </Button>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-gray-400">CREATE NEW MATCH</h3>
                    <div className="flex gap-2">
                      <div className="flex-1 grid grid-cols-3 gap-2">
                        <Button 
                          variant={selectedTeamSize === 2 ? "default" : "outline"} 
                          onClick={() => setSelectedTeamSize(2)}
                          className={selectedTeamSize === 2 ? "bg-purple-600 hover:bg-purple-700" : "border-gray-700 text-gray-300"}
                        >
                          2v2
                        </Button>
                        <Button 
                          variant={selectedTeamSize === 3 ? "default" : "outline"} 
                          onClick={() => setSelectedTeamSize(3)}
                          className={selectedTeamSize === 3 ? "bg-purple-600 hover:bg-purple-700" : "border-gray-700 text-gray-300"}
                        >
                          3v3
                        </Button>
                        <Button 
                          variant={selectedTeamSize === 4 ? "default" : "outline"} 
                          onClick={() => setSelectedTeamSize(4)}
                          className={selectedTeamSize === 4 ? "bg-purple-600 hover:bg-purple-700" : "border-gray-700 text-gray-300"}
                        >
                          4v4
                        </Button>
                      </div>
                      <Button
                        onClick={handleCreateMatch}
                        className="bg-cyan-600 hover:bg-cyan-700"
                      >
                        <PlusSquare className="w-4 h-4 mr-2" />
                        Create
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-900 border-gray-800 text-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-xl flex items-center">
                  <Globe className="w-5 h-5 mr-2 text-cyan-400" />
                  Available Matches
                </CardTitle>
                <CardDescription className="text-gray-400">
                  Join an existing game session
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-80 pr-4">
                  <div className="space-y-3">
                    {availableMatches.map(match => (
                      <div key={match.id} className="flex justify-between items-center p-4 border border-gray-800 rounded-md bg-gray-800/50 hover:bg-gray-800 transition-colors">
                        <div>
                          <p className="font-medium text-lg">{match.name}</p>
                          <div className="flex gap-2 text-sm text-gray-400">
                            <span className="flex items-center">
                              <Users className="w-3 h-3 mr-1" />
                              {match.currentPlayers}/{match.maxPlayers}
                            </span>
                            <span>•</span>
                            <Badge variant="outline" className={
                              match.difficulty === 'Standard' ? 'bg-cyan-900/30 text-cyan-300 border-cyan-700' : 
                              match.difficulty === 'Advanced' ? 'bg-purple-900/30 text-purple-300 border-purple-700' : 
                              'bg-orange-900/30 text-orange-300 border-orange-700'
                            }>
                              {match.difficulty}
                            </Badge>
                            <span>•</span>
                            <span className="text-gray-500">ID: {match.id}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm flex items-center text-gray-400">
                            By: {match.creator}
                          </span>
                          <Button size="sm" onClick={() => handleQuickJoin(match.id)} className="bg-cyan-600 hover:bg-cyan-700">
                            <ArrowRightToLine className="w-4 h-4 mr-1" />
                            Join
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Side Panel */}
          <div className="space-y-6">
            <Card className="bg-gray-900 border-gray-800 text-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-xl flex items-center">
                  <Trophy className="w-5 h-5 mr-2 text-amber-400" />
                  Your Stats
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-800 p-4 rounded-md text-center">
                    <p className="text-gray-400 text-sm">Matches Played</p>
                    <p className="text-2xl font-bold text-white">42</p>
                  </div>
                  <div className="bg-gray-800 p-4 rounded-md text-center">
                    <p className="text-gray-400 text-sm">Win Rate</p>
                    <p className="text-2xl font-bold text-cyan-400">68%</p>
                  </div>
                  <div className="bg-gray-800 p-4 rounded-md text-center">
                    <p className="text-gray-400 text-sm">Level</p>
                    <p className="text-2xl font-bold text-purple-400">17</p>
                  </div>
                  <div className="bg-gray-800 p-4 rounded-md text-center">
                    <p className="text-gray-400 text-sm">Top Rank</p>
                    <p className="text-2xl font-bold text-amber-400">Diamond</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-900 border-gray-800 text-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-xl flex items-center">
                  <Users className="w-5 h-5 mr-2 text-cyan-400" />
                  Recent Players
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {recentPlayers.map(player => (
                    <div key={player.username} className="flex items-center justify-between p-2 rounded-md hover:bg-gray-800">
                      <div className="flex items-center gap-3">
                        <Avatar className="border border-gray-700">
                          <AvatarImage src={player.avatar} />
                          <AvatarFallback className="bg-gray-800">{player.username.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{player.username}</p>
                          <div className="flex items-center text-sm">
                            <span className={`w-2 h-2 rounded-full mr-2 ${player.status === 'online' ? 'bg-green-500' : 'bg-gray-500'}`}></span>
                            <span className="text-gray-400">{player.status}</span>
                          </div>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" className="h-8 border-gray-700">
                        <UserPlus className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameNexusPlatform;