
export function ActivityRoomPkg(){
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-0 h-full min-h-[400px]">
      <div className="border-r border-[#1a3a3d] bg-[#0d191b] p-2 flex flex-col">
        <div className="text-[10px] tracking-[0.12em] text-[#5a7a78] px-2 py-2">ALL PARTICIPANTS • 25 TOTAL</div>
        <div className="space-y-1 flex-1">
          {['Assistant eddie Idle','Browser Active','Orchestrator Working','Indexer Idle','Runtime Active','Context Idle'].map(n=>(
            <div key={n} className="px-2 py-1.5 rounded-[8px] hover:bg-[#111e20] text-[11px] text-[#8ab3ad] flex justify-between"><span>{n}</span><span className="w-1.5 h-1.5 rounded-full bg-[#2de8c3] mt-1.5"/></div>
          ))}
        </div>
        <div className="p-2 rounded-[8px] bg-[#111e20] border border-[#1a3a3d] mt-2"><div className="text-[9px] text-[#5a7a78]">CodexServerStatus</div><div className="text-[9px] text-[#ff5a5a]">Unreachable • 0 SESSIONS</div><div className="text-[8px] font-mono text-[#5a7a78] mt-1">ws://127.0.0.1:4500/</div></div>
      </div>
      <div className="flex flex-col">
        <div className="h-9 border-b border-[#1a3a3d] px-3 flex items-center justify-between">
          <div className="flex items-center gap-2"><span className="text-[10px] tracking-[0.12em] text-[#2de8c3]">LIVE OPERATIONS</span><span className="text-[11px] font-medium text-[#c8ddd9]">Activity Room</span><span className="text-[9px] px-1.5 py-0.5 rounded bg-[#111e20] border border-[#1a3a3d] text-[#5a7a78]">50 records</span></div>
          <div className="flex gap-1"><span className="text-[9px] px-2 py-0.5 rounded-full bg-[#111e20] border border-[#1a3a3d] text-[#8ab3ad]">LIVE</span></div>
        </div>
        <div className="flex-1 p-3 space-y-2 overflow-auto">
          <div className="rounded-[8px] bg-[#ff5a5a]/5 border border-[#ff5a5a]/15 px-3 py-2 text-[11px] text-[#c8ddd9] flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#ff5a5a] animate-pulse"/>Activity snapshot incomplete • streaming</div>
          {[
            {a:'Orchestrator',m:'TaskNode Shell 7 completed',t:'now'},
            {a:'Assistant',m:'VestaraWindow drag shell extracted',t:'2m'},
            {a:'Indexer',m:'Teal logo bound to wallpaper',t:'5m'},
          ].map((it,i)=>(<div key={i} className="flex gap-2 p-2 rounded-[8px] hover:bg-[#111e20]/50"><div className="w-6 h-6 rounded-full bg-[#111e20] border border-[#1a3a3d] flex items-center justify-center text-[10px]">{it.a[0]}</div><div><div className="text-[11px] text-[#c8ddd9]">{it.a} • <span className="text-[#5a7a78]">{it.m}</span></div><div className="text-[10px] text-[#5a7a78]">{it.t} ago</div></div></div>))}
        </div>
      </div>
    </div>
  )
}
