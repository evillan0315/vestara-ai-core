
import { LayoutDashboard, Activity, Store, FolderOpen, Terminal } from "lucide-react"
import type { WinType } from "../lib/types"

export function DesktopIcons({ onOpen }: { onOpen: (t: WinType) => void }) {
  const items = [
    { t: 'overview' as WinType, label: 'My Workspace', icon: LayoutDashboard },
    { t: 'activity' as WinType, label: 'Activity Room', icon: Activity },
    { t: 'marketplace' as WinType, label: 'Marketplace', icon: Store },
    { t: 'terminal' as WinType, label: 'Terminal', icon: Terminal },
    { t: 'files' as WinType, label: 'Files', icon: FolderOpen },
  ]
  return (
    <div className="absolute left-3 top-[48px] z-10 flex flex-col gap-3">
      {items.map(it => (
        <button key={it.label} onDoubleClick={() => onOpen(it.t)} className="group w-[72px] flex flex-col items-center gap-1.5">
          <div className="w-10 h-10 rounded-[10px] bg-[#111e20]/60 border border-[#1a3a3d]/50 group-hover:bg-[#132528] group-hover:border-[#2de8c3]/20 flex items-center justify-center backdrop-blur-sm transition">
            <it.icon size={16} className="text-[#8ab3ad] group-hover:text-[#c8ddd9]" />
          </div>
          <span className="text-[10px] text-[#8ab3ad] group-hover:text-[#c8ddd9] font-mono text-center leading-tight">{it.label}</span>
        </button>
      ))}
    </div>
  )
}
