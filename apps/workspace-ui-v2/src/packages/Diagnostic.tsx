import { createRng } from '../lib/random';
import { DIAGNOSTIC_BARS, DIAGNOSTIC_SEED, DIAGNOSTIC_TITLE } from './diagnostic.fixtures';

export function DiagnosticPkg() {
  const rng = createRng(DIAGNOSTIC_SEED);
  const heights = DIAGNOSTIC_BARS.map((_, i) => 20 + Math.sin(i / 4) * 30 + rng() * 40);
  return (
    <div className="p-4">
      <div className="text-[length:var(--vestara-font-size-label)] tracking-[0.12em] text-[var(--vestara-accent-shell)]">
        {DIAGNOSTIC_TITLE}
      </div>
      <div className="mt-3 h-[100px] flex items-end gap-[2px]">
        {DIAGNOSTIC_BARS.map((bar, i) => (
          <div
            key={bar.id}
            className="flex-1 rounded-t-[var(--vestara-radius-xs)] bg-[var(--vestara-accent-shell)]/40"
            style={{ height: `${heights[i]}%` }}
          />
        ))}
      </div>
    </div>
  );
}
