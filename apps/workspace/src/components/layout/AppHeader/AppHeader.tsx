/**
 * VES-UI-001 T1.5: AppHeader is now the 32px DesktopTopBar.
 *
 * This module keeps the stable `AppHeader` import path (consumed by
 * `layouts/ShellLayout.tsx`) and delegates to `DesktopTopBar`. The legacy
 * 64px (`h-16`) chrome is retired; the cozy `HeaderSearch`/`HeaderUserMenu`
 * variants remain exported from their own modules for non-shell consumers.
 *
 * Architecture Traceability:
 *   VES-UI-001 Phase 1 (T1.5 global chrome swap: `h-16` → `h-8`)
 *   @see docs/plans/VES-UI-001-workspace-ui-v2-desktop-shell-plan.md §4
 */

import type { FC } from 'react';
import DesktopTopBar, { type DesktopTopBarProps } from './DesktopTopBar';

export type AppHeaderProps = DesktopTopBarProps;

const AppHeader: FC<AppHeaderProps> = (props) => <DesktopTopBar {...props} />;

export default AppHeader;
