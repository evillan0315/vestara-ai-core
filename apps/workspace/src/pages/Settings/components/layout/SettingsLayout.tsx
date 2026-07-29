/**
 * Settings Layout — Vertical layout with tabs on top, content below.
 *
 * Architecture Traceability:
 *   Settings Framework: 02-Architecture.md → System Architecture
 *   Natural Law: Identity precedes responsibility
 */

import type { ReactNode } from 'react';
import type { SettingsModule } from '@vestara/settings-framework';
import SettingsTabs from './SettingsTabs.js';

interface SettingsLayoutProps {
  children: ReactNode;
  modules: SettingsModule[];
}

export default function SettingsLayout({ children, modules }: SettingsLayoutProps) {
  return (
    <div className="flex flex-col h-full bg-[var(--vestara-bg)]">
      <SettingsTabs modules={modules} />
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
}
