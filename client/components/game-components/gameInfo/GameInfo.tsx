import React, { RefObject, useEffect, useState, useRef } from 'react';
import { Heart, Target, Users, MessageCircle, X, Skull } from 'lucide-react';
import socket from '@/lib/socket';
import { Stats } from '@react-three/drei';

interface GameInfoProps {
  roomId: string | null;
  userid: string | null;
  team: string | null;
  grenadeCoolDownRef: RefObject<boolean>;
  ammoRef: RefObject<number>;
  bulletsAvailable: number;
  explosionTimeout: number | null;
  health: number;
  kills: number;
  pingRef: RefObject<number>;
  isPlayerDead?: RefObject<boolean>;
}

interface Player {
  id: string;
  name: string;
  kills: number;
  deaths: number;
  health: number;
  team: string;
  isAlive: boolean;
}

interface ChatMessage {
  id: string;
  playerName: string;
  message: string;
  timestamp: Date;
}

const GameInfo: React.FC<GameInfoProps> = React.memo(
  ({ roomId, userid, team, ammoRef, bulletsAvailable, health, kills, pingRef, isPlayerDead }) => {
    const [pingInfo, setPingInfo] = useState(0);
    const [showPlayerList, setShowPlayerList] = useState(false);
    const [showChat, setShowChat] = useState(false);
    const [chatMessage, setChatMessage] = useState('');
    const chatInputRef = useRef<HTMLInputElement>(null);

    // Mock data - replace with real data from your socket
    const [players] = useState<Player[]>([
      { id: '1', name: 'Player1', kills: 12, deaths: 3, health: 85, team: 'red', isAlive: true },
      { id: '2', name: 'Player2', kills: 8, deaths: 5, health: 0, team: 'blue', isAlive: false },
      { id: '3', name: 'Player3', kills: 15, deaths: 2, health: 100, team: 'red', isAlive: true },
      { id: '4', name: 'Player4', kills: 6, deaths: 7, health: 45, team: 'blue', isAlive: true },
    ]);

    const chatMessages = useRef<ChatMessage[]>([]);

    useEffect(() => {
      const handleReceiveMessage = ({ userId, message }: { userId: string, message: string }) => {
        chatMessages.current.push({
          id: `${userId}-${Date.now()}`,
          playerName: userId, // Replace with actual player name if available
          message,
          timestamp: new Date(),
        });
      };

      socket.on("recieveMessage", handleReceiveMessage);

      return () => {
        socket.off('recieveMessage', handleReceiveMessage);
      };
    }, [socket]);

useEffect(() => {
  const interval = setInterval(() => {
    setPingInfo(pingRef.current || 0);
  }, 1000); // Update every 1 second (adjust as needed)

  return () => clearInterval(interval);
}, []);

    // Helper function to temporarily exit pointer lock
    const exitPointerLock = () => {
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
    };

    // Helper function to request pointer lock back
    const requestPointerLock = () => {
      if (!showChat && !showPlayerList && document.body) {
        document.body.requestPointerLock();
      }
    };
    const handleSendMessage = () => {
      console.log('Sending message:', chatMessage);
      if (chatMessage.trim()) {
        console.log(roomId, userid, chatMessage.trim());
        socket.emit("sendMessage", { roomId, userId: userid, message: chatMessage.trim() });
        setChatMessage('');
        setShowChat(false);
        // Re-enable pointer lock after sending message
        setTimeout(requestPointerLock, 100);
      }
    };

    useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key.toLowerCase() === 'c' && !showChat) {
          event.preventDefault();
          event.stopPropagation();
          exitPointerLock(); // Exit pointer lock before opening chat
          setShowChat(true);
          setChatMessage('');
          setTimeout(() => {
            chatInputRef.current?.focus();
          }, 100); // Small delay to ensure pointer lock is exited
        }
        // Handle escape key
        else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          if (showChat) {
            setShowChat(false);
            setChatMessage('');
            setTimeout(requestPointerLock, 100); // Re-enable pointer lock after closing chat
          } else if (showPlayerList) {
            setShowPlayerList(false);
            setTimeout(requestPointerLock, 100);
          }
        }
        // Handle tab key for player list
        else if (event.key === 'Tab') {
          event.preventDefault();
          event.stopPropagation();
          if (!showPlayerList) {
            exitPointerLock();
          }
          setShowPlayerList((prev) => {
            const newValue = !prev;
            if (!newValue) {
              setTimeout(requestPointerLock, 100);
            }
            return newValue;
          });
        }
        // Handle Enter key when chat is open
        else if (event.key === 'Enter' && showChat) {
          event.preventDefault();
          event.stopPropagation();
          console.log('Enter pressed globally, sending message:', chatMessage);
          handleSendMessage();
          return; // Early return to prevent further processing
        }

        // When chat is open, prevent ALL other game controls (except Enter which we handled above)
        if (showChat || showPlayerList) {
          event.stopPropagation();
        }
      };

      // Use capture phase to intercept events before pointer lock controls
      document.addEventListener('keydown', handleKeyDown, { capture: true });

      return () => {
        document.removeEventListener('keydown', handleKeyDown, { capture: true });
      };
    }, [showChat, showPlayerList, chatMessage, handleSendMessage]);



    const handleChatClose = () => {
      setShowChat(false);
      setChatMessage('');
      setTimeout(requestPointerLock, 100);
    };

    const getPingColor = (ping: number) => {
      if (ping < 50) return 'text-emerald-400';
      if (ping < 100) return 'text-yellow-400';
      return 'text-red-400';
    };

    const getPingBars = (ping: number) => {
      const bars = [];
      const levels = [25, 50, 75, 100];

      for (let i = 0; i < 4; i++) {
        const isActive = ping > levels[i];
        const height = `h-${i + 2}`;
        const color = ping < 50 ? 'bg-emerald-400' : ping < 100 ? 'bg-yellow-400' : 'bg-red-400';

        bars.push(
          <div
            key={i}
            className={`w-0.5 ${height} rounded-full transition-colors ${isActive ? color : 'bg-gray-600'
              }`}
          />
        );
      }
      return bars;
    };

    return (
      <>
        <Stats />

        {/* Health Text - Top Left */}
        <div className="fixed top-14 left-2 z-30">
          <div className="flex items-center space-x-2 text-white/90">
            <Heart size={14} className="text-red-400" />
            <span className="text-sm font-medium tabular-nums">{health}</span>
          </div>
        </div>

        {/* Ammo - Bottom Right Corner */}
        <div className="fixed bottom-0 right-0 p-3 z-30">
          <div className="text-right text-white/90">
            <div className="flex items-center justify-end space-x-2 mb-1">
              <Target size={14} className="text-orange-400" />
              <span className="text-lg font-bold tabular-nums">{ammoRef.current}</span>
              <span className="text-sm text-white/60">/</span>
              <span className="text-sm text-white/60 tabular-nums">{bulletsAvailable}</span>
            </div>
          </div>
        </div>

        {/* Kills Counter - Top Center */}
        <div className="fixed top-2 left-1/2 transform -translate-x-1/2 z-30">
          <div className="flex items-center space-x-2 bg-black/30 backdrop-blur-sm rounded-full px-3 py-1">
            <Skull size={14} className="text-yellow-400" />
            <span className="text-sm font-medium text-white/90 tabular-nums">{kills}</span>
          </div>
        </div>

        {/* Network Status - Top Right */}
        <div className="fixed top-2 right-2 z-30">
          <div className="flex items-center space-x-2 bg-black/30 backdrop-blur-sm rounded-full px-3 py-1">
            <div className="flex items-end space-x-0.5">
              {getPingBars(pingInfo)}
            </div>
            <span className={`text-xs font-medium tabular-nums ${getPingColor(pingInfo)}`}>
              {pingInfo}
            </span>
          </div>
        </div>

        {/* Player List Toggle - Left Side */}
        <div className="fixed left-0 top-1/2 transform -translate-y-1/2 z-30">
          <button
            onClick={() => {
              if (!showPlayerList) {
                exitPointerLock();
              }
              setShowPlayerList(!showPlayerList);
              if (showPlayerList) {
                setTimeout(requestPointerLock, 100);
              }
            }}
            className="bg-black/30 backdrop-blur-sm p-2 rounded-r-lg border-r border-white/10 hover:bg-black/50 transition-colors"
          >
            <Users size={16} className="text-white/70" />
          </button>
        </div>

        {/* Chat Indicator - Bottom Right (above ammo) */}
        <div className="fixed bottom-16 right-2 z-30">
          <div className="text-xs text-white/40 text-center">
            <MessageCircle size={12} className="mx-auto mb-1" />
            <div>C</div>
          </div>
        </div>

        {/* Player List Panel */}
        {showPlayerList && (
          <div className="fixed left-0 top-0 h-full w-80 bg-black/80 backdrop-blur-xl border-r border-white/10 z-40">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-medium">Players ({players.length})</h3>
                <button
                  onClick={() => {
                    setShowPlayerList(false);
                    setTimeout(requestPointerLock, 100);
                  }}
                  className="text-white/50 hover:text-white/80 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-2">
                {players.map((player) => (
                  <div key={player.id} className="bg-white/5 rounded-lg p-3 border border-white/10">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <div className={`w-2 h-2 rounded-full ${player.isAlive ? 'bg-green-400' : 'bg-red-400'}`} />
                        <span className="text-white/90 font-medium">{player.name}</span>
                        {player.id === userid && (
                          <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">You</span>
                        )}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded ${player.team === 'red' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'
                        }`}>
                        {player.team}
                      </span>
                    </div>

                    <div className="flex justify-between text-xs text-white/60">
                      <span>K/D: {player.kills}/{player.deaths}</span>
                      <span>HP: {player.health}%</span>
                    </div>

                    {player.isAlive && player.health > 0 && (
                      <div className="mt-2 w-full bg-gray-700/60 rounded-full h-1">
                        <div
                          className="bg-green-400 h-1 rounded-full transition-all"
                          style={{ width: `${player.health}%` }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Minimalist Chat Panel */}
        {showChat && (
          <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 w-96 z-40">
            <div className="mb-2 space-y-1 max-h-32 overflow-y-auto">
              {chatMessages.current.slice(-4).map((msg) => (
                <div key={msg.id} className="bg-black/60 backdrop-blur-sm rounded px-2 py-1 text-xs">
                  <span className={`font-medium`}>
                    {msg.playerName}:
                  </span>
                  <span className="text-white/80 ml-1">{msg.message}</span>
                </div>
              ))}
            </div>

            <div className="bg-black/80 backdrop-blur-sm rounded-lg p-2 border border-white/20">
              <input
                ref={chatInputRef}
                type="text"
                value={chatMessage}
                onChange={(e) => {
                  setChatMessage(e.target.value);
                }}
                onKeyDown={(e) => {
                  console.log('Key pressed in input:', e.key);
                  // Don't use stopPropagation here as we want the event to bubble up
                  // but prevent default browser behavior for Enter
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    console.log('Enter pressed, sending message:', chatMessage);
                    handleSendMessage();
                  }
                }}
                onFocus={() => {
                  console.log('Input focused');
                  exitPointerLock(); // Ensure pointer lock is disabled when input is focused
                }}
                onBlur={() => console.log('Input blurred')}
                placeholder="Say something..."
                className="w-full bg-transparent text-white text-sm placeholder-white/50 focus:outline-none"
                autoFocus
              />
            </div>
          </div>
        )}

        {/* Death Screen */}
        {isPlayerDead?.current && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="text-center">
              <div className="w-16 h-16 border-4 borcder-red-500/30 border-t-red-500 rounded-full animate-spin mx-auto mb-6" />
              <h1 className="text-white text-3xl font-light mb-2">Eliminated</h1>
              <p className="text-white/60 text-sm">Respawning...</p>
            </div>
          </div>
        )}

        {/* Room Info - Subtle Bottom Left */}
        <div className="fixed bottom-2 left-2 z-30">
          <div className="text-xs text-white/40 space-y-0.5">
            <div>Room: {roomId || 'N/A'}</div>
            <div>ID: {userid || 'N/A'}</div>
          </div>
        </div>
      </>
    );
  }
);

export default GameInfo;