/**
 * VOS-STARTUP-001 P1: Startup Route Entry
 *
 * Thin route wrapper — owns no UI. All composition lives in
 * features/startup/StartupScreen.
 */

import { StartupScreen } from '../features/startup/StartupScreen';

export default function Startup() {
  return <StartupScreen />;
}
