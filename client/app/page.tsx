'use client'
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trophy, Users, Timer, Eye, CheckCircle, XCircle, Zap } from 'lucide-react';
import Navbar from '@/components/custom/navbar/Navbar';
import { redirect, useRouter } from 'next/navigation';
import { useAuth } from './utils/AuthContext';
import { useThemeConfig } from './theme-provider';

const CodeBattlePlatform = () => {
  const { user, loading, loggedIn } = useAuth();
  const { theme } = useThemeConfig();
  const [username, setUsername] = useState("");
  const [activeTab, setActiveTab] = useState('battles');
  const [roomCode, setRoomCode] = useState('');
  const router = useRouter();

  useEffect(() => {
    console.log(loading, loggedIn)
    if (loading == false && loggedIn == false) {
      redirect("/login")
    }
    setUsername(user?.username)
  }, [user]);

  // Demo data
  const upcomingBattles = [
    { id: 1, name: 'Algorithm Showdown', numberOfPlayers: 2 },
    { id: 2, name: 'Data Structure Duel', numberOfPlayers: 2 },
    { id: 3, name: 'Frontend Challenge', numberOfPlayers: 2 }
  ];

  const tournaments = [
    {
      id: 101,
      name: 'Weekly Algorithm Tournament',
      participants: 16,
      rounds: 4,
      prize: '$500',
      status: 'Registering',
      startDate: 'March 5, 2025'
    },
    {
      id: 102,
      name: 'React Masters',
      participants: 32,
      rounds: 5,
      prize: '$1,000',
      status: 'Registering',
      startDate: 'March 10, 2025'
    },
    {
      id: 103,
      name: 'Backend Battle Royale',
      participants: 8,
      rounds: 3,
      prize: '$300',
      status: 'In Progress',
      startDate: 'March 3, 2025'
    }
  ];

  const activeBattles = [
    {
      id: 201,
      name: 'Dynamic Programming Challenge',
      players: [
        { username: 'codemaster99', avatar: '/api/placeholder/30/30', rating: 1850 },
        { username: 'algorithmQueen', avatar: '/api/placeholder/30/30', rating: 1920 }
      ],
      viewers: 24,
      timeLeft: '14:22'
    },
    {
      id: 202,
      name: 'CSS Battle',
      players: [
        { username: 'frontendWizard', avatar: '/api/placeholder/30/30', rating: 1720 },
        { username: 'designDragon', avatar: '/api/placeholder/30/30', rating: 1690 }
      ],
      viewers: 13,
      timeLeft: '08:45'
    }
  ];

  const leaderboard = [
    { rank: 1, username: 'algorithmQueen', avatar: '/api/placeholder/30/30', rating: 1920, wins: 42, losses: 7 },
    { rank: 2, username: 'codemaster99', avatar: '/api/placeholder/30/30', rating: 1850, wins: 38, losses: 10 },
    { rank: 3, username: 'byteBaron', avatar: '/api/placeholder/30/30', rating: 1810, wins: 35, losses: 12 },
    { rank: 4, username: 'syntaxSage', avatar: '/api/placeholder/30/30', rating: 1790, wins: 31, losses: 14 },
    { rank: 5, username: 'frontendWizard', avatar: '/api/placeholder/30/30', rating: 1720, wins: 29, losses: 15 },
  ];

  return (
    <div className={`flex flex-col w-full mx-auto p-4 space-y-6 ${
      theme.name === 'dark' 
        ? 'bg-gray-900 text-white' 
        : 'bg-gray-50 text-gray-900'
    }`}>
      {/* Header */}
      <Navbar username={"test"} icon={"asd"} eloscore={123} />

      {/* Main content */}
      <Tabs defaultValue="battles" onValueChange={setActiveTab} className="w-full">
        <TabsList className={`grid grid-cols-3 mb-6 ${
          theme.name === 'dark' ? 'bg-gray-800' : 'bg-white shadow-sm'
        }`}>
          <TabsTrigger value="battles" aria-label="Battles" className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            <span className="hidden sm:inline">Battles</span>
          </TabsTrigger>
          <TabsTrigger value="tournaments" aria-label="Tournaments" className="flex items-center gap-2">
            <Trophy className="w-5 h-5" />
            <span className="hidden sm:inline">Tournaments</span>
          </TabsTrigger>
            <TabsTrigger value="leaderboard" aria-label="Leaderboard" className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            <span className="hidden sm:inline">Store</span>
            </TabsTrigger>
        </TabsList>

        {/* Battles Tab */}
        <TabsContent value="battles" className="space-y-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Card className={
                theme.name === 'dark' 
                  ? 'bg-gray-800 border-gray-700' 
                  : 'bg-white border-gray-200 shadow-sm'
              }>
                <CardHeader>
                  <CardTitle>Join a Battle</CardTitle>
                  <CardDescription className={theme.name === 'dark' ? 'text-gray-400' : ''}>Join an existing battle or create your own</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      value={roomCode}
                      onChange={e => {
                        setRoomCode(e.target.value)
                      }}
                      placeholder="Enter room code"
                      className={`flex-1 ${
                        theme.name === 'dark' 
                          ? 'bg-gray-700 border-gray-600 text-white' 
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    />
                    <Button
                      onClick={(e) => {
                        window.location.href = `/battle?userName=${username}&elo=${100}`
                      }}
                      className={
                        theme.name === 'dark' 
                          ? 'bg-gray-500 hover:bg-gray-400' 
                          : 'bg-gray-300 hover:bg-gray-500 text-white'
                      }
                    >
                      Join
                    </Button>
                  </div>
                  <div className="flex justify-center">
                    <Button 
                      variant="outline" 
                      className={`w-full ${
                        theme.name === 'dark' 
                          ? 'border-gray-600 hover:bg-gray-700 text-white' 
                          : 'border-gray-300 hover:bg-gray-100'
                      }`}
                    >
                      Create New Battle
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <Card className={
            theme.name === 'dark' 
              ? 'bg-gray-800 border-gray-700' 
              : 'bg-white border-gray-200 shadow-sm'
          }>
            <CardHeader>
              <CardTitle>
                <div className="flex items-center">
                  Active Matches
                  <span className="relative ml-2 mb-2">
                    <span className="absolute inline-flex h-2 w-2 rounded-full bg-green-500 opacity-75 animate-ping"></span>
                    <span className="absolute inline-flex h-2 w-2 rounded-full bg-green-600"></span>
                  </span>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {upcomingBattles.map(battle => (
                  <div 
                    key={battle.id} 
                    className={`flex flex-col sm:flex-row justify-between items-center p-3 border rounded-md ${
                      theme.name === 'dark' 
                        ? 'border-gray-700 bg-gray-700/50' 
                        : 'border-gray-200 bg-white shadow-sm'
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">MatchId: {battle.id}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2 sm:mt-0">
                      <span className={`text-sm flex items-center ${
                        theme.name === 'dark' ? 'text-gray-300' : 'text-gray-600'
                      }`}>
                        <Users className="w-4 h-4 mr-1" />
                        {battle.numberOfPlayers}/10
                      </span>
                      <Button 
                        size="sm"
                        className={
                          theme.name === 'dark' 
                            ? 'bg-blue-600 hover:bg-blue-700' 
                            : 'bg-blue-500 hover:bg-blue-600 text-white'
                        }
                      >Join</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tournaments Tab */}
        <TabsContent value="tournaments" className="space-y-6">
          <span className={`text-xl font-semibold ${theme.name === 'dark' ? 'text-gray-300' : 'text-gray-400'}`}>Coming Soon</span>

          <div className="grid md:grid-cols-2 gap-4 relative">
            <div className="absolute inset-0 flex items-center justify-center bg-transparent opacity-0 rounded-2xl z-10">
            </div>
            <div className="blur-sm pointer-events-none">
              {tournaments.map(tournament => (
                <Card key={tournament.id} className={
                  theme.name === 'dark' 
                    ? 'bg-gray-800 border-gray-700' 
                    : 'bg-white border-gray-200 shadow-sm'
                }>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle>{tournament.name}</CardTitle>
                        <CardDescription className={theme.name === 'dark' ? 'text-gray-400' : ''}>Starts on {tournament.startDate}</CardDescription>
                      </div>
                      <Badge className={
                        tournament.status === 'Registering' 
                          ? theme.name === 'dark' ? 'bg-green-900 text-green-300' : 'bg-green-100 text-green-800'
                          : theme.name === 'dark' ? 'bg-blue-900 text-blue-300' : 'bg-blue-100 text-blue-800'
                      }>
                        {tournament.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <div>
                        <p className={`text-sm ${
                        theme.name === 'dark' ? 'text-gray-400' : 'text-gray-600'
                      }`}>Participants</p>
                        <p className="font-medium">{tournament.participants}</p>
                      </div>
                      <div>
                        <p className={`text-sm ${
                        theme.name === 'dark' ? 'text-gray-400' : 'text-gray-600'
                      }`}>Rounds</p>
                        <p className="font-medium">{tournament.rounds}</p>
                      </div>
                      <div>
                        <p className={`text-sm ${
                        theme.name === 'dark' ? 'text-gray-400' : 'text-gray-600'
                      }`}>Prize</p>
                        <p className={`font-medium ${theme.name === 'dark' ? 'text-amber-400' : 'text-amber-600'}`}>{tournament.prize}</p>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button 
                      className={`w-full ${
                        theme.name === 'dark' 
                          ? 'bg-blue-600 hover:bg-blue-700' 
                          : 'bg-blue-500 hover:bg-blue-600 text-white'
                      }`}
                    >
                      {tournament.status === 'Registering' ? 'Register' : 'View Bracket'}
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          </div>

          <Card className={
            theme.name === 'dark' 
              ? 'bg-gray-800 border-gray-700' 
              : 'bg-white border-gray-200 shadow-sm'
          }>
            <CardHeader>
              <CardTitle>Create Tournament</CardTitle>
              <CardDescription className={theme.name === 'dark' ? 'text-gray-400' : ''}>Set up your own coding tournament</CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                className={`w-full ${
                  theme.name === 'dark' 
                    ? 'bg-blue-600 hover:bg-blue-700' 
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                }`}
              >Create Tournament</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Leaderboard Tab */}
        <TabsContent value="leaderboard">
          <span className={`text-xl font-semibold ${theme.name === 'dark' ? 'text-gray-300' : 'text-gray-400'}`}>Coming Soon</span>

          <div className="grid md:grid-cols-2 gap-4 relative">
            <div className="absolute inset-0 flex items-center justify-center bg-transparent opacity-0 rounded-2xl z-10">
            </div>
            <div className="blur-sm pointer-events-none">
              <Card className={
                theme.name === 'dark' 
                  ? 'bg-gray-800 border-gray-700' 
                  : 'bg-white border-gray-200 shadow-sm'
              }>
                <CardHeader>
                  <CardTitle>Global Leaderboard</CardTitle>
                  <CardDescription className={theme.name === 'dark' ? 'text-gray-400' : ''}>Top performers this month</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-96">
                    <div className="space-y-1">
                      {leaderboard.map((player, index) => (
                        <div
                          key={player.username}
                          className={`flex items-center p-3 rounded-md ${
                            theme.name === 'dark' 
                              ? index === 0 ? 'bg-amber-900/30' : index === 1 ? 'bg-gray-700' : index === 2 ? 'bg-orange-900/30' : ''
                              : index === 0 ? 'bg-amber-100' : index === 1 ? 'bg-slate-100' : index === 2 ? 'bg-orange-100' : 'bg-white'
                          }`}
                        >
                          <div className="w-8 text-center font-semibold">
                            {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : player.rank}
                          </div>
                          <Avatar className="mx-3">
                            <AvatarImage src={player.avatar} />
                            <AvatarFallback>{player.username.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <p className="font-medium">{player.username}</p>
                            <div className={`flex text-sm ${
                              theme.name === 'dark' ? 'text-gray-400' : 'text-gray-600'
                            }`}>
                              <span className={`flex items-center ${theme.name === 'dark' ? 'text-green-400' : 'text-green-600'}`}>
                                <CheckCircle className="w-3 h-3 mr-1" />
                                {player.wins}
                              </span>
                              <span className="mx-1">•</span>
                              <span className={`flex items-center ${theme.name === 'dark' ? 'text-red-400' : 'text-red-600'}`}>
                                <XCircle className="w-3 h-3 mr-1" />
                                {player.losses}
                              </span>
                            </div>
                          </div>
                          <Badge 
                            variant="outline" 
                            className={
                              theme.name === 'dark' 
                                ? 'bg-amber-900/50 text-amber-300 border-amber-700' 
                                : 'bg-amber-200 text-amber-800 border-amber-300'
                            }
                          >
                            <Trophy className={`w-3 h-3 mr-1 ${theme.name === 'dark' ? 'text-amber-400' : 'text-amber-500'}`} />
                            {player.rating}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CodeBattlePlatform;