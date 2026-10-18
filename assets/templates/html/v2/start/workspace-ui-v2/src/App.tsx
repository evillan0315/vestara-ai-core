
import React, { useEffect, useState } from "react"
import { BootScreen } from "./components/BootScreen"
import { LoginScreen } from "./components/LoginScreen"
import { TopBar } from "./components/TopBar"
import { SystemMenu } from "./components/SystemMenu"
import { VestaraWindow } from "./components/VestaraWindow"
import { Dock } from "./components/Dock"
import { DesktopIcons } from "./components/DesktopIcons"
import { TerminalPkg } from "./packages/Terminal"
import { ActivityRoomPkg } from "./packages/ActivityRoom"
import { MarketplacePkg } from "./packages/Marketplace"
import { OverviewPkg } from "./packages/Overview"
import { SettingsPkg } from "./packages/Settings"
import { AgentPkg } from "./packages/AgentWorkforce"
import { DiagnosticPkg } from "./packages/Diagnostic"
import type { Phase, LoginMode, WinData, WinType } from "./lib/types"

export default function App(){
  const [phase, setPhase] = useState<Phase>("boot")
  const [loginMode, setLoginMode] = useState<LoginMode>("default")
  const [showMenu, setShowMenu] = useState(false)
  const [now, setNow] = useState(new Date())
  const [zCounter, setZCounter] = useState(10)

  const [wins, setWins] = useState<WinData[]>([
    { id: 'win-overview', title: 'Overview', subtitle: 'Good afternoon Director', x: 120, y: 60, w: 560, h: 380, z: 1, minimized: false, maximized: false, type: 'overview' },
    { id: 'win-terminal', title: 'Terminal', subtitle: 'zsh • vestara-platform', x: 160, y: 120, w: 640, h: 360, z: 2, minimized: false, maximized: false, type: 'terminal' },
    { id: 'win-activity', title: 'Activity Room', subtitle: 'Live Operations • 50 records', x: 200, y: 80, w: 720, h: 480, z: 3, minimized: false, maximized: false, type: 'activity' },
    { id: 'win-market', title: 'Marketplace', subtitle: 'Capabilities • 112 FINAL', x: 100, y: 200, w: 520, h: 340, z: 4, minimized: true, maximized: false, type: 'marketplace' },
  ])

  useEffect(()=>{ const i=setInterval(()=>setNow(new Date()),1000); return ()=>clearInterval(i)},[])

  const timeStr = now.toLocaleTimeString('en-GB',{hour12:false})
  const dateStr = now.toLocaleDateString('en-US',{month:'short', day:'2-digit'}).toUpperCase()

  const bringFront = (id: string) => {
    setZCounter(z=>z+1)
    setWins(ws => ws.map(w => w.id===id ? {...w, z: zCounter+1} : w))
  }

  const updateWin = (id: string, patch: Partial<WinData>) => setWins(ws => ws.map(w => w.id===id ? {...w, ...patch} : w))

  const openType = (t: WinType) => {
    const existing = wins.find(w => w.type===t)
    if (existing) {
      if (existing.minimized) updateWin(existing.id, { minimized: false })
      bringFront(existing.id)
      return
    }
    const id = `win-${t}-${Date.now()}`
    const titles: Record<WinType,string> = { overview:'Overview', terminal:'Terminal', activity:'Activity Room', marketplace:'Marketplace', files:'Files', settings:'Settings', agent:'Agent Workforce', diagnostic:'Diagnostic Center', workspace:'Workspace' }
    setZCounter(z=>z+1)
    setWins(w=>[...w, { id, title: titles[t], subtitle: `${t} • wired registry`, x: 120+Math.random()*120, y: 60+Math.random()*120, w: 640, h: 400, z: zCounter+1, minimized: false, maximized: false, type: t }])
  }

  const closeWin = (id: string) => setWins(ws => ws.filter(w=>w.id!==id))
  const minimizeWin = (id: string) => updateWin(id, { minimized: true })

  const handleSystemAction = (a: string) => {
    setShowMenu(false)
    if (a==='lockscreen'){ setLoginMode('locked'); setPhase('login') }
    if (a==='logout'){ setLoginMode('default'); setPhase('login') }
    if (a==='switch'){ setLoginMode('switch'); setPhase('login') }
    if (a==='shutdown'){ setPhase('shutdown') }
    if (a==='settings'){ openType('settings') }
  }

  const renderPkg = (type: WinType) => {
    switch(type){
      case 'terminal': return <TerminalPkg/>
      case 'activity': return <ActivityRoomPkg/>
      case 'marketplace': return <MarketplacePkg/>
      case 'overview': return <OverviewPkg/>
      case 'workspace': return <OverviewPkg/>
      case 'settings': return <SettingsPkg/>
      case 'agent': return <AgentPkg/>
      case 'diagnostic': return <DiagnosticPkg/>
      default: return <div className="p-4 text-[11px] text-[#5a7a78]">Package {type} wired</div>
    }
  }

  if (phase==='boot') return <BootScreen onDone={()=>setPhase('login')} />
  if (phase==='shutdown') return <BootScreen shutting onDone={()=>{ setLoginMode('default'); setPhase('login') }} />
  if (phase==='login') return <LoginScreen mode={loginMode} onLogin={()=>setPhase('desktop')} />

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#0a1214] relative select-none">
      <img src={new URL("./assets/wallpaper-teal-giant-planet-mountain-lake.png", import.meta.url).href} className="absolute inset-0 w-full h-full object-cover" alt="" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a1214]/30 via-[#0a1214]/10 to-[#0a1214]/60" />
      <div className="absolute inset-0 bg-[#0a1214]/20 backdrop-blur-[0.5px]" />

      <div className="relative z-10 w-full h-full flex flex-col">
        <TopBar onLogoClick={()=>setShowMenu(v=>!v)} onAvatarClick={()=>setShowMenu(v=>!v)} timeStr={timeStr} dateStr={dateStr} />
        {showMenu && <SystemMenu onAction={handleSystemAction} onClose={()=>setShowMenu(false)} />}

        <div className="flex-1 relative overflow-hidden">
          <DesktopIcons onOpen={openType} />
          {wins.map(w => (
            <VestaraWindow key={w.id} data={w} isFocused={w.z===Math.max(...wins.filter(x=>!x.minimized).map(x=>x.z),0)} onFocus={bringFront} onClose={closeWin} onMinimize={minimizeWin} onUpdate={updateWin}>
              {renderPkg(w.type)}
            </VestaraWindow>
          ))}
        </div>

        <Dock windows={wins} onOpen={openType} onRestore={id=>{ updateWin(id,{minimized:false}); bringFront(id) }} />

        <div className="absolute bottom-2 left-3 text-[9px] font-mono text-[#5a7a78]/60 pointer-events-none">Vestara Desktop • {wins.filter(w=>!w.minimized).length} windows • 7 agents • v112 FINAL • 32px header • teal logo</div>
      </div>
    </div>
  )
}
