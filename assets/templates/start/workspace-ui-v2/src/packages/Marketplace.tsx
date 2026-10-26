export function MarketplacePkg() {
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] tracking-[0.12em] text-[#5a7a78]">MARKETPLACE • CAPABILITIES</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#2de8c3]/10 border border-[#2de8c3]/20 text-[#2de8c3]">
          112 FINAL
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {['ExtractorCard', 'MarketplaceHeader', 'CapabilityCard', 'TrendingRow', 'SearchInput', 'AuthShell'].map(
          (n) => (
            <div
              key={n}
              className="rounded-[10px] bg-[#111e20] border border-[#1a3a3d] p-3 hover:border-[#2de8c3]/20 transition"
            >
              <div className="text-[11px] font-medium text-[#c8ddd9]">{n}</div>
              <div className="text-[10px] text-[#5a7a78] mt-1">Re-themed • border #1a3a3d • surface #0d191b</div>
              <div className="mt-2 h-1 rounded-full bg-[#0a1214] overflow-hidden">
                <div className="h-full w-[78%] bg-[#2de8c3]/60" />
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
