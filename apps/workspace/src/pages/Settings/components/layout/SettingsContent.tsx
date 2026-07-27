/**
 * Settings Content — The content area for settings.
 *
 * Architecture Traceability:
 *   Settings Framework: 02-Architecture.md → System Architecture
 *   Natural Law: Identity precedes responsibility
 */

import type { ReactNode } from 'react';

interface SettingsContentProps {
  children: ReactNode;
}

export default function SettingsContent({ children }: SettingsContentProps) {
  return <main className="flex-1 overflow-auto p-6">{children}</main>;
}
