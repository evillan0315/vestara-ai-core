/**
 * Settings Content — Content area for settings.
 */

import type { ReactNode } from 'react';

interface SettingsContentProps {
  children: ReactNode;
}

export default function SettingsContent({ children }: SettingsContentProps) {
  return <main className="flex-1 overflow-auto w-full">{children}</main>;
}
