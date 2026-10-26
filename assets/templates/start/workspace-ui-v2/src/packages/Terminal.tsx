export function TerminalPkg() {
  return (
    <div className="p-4 font-mono text-[11px] leading-[1.6] bg-[#0a1214] min-h-full">
      <div className="text-[#5a7a78]">$ vestara build --final 112 --clean --teal-logo --small-header --system-menu</div>
      <div className="text-[#8ab3ad] mt-1">[1/6] Shell 7 — VestaraShell, TopBar 32px, SystemMenu ✓</div>
      <div className="text-[#8ab3ad]">[2/6] Logo Teal variant #2de8c3 bound to wallpaper giant planet ✓</div>
      <div className="text-[#8ab3ad]">[3/6] VestaraWindow draggable shell extracted ✓</div>
      <div className="text-[#8ab3ad]">[4/6] Boot → Login → Desktop flow ✓</div>
      <div className="text-[#8ab3ad]">[5/6] Dock 48px small clean • DesktopIcons ✓</div>
      <div className="text-[#8ab3ad]">
        [6/6] Packages wired: terminal, activity, marketplace, agent, diagnostic, overview, settings, files ✓
      </div>
      <div className="mt-3 text-[#2de8c3]">✔ Build succeeded — workspace-ui-v2 ready</div>
      <div className="mt-4 flex items-center gap-2">
        <span className="text-[#2de8c3]">➜</span>
        <span className="text-[#60a5fa]">vestara-platform</span>
        <span className="text-[#5a7a78]"> git:(main)</span>
        <span className="w-2 h-3 bg-[#c8ddd9] animate-pulse inline-block ml-1" />
      </div>
    </div>
  );
}
