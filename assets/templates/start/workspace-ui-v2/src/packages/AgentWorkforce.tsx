export function AgentPkg() {
  return (
    <div className="p-4">
      <div className="text-[11px] tracking-[0.12em] text-[#5a7a78]">WORKFORCE • 7 ACTIVE</div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {['Assistant', 'Browser', 'Context', 'Orchestrator', 'Terminal', 'Indexer'].map((n) => (
          <div key={n} className="rounded-[10px] bg-[#111e20] border border-[#1a3a3d] p-3 text-[11px] text-[#c8ddd9]">
            {n}
          </div>
        ))}
      </div>
    </div>
  );
}
