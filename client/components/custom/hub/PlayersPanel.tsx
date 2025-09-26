import { Users, Globe } from 'lucide-react'
import { useState } from 'react'

export function PlayersPanel() {
  const [activeTab, setActiveTab] = useState<'friends' | 'global'>('friends')
  
  // Mock data - replace with your actual data
  const friends = [
    { id: 1, name: "Alex Chen", score: 2850, status: "online" },
    { id: 2, name: "Maya Singh", score: 2720, status: "offline" },
    { id: 3, name: "Jordan Kim", score: 2680, status: "online" },
    { id: 4, name: "Sam Rivera", score: 2540, status: "away" },
    { id: 5, name: "Riley Park", score: 2480, status: "online" },
    { id: 6, name: "Casey Lee", score: 2420, status: "offline" },
    { id: 7, name: "Taylor Swift", score: 2380, status: "online" },
    { id: 8, name: "Morgan Free", score: 2340, status: "away" },
  ]

  const globalPlayers = [
    { id: 1, name: "ProGamer_99", score: 3450, rank: 1 },
    { id: 2, name: "ShadowStrike", score: 3380, rank: 2 },
    { id: 3, name: "NeonBlade", score: 3290, rank: 3 },
    { id: 4, name: "CyberWarrior", score: 3240, rank: 4 },
    { id: 5, name: "QuantumAce", score: 3180, rank: 5 },
    { id: 6, name: "EliteSniper", score: 3120, rank: 6 },
    { id: 7, name: "VoidHunter", score: 3080, rank: 7 },
    { id: 8, name: "StormBreaker", score: 3020, rank: 8 },
    { id: 9, name: "NightRaven", score: 2980, rank: 9 },
    { id: 10, name: "FirePhoenix", score: 2940, rank: 10 },
  ]

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-500'
      case 'away': return 'bg-yellow-500'
      case 'offline': return 'bg-gray-500'
      default: return 'bg-gray-500'
    }
  }

  const onlineFriends = friends.filter(f => f.status === 'online').length

  return (
    <div>
      {/* Tab Buttons */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-white/90 text-sm">View</span>
          <span className="text-primary text-sm">
            {activeTab === 'friends' ? `${onlineFriends} online` : `Top ${globalPlayers.length}`}
          </span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('friends')}
            className={`flex-1 py-2 px-3 text-xs rounded transition-colors flex items-center justify-center space-x-1 ${
              activeTab === 'friends'
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'bg-white/5 text-white/70 border border-white/10 hover:bg-white/10'
            }`}
          >
            <Users className="w-3 h-3" />
            <span>Friends</span>
          </button>
          <button
            onClick={() => setActiveTab('global')}
            className={`flex-1 py-2 px-3 text-xs rounded transition-colors flex items-center justify-center space-x-1 ${
              activeTab === 'global'
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'bg-white/5 text-white/70 border border-white/10 hover:bg-white/10'
            }`}
          >
            <Globe className="w-3 h-3" />
            <span>Global</span>
          </button>
        </div>
      </div>

      {/* Fixed Height Players List Container */}
      <div className="h-80 overflow-y-auto custom-scrollbar">
        <div className="space-y-2 pr-2">
          {activeTab === 'friends' ? (
            // Friends List
            friends.map((friend) => (
              <div 
                key={friend.id}
                className="flex items-center justify-between py-2 px-3 bg-white/5 rounded border border-white/10 hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-2 h-2 rounded-full ${getStatusColor(friend.status)}`} />
                  <span className="text-white/90 text-sm">{friend.name}</span>
                </div>
                <span className="text-primary text-sm font-mono">{friend.score.toLocaleString()}</span>
              </div>
            ))
          ) : (
            // Global Players List
            globalPlayers.map((player) => (
              <div 
                key={player.id}
                className="flex items-center justify-between py-2 px-3 bg-white/5 rounded border border-white/10 hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-6 h-6 flex items-center justify-center bg-primary/20 text-primary rounded text-xs font-bold">
                    #{player.rank}
                  </div>
                  <span className="text-white/90 text-sm">{player.name}</span>
                </div>
                <span className="text-primary text-sm font-mono">{player.score.toLocaleString()}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
