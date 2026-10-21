
export function OverviewPkg(){
  return (
    <div className="p-4 space-y-3">
      <div className="rounded-[12px] bg-[#0d191b] border border-[#1a3a3d] p-4">
        <div className="flex items-center gap-2"><span className="text-[10px] tracking-[0.2em] text-[#5a7a78]">WORKSPACE OVERVIEW</span><span className="text-[10px] px-1.5 py-0.5 rounded bg-[#4ade80]/10 border border-[#4ade80]/20 text-[#4ade80]">HEALTHY</span></div>
        <div className="mt-1 text-[28px] leading-[0.9] tracking-[-0.02em] text-[#c8ddd9]" style={{fontFamily:'Instrument Serif, serif'}}>Good afternoon, Director.</div>
        <div className="mt-1 text-[12px] text-[#8ab3ad]">Vestara Platform • 7 agents • 1 workflow • All systems nominal</div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[{k:'WORKSPACE',v:'vestara-platform'},{k:'HEALTH',v:'Healthy'},{k:'FOCUS',v:'25%'},{k:'AGENTS',v:'7/7'}].map(c=>(
          <div key={c.k} className="bg-[#111e20] border border-[#1a3a3d] rounded-[10px] px-3 py-2"><div className="text-[9px] tracking-[0.15em] text-[#5a7a78]">{c.k}</div><div className="text-[12px] font-medium text-[#c8ddd9]">{c.v}</div></div>
        ))}
      </div>
    </div>
  )
}
