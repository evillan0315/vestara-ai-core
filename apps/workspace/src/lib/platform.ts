/**
 * Platform abstraction for desktop-capability calls.
 *
 * The Workspace UI runs both in a browser and inside the Tauri desktop shell.
 * Tauri injects `window.__TAURI_INTERNALS__`; when present we use the native
 * plugins (more reliable than the WebView's restricted `navigator.clipboard`),
 * otherwise we fall back to the standard browser APIs. Calls are dynamically
 * imported so the Tauri plugin code is never loaded in the browser path.
 */

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function copyToClipboard(text: string): Promise<void> {
  if (isTauri()) {
    try {
      const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
      await writeText(text);
      return;
    } catch {
      /* fall through to browser API */
    }
  }
  await navigator.clipboard.writeText(text);
}
