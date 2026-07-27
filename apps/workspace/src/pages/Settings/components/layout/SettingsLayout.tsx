/**
 * Settings Layout — The main layout for the Settings page.
 *
 * Architecture Traceability:
 *   Settings Framework: 02-Architecture.md → System Architecture
 *   Natural Law: Identity precedes responsibility
 */

import type { ReactNode } from 'react';

interface SettingsLayoutProps {
  children: ReactNode;
}

export default function SettingsLayout({ children }: SettingsLayoutProps) {
  return <div className="flex h-full bg-[var(--bg-primary)]">{children}</div>;
}
