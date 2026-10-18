
import { Lock, Users, Settings, LogOut, Power } from "lucide-react"

export function SystemMenu({ onAction, onClose }: { onAction: (a: string) => void, onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute top-[40px] right-3 w-[220px] rounded-[12px] bg-[#111e20] border border-[#1a3a3d] shadow-[0_20px_60px_rgba(0,0,0,0.6)] p-1.5 z-50 overflow-hidden">
        <div className="px-2.5 py-2.5 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-[#2de8c3] flex items-center justify-center text-[11px] font-bold text-[#0a1214]">E</div>
          <div>
            <div className="text-[11px] font-medium text-[#c8ddd9]">Eddie R Villanueva</div>
            <div className="text-[10px] text-[#5a7a78] flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-[#4ade80] animate-pulse"/>Online • 7 agents</div>
          </div>
        </div>
        <div className="h-px bg-[#1a3a3d] my-1" />
        {[
          { id: 'lockscreen', label: 'Lockscreen', icon: Lock },
          { id: 'switch', label: 'Switch User', icon: Users },
          { id: 'settings', label: 'Settings', icon: Settings },
        ].map(it => (
          <button key={it.id} onClick={() => onAction(it.id)} className="w-full h-8 rounded-[8px] px-2.5 flex items-center gap-2.5 text-[11px] text-[#8ab3ad] hover:bg-[#132528] hover:text-[#c8ddd9] transition text-left">
            <it.icon size={12} />{it.label}
          </button>
        ))}
        <div className="h-px bg-[#1a3a3d] my-1" />
        {[
          { id: 'logout', label: 'Logout', icon: LogOut },
          { id: 'shutdown', label: 'Shutdown', icon: Power, danger: true },
        ].map(it => (
          <button key={it.id} onClick={() => onAction(it.id)} className={`w-full h-8 rounded-[8px] px-2.5 flex items-center gap-2.5 text-[11px] transition text-left ${it.danger ? 'text-[#ff7a7a] hover:bg-[#ff5a5a]/10 hover:text-[#ff5a5a]' : 'text-[#8ab3ad] hover:bg-[#132528] hover:text-[#c8ddd9]'}`}>
            <it.icon size={12} />{it.label}
          </button>
        ))}
        <div className="mt-2 px-2.5 py-1.5 rounded-[8px] bg-[#0d191b] border border-[#1a3a3d]/60">
          <div className="text-[9px] font-mono text-[#5a7a78]">VESTARA SHELL OS • 112 FINAL</div>
          <div className="text-[9px] font-mono text-[#4a6a68]">192.168.8.1 • 128ms • OpenCode Online</div>
        </div>
      </div>
    </>
  )
}
