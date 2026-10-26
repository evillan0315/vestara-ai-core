export function SettingsPkg() {
  return (
    <div className="p-4 grid grid-cols-1 lg:grid-cols-[180px_1fr] gap-4 h-full">
      <div className="space-y-1">
        {['Appearance', 'Shell & TopBar', 'Sidebar', 'Workspace', 'Network', 'Runtime', 'About'].map((c, i) => (
          <div
            key={c}
            className={`px-2.5 py-2 rounded-[8px] text-[11px] cursor-pointer ${i === 1 ? 'bg-[#2de8c3]/10 border border-[#2de8c3]/20 text-[#2de8c3]' : 'text-[#8ab3ad] hover:bg-[#111e20] border border-transparent'}`}
          >
            {c}
          </div>
        ))}
      </div>
      <div className="space-y-4">
        <div className="rounded-[10px] bg-[#111e20] border border-[#1a3a3d] p-3">
          <div className="text-[11px] tracking-[0.12em] text-[#5a7a78] mb-2">TOPBAR • 32PX SMALL CLEAN</div>
          <div className="flex gap-1.5 flex-wrap">
            <span className="text-[10px] px-2 py-1 rounded-full bg-[#0d191b] border border-[#1a3a3d] text-[#8ab3ad]">
              Height 32px
            </span>
            <span className="text-[10px] px-2 py-1 rounded-full bg-[#0d191b] border border-[#1a3a3d] text-[#8ab3ad]">
              Icons 12px
            </span>
            <span className="text-[10px] px-2 py-1 rounded-full bg-[#2de8c3]/10 border border-[#2de8c3]/20 text-[#2de8c3]">
              Clean hover #111e20
            </span>
          </div>
        </div>
        <div className="rounded-[10px] bg-[#111e20] border border-[#1a3a3d] p-3">
          <div className="text-[11px] tracking-[0.12em] text-[#5a7a78] mb-2">SYSTEM MENU</div>
          <div className="text-[11px] text-[#c8ddd9] space-y-1">
            <div>• Lockscreen → login locked</div>
            <div>• Switch User → login switch</div>
            <div>• Logout → login default</div>
            <div>• Shutdown → boot shutting down</div>
          </div>
        </div>
        <div className="rounded-[10px] bg-[#111e20] border border-[#1a3a3d] p-3">
          <div className="text-[11px] tracking-[0.12em] text-[#5a7a78] mb-1">TOKENS</div>
          <div className="text-[10px] font-mono text-[#8ab3ad]">
            bg #0a1214 surface #0d191b #111e20 #132528 border #1a3a3d accent #2de8c3
          </div>
        </div>
      </div>
    </div>
  );
}
