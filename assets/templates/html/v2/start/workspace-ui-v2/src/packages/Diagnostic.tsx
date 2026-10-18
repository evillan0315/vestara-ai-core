
export function DiagnosticPkg(){
  return <div className="p-4"><div className="text-[11px] tracking-[0.12em] text-[#2de8c3]">LIVE TELEMETRY • Diagnostic Center</div><div className="mt-3 h-[100px] flex items-end gap-[2px]">{Array.from({length:32}).map((_,i)=><div key={i} className="flex-1 rounded-t-[2px] bg-[#2de8c3]/40" style={{height:`${20+Math.sin(i/4)*30+Math.random()*40}%`}}/>)}</div></div>
}
