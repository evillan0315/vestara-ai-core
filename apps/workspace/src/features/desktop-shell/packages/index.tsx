/**
 * VES-UI-001 T6: Package Content Dispatcher
 *
 * Maps a `WinType` onto its governed package page. All eight package pages
 * (T5 Overview / Activity / Agents / Marketplace + T6 Terminal / Settings /
 * Diagnostic / Files) render live data surfaces with fixture fallbacks;
 * only the `workspace` shell type renders a token-bound placeholder.
 *
 * Architecture Traceability:
 *   VES-UI-001: Workspace UI v2 Desktop Shell (T5+T6 Package pages + data)
 *   @see docs/plans/VES-UI-001-workspace-ui-v2-desktop-shell-plan.md §6
 */

import { desktopShellPackageTitles } from '../desktop-shell.fixtures';
import type { WinType } from '../types';
import { ActivityPackage } from './ActivityPackage';
import { AgentsPackage } from './AgentsPackage';
import { DiagnosticPackage } from './DiagnosticPackage';
import { FilesPackage } from './FilesPackage';
import { MarketplacePackage } from './MarketplacePackage';
import { OverviewPackage } from './OverviewPackage';
import { SettingsPackage } from './SettingsPackage';
import { TerminalPackage } from './TerminalPackage';
// Single scoped-token import for all package pages — individual package
// files must not re-import `desktop-shell.tokens.css`.
import '../desktop-shell.tokens.css';

export interface PackageContentProps {
  readonly type: WinType;
}

const WORKSPACE_PLACEHOLDER_COPY: Record<string, string> = {
  workspace: 'Workspace surface renders through the desktop shell.',
};

export function PackageContent({ type }: PackageContentProps) {
  switch (type) {
    case 'overview':
      return <OverviewPackage />;
    case 'activity':
      return <ActivityPackage />;
    case 'agent':
      return <AgentsPackage />;
    case 'marketplace':
      return <MarketplacePackage />;
    case 'terminal':
      return <TerminalPackage />;
    case 'settings':
      return <SettingsPackage />;
    case 'diagnostic':
      return <DiagnosticPackage />;
    case 'files':
      return <FilesPackage />;
    default:
      return (
        <div className="p-[var(--vestara-spacing-4)]">
          <div className="rounded-[var(--vestara-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-panel)] p-[var(--vestara-spacing-3)] text-[length:var(--vestara-font-size-sm)] text-[var(--ds-text-secondary)]">
            {desktopShellPackageTitles[type]} · {WORKSPACE_PLACEHOLDER_COPY[type] ?? 'Package wired.'}
          </div>
        </div>
      );
  }
}
