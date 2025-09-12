import React, { RefObject } from 'react';
import { Users, X } from 'lucide-react';
import { Vector3 } from 'three';

export interface Player {
  socketId: string;
  userId: string;
  room: string;
  username: string;
  position: Vector3;
  velocity: Vector3;
  health: number;
  isDead: boolean;
  kills: number;
  deaths: number;
  cameraDirection: Vector3;
}

interface ScoreboardProps {
  players: Player[];
  currentUserId: string | null;
  isVisible: boolean;
  onToggle: () => void;
  onClose: () => void;
}

const Scoreboard: React.FC<ScoreboardProps> = ({
  players,
  currentUserId,
  isVisible,
  onToggle,
  onClose,
}) => {

  const handleToggle = () => {
    onToggle();
  };

  const handleClose = () => {
    onClose();
  };

  // Sort players by kills (descending), then by deaths (ascending)
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
    if (player.isDead) return 'bg-red-400';
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
                const isCurrentPlayer = player.userId === currentUserId;
                const kdRatio = getKDRatio(player.kills, player.deaths);

                return (
                  <div
                    key={player.socketId}
                    className={`grid grid-cols-12 gap-2 items-center p-2 rounded text-xs transition-colors ${
                      isCurrentPlayer 
                        ? 'bg-blue-500/20 border border-blue-500/30' 
                        : 'bg-black/20 hover:bg-black/30'
                    }`}
                  >
                    {/* Rank */}
                    <div className="col-span-1">
                      <span className={`font-medium ${
                        index === 0 ? 'text-yellow-400' :
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
                        title={player.isDead ? 'Dead' : `Health: ${player.health}%`}
                      />
                      <span className={`truncate font-medium ${
                        isCurrentPlayer ? 'text-blue-300' : 'text-gray-300'
                      }`}>
                        {player.username}
                      </span>
                      {isCurrentPlayer && (
                        <span className="text-[10px] bg-blue-500/30 text-blue-300 px-1 py-0.5 rounded">
                          YOU
                        </span>
                      )}
                      {player.isDead && (
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
                      <span className={`font-medium ${
                        parseFloat(kdRatio) >= 2.0 ? 'text-green-400' :
                        parseFloat(kdRatio) >= 1.0 ? 'text-yellow-400' :
                        'text-gray-400'
                      }`}>
                        {kdRatio}
                      </span>
                    </div>

                    {/* Health */}
                    <div className="col-span-2">
                      {player.isDead ? (
                        <span className="text-red-400 text-center block">—</span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <div className="flex-1 bg-black/40 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full transition-all ${
                                player.health > 75 ? 'bg-green-400' :
                                player.health > 50 ? 'bg-yellow-400' :
                                player.health > 25 ? 'bg-orange-400' :
                                'bg-red-400'
                              }`}
                              style={{ width: `${Math.max(0, player.health)}%` }}
                            />
                          </div>
                          <span className={`text-[10px] font-medium tabular-nums ${
                            player.health > 50 ? 'text-gray-300' : 'text-red-300'
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
                <span>Alive: {players.filter(p => !p.isDead).length}</span>
                <span>Dead: {players.filter(p => p.isDead).length}</span>
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