import React, { RefObject, useEffect, useState } from 'react';
import { Users, X, Skull } from 'lucide-react';
import { Vector3 } from 'three';

import socket from '@/lib/socket';
import { useRoomStore } from '@/hooks/useRoomStore';

interface ScoreboardProps {
  roomId: string | null;
  currentUserId: string | null;
  isVisible: boolean;
  onToggle: () => void;
  onClose: () => void;
}

interface Player {
  socketId: string;
  userId: string;
  room: string;
  position: Vector3;
  velocity: Vector3;
  cameraDirection: Vector3;
  username: string;
  isDead: boolean;
  kills: number;
  deaths: number;
  health: number;
}

interface KillFeedItem {
  id: string;
  killerId: string;
  victimId: string;
  killerName: string;
  victimName: string;
  timestamp: number;
}

const Scoreboard: React.FC<ScoreboardProps> = ({
  roomId,
  currentUserId,
  isVisible,
  onToggle,
  onClose,
}) => {
  const [killFeed, setKillFeed] = useState<KillFeedItem[]>([]);

  const handleToggle = () => {
    onToggle();
  };

  const handleClose = () => {
    onClose();
  };

  // ========== handle recieve socket events ============

  useEffect(() => {

    const updateScoreboard = (killerId: string, victimId: string) => {
      useRoomStore.getState().updatePlayer(killerId, { kills: (useRoomStore.getState().getPlayer(killerId)?.kills || 0) + 1 });
      useRoomStore.getState().updatePlayer(victimId, { deaths: (useRoomStore.getState().getPlayer(victimId)?.deaths || 0) + 1 });
    }

    socket.on('playerDead', ({ killerSocketId, victimSocketId, killerName, victimName }) => {
      console.log(`player ${killerName} killed ${victimName}`);

      // Add to kill feed
      const newKillFeedItem: KillFeedItem = {
        id: `${killerName}-${victimName}-${Date.now()}`,
        killerId: killerSocketId,
        victimId: victimSocketId,
        killerName,
        victimName,
        timestamp: Date.now()
      };

      setKillFeed(prev => {
        const updated = [newKillFeedItem, ...prev];
        // Keep only the last 8 kills
        return updated.slice(0, 8);
      });

      updateScoreboard(killerSocketId, victimSocketId);
    });

    socket.on('playerJoined', (player: any) => {
      console.log("player joined");
      useRoomStore.getState().addPlayers([player]);
    });

    return () => {

      socket.off('playerJoined', (player: any) => {
        useRoomStore.getState().addPlayers([player]);
      });

      socket.off('playerDead');
    };
  }, [socket]);

  // Auto-remove old kill feed items after 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setKillFeed(prev => prev.filter(item => now - item.timestamp < 10000));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // ====================================================

  // Sort players by kills (descending), then by deaths (ascending)
  const players = useRoomStore.getState().players;
  const sortedPlayers = [...players].sort((a, b) => {
    if (b.kills !== a.kills) {
      return b.kills - a.kills;
    }
    return a.deaths - b.deaths;
  });

  // Calculate K/D ratio
  const getKDRatio = (kills: number, deaths: number): string => {
    if (deaths === 0) return kills > 0 ? kills.toString() : '0.00';
    return (kills / deaths).toFixed(2);
  };

  // Get player status color
  const getStatusColor = (player: Player): string => {
    if (player.health <= 0) return 'bg-red-400';
    if (player.health > 75) return 'bg-green-400';
    if (player.health > 50) return 'bg-yellow-400';
    if (player.health > 25) return 'bg-orange-400';
    return 'bg-red-400';
  };

  return (
    <>
      {/* Toggle Button - Left Side */}
      <div className="fixed left-0 top-1/2 transform -translate-y-1/2 z-30">
        <button
          onClick={handleToggle}
          className="bg-black/30 backdrop-blur-sm p-2 rounded-r-lg border-r border-white/10 hover:bg-black/50 transition-colors"
        >
          <Users size={16} className="text-white/70" />
        </button>
      </div>

      {/* Kill Feed - Right Side */}
      <div className="fixed right-4 top-4 z-30 w-64">
        <div className="space-y-1">
          {killFeed.map((kill, index) => (
            <div
              key={kill.id}
              className="bg-black/40 backdrop-blur-sm rounded-lg p-2 border border-red-500/20 animate-in slide-in-from-right-2 fade-in-0 duration-300"
              style={{
                opacity: Math.max(0.3, 1 - (index * 0.15)), // Fade older items
              }}
            >
              <div className="flex items-center gap-2 text-xs">
                <span className={`font-medium truncate max-w-20 ${kill.killerId === currentUserId ? 'text-blue-300' : 'text-gray-300'}`}>
                  {kill.killerName}
                </span>
                <Skull size={12} className="text-red-400 flex-shrink-0" />
                <span className={`font-medium truncate max-w-20 ${kill.victim === currentUserId ? 'text-blue-300' : 'text-gray-300'}`}>
                  {kill.victimName}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Scoreboard Panel */}
      {isVisible && (
        <div className="fixed left-0 top-0 h-full w-80 bg-black/50 backdrop-blur-sm border-r border-black/10 z-40">
          <div className="p-4">
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-white/70" />
                <span className="text-white font-medium">Scoreboard</span>
                <span className="text-gray-400 text-sm">({players.length})</span>
              </div>
              <button
                onClick={handleClose}
                className="text-gray-500 hover:text-gray-300 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Table Header */}
            <div className="grid grid-cols-12 gap-2 mb-2 pb-2 border-b border-white/10 text-xs text-gray-400 font-medium">
              <div className="col-span-1">#</div>
              <div className="col-span-5">Player</div>
              <div className="col-span-2 text-center">K/D</div>
              <div className="col-span-2 text-center">Ratio</div>
              <div className="col-span-2 text-center">HP</div>
            </div>

            {/* Player List */}
            <div className="space-y-1 max-h-[calc(100vh-160px)] overflow-y-auto">
              {sortedPlayers.map((player, index) => {
                const isCurrentPlayer = player.socketId === currentUserId;
                const kdRatio = getKDRatio(player.kills, player.deaths);

                return (
                  <div
                    key={player.socketId}
                    className={`grid grid-cols-12 gap-2 items-center p-2 rounded text-xs transition-colors ${isCurrentPlayer
                      ? 'bg-blue-500/20 border border-blue-500/30'
                      : 'bg-black/20 hover:bg-black/30'
                      }`}
                  >
                    {/* Rank */}
                    <div className="col-span-1">
                      <span className={`font-medium ${index === 0 ? 'text-yellow-400' :
                        index === 1 ? 'text-gray-300' :
                          index === 2 ? 'text-amber-600' :
                            'text-gray-500'
                        }`}>
                        {index + 1}
                      </span>
                    </div>

                    {/* Player Name & Status */}
                    <div className="col-span-5 flex items-center gap-2">
                      <div
                        className={`w-2 h-2 rounded-full ${getStatusColor(player)}`}
                        title={player.health <= 0 ? 'Dead' : `Health: ${player.health}%`}
                      />
                      <span className={`truncate font-medium ${isCurrentPlayer ? 'text-blue-300' : 'text-gray-300'
                        }`}>
                        {player.username}
                      </span>
                      {isCurrentPlayer && (
                        <span className="text-[10px] bg-blue-500/30 text-blue-300 px-1 py-0.5 rounded">
                          YOU
                        </span>
                      )}
                      {player.health <= 0 && (
                        <span className="text-[10px] bg-red-500/30 text-red-300 px-1 py-0.5 rounded">
                          DEAD
                        </span>
                      )}
                    </div>

                    {/* Kills/Deaths */}
                    <div className="col-span-2 text-center">
                      <span className="text-green-400 font-medium">{player.kills}</span>
                      <span className="text-gray-500">/</span>
                      <span className="text-red-400 font-medium">{player.deaths}</span>
                    </div>

                    {/* K/D Ratio */}
                    <div className="col-span-2 text-center">
                      <span className={`font-medium ${parseFloat(kdRatio) >= 2.0 ? 'text-green-400' :
                        parseFloat(kdRatio) >= 1.0 ? 'text-yellow-400' :
                          'text-gray-400'
                        }`}>
                        {kdRatio}
                      </span>
                    </div>

                    {/* Health */}
                    <div className="col-span-2">
                      {player.health <= 0 ? (
                        <span className="text-red-400 text-center block">—</span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <div className="flex-1 bg-black/40 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full transition-all ${player.health > 75 ? 'bg-green-400' :
                                player.health > 50 ? 'bg-yellow-400' :
                                  player.health > 25 ? 'bg-orange-400' :
                                    'bg-red-400'
                                }`}
                              style={{ width: `${Math.max(0, player.health)}%` }}
                            />
                          </div>
                          <span className={`text-[10px] font-medium tabular-nums ${player.health > 50 ? 'text-gray-300' : 'text-red-300'
                            }`}>
                            {player.health}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer Stats */}
            <div className="mt-4 pt-3 border-t border-white/10 text-xs text-gray-500">
              <div className="flex justify-between">
                <span>Alive: {players.filter(p => p.health > 0).length}</span>
                <span>Dead: {players.filter(p => p.health <= 0).length}</span>
              </div>
              <div className="mt-1">
                <span>Total Kills: {players.reduce((sum, p) => sum + p.kills, 0)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Scoreboard;