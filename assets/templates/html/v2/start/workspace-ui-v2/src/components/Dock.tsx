
import { LayoutDashboard, Terminal, Store, FolderOpen, Settings, Activity, Box, Cpu } from "lucide-react"
import { VestaraLogoTeal } from "./VestaraLogoTeal"
import type { WinData, WinType } from "../lib/types"

const icons: Record<WinType, any> = {
  workspace: LayoutDashboard,
  overview: LayoutDashboard,
  terminal: Terminal,
  marketplace: Store,
  files: FolderOpen,
  settings: Settings,
  activity: Activity,
  agent: Box,
  diagnostic: Cpu,
}

export function Dock({ windows, onOpen, onRestore }: { windows: WinData[], onOpen: (t: WinType) => void, onRestore: (id: string) => void }) {
  const types: WinType[] = ["overview","terminal","activity","marketplace","agent","diagnostic","settings","files"]
  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 px-2 h-12 rounded-[12px] bg-[#111e20]/80 backdrop-blur-xl border border-[#1a3a3d] shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
      <div className="flex items-center gap-1">
        {types.map(t => {
          const Icon = icons[t]
          const isOpen = windows.some(w => w.type===t && !w.minimized)
          const hasMinimized = windows.some(w => w.type===t && w.minimized)
          return (
            <button key={t} onClick={() => {
              const minWin = windows.find(w => w.type===t && w.minimized)
              if (minWin) onRestore(minWin.id)
              else onOpen(t)
            }} className={`relative w-8 h-8 rounded-[8px] flex items-center justify-center border transition ${isOpen ? 'bg-[#132528] border-[#2de8c3]/20 text-[#2de8c3]' : 'bg-transparent border-transparent text-[#8ab3ad] hover:bg-[#111e20] hover:border-[#1a3a3d] hover:text-[#c8ddd9]'}`}>
              <Icon size={14} />
              {(isOpen || hasMinimized) && <span className={`absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${hasMinimized ? 'bg-[#facc15]' : 'bg-[#2de8c3]'}`} />}
            </button>
          )
        })}
      </div>
      <div className="w-px h-6 bg-[#1a3a3d] mx-1" />
      <div className="w-6 h-6 rounded-[6px] bg-[#0d191b] border border-[#1a3a3d] flex items-center justify-center">
        <VestaraLogoTeal size={14} />
      </div>
    </div>
  )
}
