/**
 * VOS-STARTUP-001 P1: Startup Screen
 *
 * Fixture-first composition matching the reference regions: upper identity,
 * decorative navigation, centered brand lockup + readiness card, lower quote
 * and corner metadata. Runtime state (P2) will replace fixtures.
 */

import { BrandLockup } from './components/BrandLockup';
import { ReadinessCard } from './components/ReadinessCard';
import { StartupCanvas } from './components/StartupCanvas';
import { StartupFooter } from './components/StartupFooter';
import { useStartup } from './hooks/useStartup';
import type { StartupViewModel } from './startup.types';
import './startup.tokens.css';

function StartupChrome({ model }: { model: StartupViewModel }) {
  return (
    <StartupCanvas>
      <header className="flex items-start justify-between gap-[var(--vestara-spacing-section)]">
        <div>
          <p className="text-[length:var(--vestara-font-size-sm)] font-semibold tracking-[0.3em]">VESTARA OS</p>
          <p className="mt-[var(--vestara-spacing-element)] text-[length:var(--vestara-font-size-xs)] tracking-[0.25em] text-[var(--st-muted)]">
            HUMAN INTELLIGENCE. MULTIPLIED.
          </p>
        </div>
        <p className="hidden text-[length:var(--vestara-font-size-xs)] tracking-[0.2em] text-[var(--st-muted)] md:block">
          PEOPLE | AGENTS | WORKFLOWS | A MORE CAPABLE TOMORROW
        </p>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-[var(--vestara-spacing-section)] py-[var(--vestara-spacing-section)]">
        <BrandLockup />
        <ReadinessCard model={model} />
      </main>
      <footer>
        <StartupFooter model={model} />
      </footer>
    </StartupCanvas>
  );
}

export function StartupScreen() {
  const { data } = useStartup();
  return <StartupChrome model={data} />;
}
