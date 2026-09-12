/**
 * VES-OVERVIEW-001: Overview Route Entry
 *
 * Thin route wrapper — owns no UI. All composition lives in
 * features/overview/OverviewScreen (v2 dark-premium projection).
 *
 * Legacy workspace-understanding cards (Identity/Health/State/…) remain
 * under ./Overview/* for reuse but are no longer the /overview surface.
 */

import { OverviewScreen } from '../features/overview/OverviewScreen';

export default function Overview() {
  return <OverviewScreen />;
}
