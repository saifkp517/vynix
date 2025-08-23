import { useState } from 'react'

export function SettingsPanel() {
  const [dpr, setDpr] = useState(1.0)
  const [imageRendering, setImageRendering] = useState<'auto' | 'pixelated'>('auto')

  return (
    <div>
      {/* Settings */}
      <div className="space-y-4">
        {/* Device Pixel Ratio */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-white/90 text-sm">Pixel Density</span>
            <span className="text-primary text-sm font-mono">{dpr.toFixed(1)}x</span>
          </div>
          <input
            type="range"
            min="0.3"
            max="2"
            step="0.1"
            value={dpr}
            onChange={(e) => setDpr(parseFloat(e.target.value))}
            className="w-full h-2 bg-white/10 rounded-full appearance-none cursor-pointer accent-primary"
          />
        </div>

        {/* Image Rendering */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-white/90 text-sm">Image Rendering</span>
            <span className="text-primary text-sm">{imageRendering}</span>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setImageRendering('auto')}
              className={`flex-1 py-2 px-3 text-xs rounded transition-colors ${
                imageRendering === 'auto'
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'bg-white/5 text-white/70 border border-white/10 hover:bg-white/10'
              }`}
            >
              Auto
            </button>
            <button
              onClick={() => setImageRendering('pixelated')}
              className={`flex-1 py-2 px-3 text-xs rounded transition-colors ${
                imageRendering === 'pixelated'
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'bg-white/5 text-white/70 border border-white/10 hover:bg-white/10'
              }`}
            >
              Pixelated
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
