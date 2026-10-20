/**
 * VES-UI-001 T2: System Menu
 *
 * Dropdown session menu promoted from the v2 prototype
 * (`assets/templates/html/v2/start/workspace-ui-v2/src/components/SystemMenu.tsx`).
 * User card + Lockscreen / Switch User / Settings / Logout / Shutdown,
 * with outside-click + Escape dismissal and focus return to the trigger.
 *
 * Sanitized on promotion (plan G11): no version strings in the footer.
 * Visual roles bind to the scoped `--ds-*` layer
 * (`desktop-shell.tokens.css`), never hex literals.
 *
 * Architecture Traceability:
 *   VES-UI-001: Workspace UI v2 Desktop Shell (T2 SystemMenu)
 *   @see docs/plans/VES-UI-001-workspace-ui-v2-desktop-shell-plan.md §4
 */

import { useEffect, useRef } from 'react';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import PowerSettingsNewOutlinedIcon from '@mui/icons-material/PowerSettingsNewOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import type { DesktopShellUser } from './desktop-shell.fixtures';
import { desktopShellUserFixture, desktopShellWorkspaceFixture } from './desktop-shell.fixtures';
import './desktop-shell.tokens.css';

export type SystemMenuActionId = 'lockscreen' | 'switch' | 'settings' | 'logout' | 'shutdown';

export interface SystemMenuProps {
  /** Operator identity — defaults to the placeholder fixture; production resolves the actor from `useAuth` (T2.2). */
  readonly user?: DesktopShellUser;
  readonly onAction: (action: SystemMenuActionId) => void;
  readonly onClose: () => void;
}

interface SystemMenuEntry {
  readonly id: SystemMenuActionId;
  readonly label: string;
  readonly Icon: typeof LockOutlinedIcon;
  readonly danger?: boolean;
}

const SYSTEM_MENU_ENTRIES: readonly SystemMenuEntry[] = [
  { id: 'lockscreen', label: 'Lockscreen', Icon: LockOutlinedIcon },
  { id: 'switch', label: 'Switch User', Icon: PeopleOutlinedIcon },
  { id: 'settings', label: 'Settings', Icon: SettingsOutlinedIcon },
];

const SYSTEM_MENU_SESSION_ENTRIES: readonly SystemMenuEntry[] = [
  { id: 'logout', label: 'Logout', Icon: LogoutOutlinedIcon },
  { id: 'shutdown', label: 'Shutdown', Icon: PowerSettingsNewOutlinedIcon, danger: true },
];

function SystemMenuButton({
  entry,
  autoFocusRef,
  onAction,
}: {
  entry: SystemMenuEntry;
  autoFocusRef?: React.RefObject<HTMLButtonElement | null>;
  onAction: (action: SystemMenuActionId) => void;
}) {
  const { id, label, Icon, danger } = entry;
  return (
    <button
      key={id}
      ref={autoFocusRef}
      type="button"
      role="menuitem"
      onClick={() => onAction(id)}
      className={`flex h-8 w-full items-center gap-[var(--vestara-spacing-2)] rounded-[var(--vestara-radius-md)] px-[var(--vestara-spacing-2)] text-left text-[length:var(--vestara-font-size-xs)] transition ${
        danger
          ? 'text-[var(--ds-error)] hover:bg-[var(--ds-error-bg)]'
          : 'text-[var(--ds-text-secondary)] hover:bg-[var(--ds-surface-raised)] hover:text-[var(--ds-text)]'
      }`}
    >
      <Icon fontSize="small" aria-hidden="true" />
      {label}
    </button>
  );
}

export function SystemMenu({ user = desktopShellUserFixture, onAction, onClose }: SystemMenuProps) {
  const firstItemRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    firstItemRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <>
      <button
        type="button"
        aria-label="Close system menu"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-transparent"
      />
      <div
        role="menu"
        aria-label="System menu"
        className="absolute top-[var(--ds-topbar-height)] right-[var(--vestara-spacing-3)] z-50 w-[220px] overflow-hidden rounded-[var(--vestara-radius-lg)] border border-[var(--ds-border)] bg-[var(--ds-surface-panel)] p-[var(--vestara-spacing-1)] shadow-[var(--ds-window-shadow)]"
      >
        <div className="flex items-center gap-[var(--vestara-spacing-2)] px-[var(--vestara-spacing-2)] py-[var(--vestara-spacing-2)]">
          <div
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-[var(--vestara-radius-full)] bg-[var(--ds-accent)] text-[length:var(--vestara-font-size-xs)] font-bold text-[var(--vestara-on-accent)]"
          >
            {user.initials}
          </div>
          <div>
            <div className="text-[length:var(--vestara-font-size-xs)] font-medium text-[var(--ds-text)]">
              {user.displayName}
            </div>
            <div className="flex items-center gap-1 text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-muted)]">
              <span aria-hidden="true" className="h-1 w-1 animate-pulse rounded-full bg-[var(--ds-success)]" />
              Online
            </div>
          </div>
        </div>
        <div aria-hidden="true" className="my-1 h-px bg-[var(--ds-border)]" />
        {SYSTEM_MENU_ENTRIES.map((entry, index) => (
          <SystemMenuButton
            key={entry.id}
            entry={entry}
            autoFocusRef={index === 0 ? firstItemRef : undefined}
            onAction={onAction}
          />
        ))}
        <div aria-hidden="true" className="my-1 h-px bg-[var(--ds-border)]" />
        {SYSTEM_MENU_SESSION_ENTRIES.map((entry) => (
          <SystemMenuButton key={entry.id} entry={entry} onAction={onAction} />
        ))}
        <div className="mt-[var(--vestara-spacing-2)] rounded-[var(--vestara-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-bg)] px-[var(--vestara-spacing-2)] py-[var(--vestara-spacing-1)]">
          <div className="font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-muted)]">
            VESTARA SHELL OS
          </div>
          <div className="font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-muted)]">
            {desktopShellWorkspaceFixture}
          </div>
        </div>
      </div>
    </>
  );
}
