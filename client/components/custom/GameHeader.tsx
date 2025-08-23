import { Trees, Settings, Users } from 'lucide-react'
import { useState } from 'react'
import { SettingsPanel } from './hub/SettingsPanel'
import { PlayersPanel } from './hub/PlayersPanel'

export function GameHeader() {
  const [activeSection, setActiveSection] = useState<'settings' | 'players'>('settings')

  return (
    <div className="w-full text-center z-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-5xl font-bold mb-2 text-primary">
          <Trees className="inline-block mr-2 h-8 w-8" /> Zentra
        </h1>
        <h2 className="text-2xl font-semibold">Epic Combat Arena</h2>
      </div>

      {/* Main Section Container */}
      <div className="mx-auto p-10">
        {/* Section Tab Buttons */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white/90 text-sm">Section</span>
            <span className="text-primary text-sm">
              {activeSection === 'settings' ? 'Graphics' : 'Social'}
            </span>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setActiveSection('settings')}
              className={`flex-1 py-2 px-3 text-xs rounded transition-colors flex items-center justify-center space-x-1 ${
                activeSection === 'settings'
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'bg-white/5 text-white/70 border border-white/10 hover:bg-white/10'
              }`}
            >
              <Settings className="w-3 h-3" />
              <span>Settings</span>
            </button>
            <button
              onClick={() => setActiveSection('players')}
              className={`flex-1 py-2 px-3 text-xs rounded transition-colors flex items-center justify-center space-x-1 ${
                activeSection === 'players'
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'bg-white/5 text-white/70 border border-white/10 hover:bg-white/10'
              }`}
            >
              <Users className="w-3 h-3" />
              <span>Players</span>
            </button>
          </div>
        </div>

        {/* Section Content */}
        <div>
          {activeSection === 'settings' ? (
            <SettingsPanel />
          ) : (
            <PlayersPanel />
          )}
        </div>
      </div>
    </div>
  )
}
