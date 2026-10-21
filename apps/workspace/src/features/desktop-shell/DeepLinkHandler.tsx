/**
 * U3 — mounts the `teal://vestara-shell` deep-link subscription.
 *
 * Renders nothing. On mount it handles both Tauri delivery moments:
 * - cold-start: a launch link replaces the initial route (no history entry).
 * - running-app: links arriving while the shell is open push new entries.
 *
 * Must be rendered inside the router (it uses `useNavigate`).
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getColdStartRoute, subscribeDeepLinks } from './deep-link.js';

export function DeepLinkHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    getColdStartRoute().then((route) => {
      if (route && !cancelled) navigate(route, { replace: true });
    });
    subscribeDeepLinks((route) => {
      navigate(route);
    }).then((stop) => {
      unlisten = stop;
      if (cancelled) stop();
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [navigate]);

  return null;
}
