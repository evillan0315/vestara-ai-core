/**
 * Marketplace in-process adapter for the Vestara TUI package.
 *
 * The TUI application itself runs as a standalone executable (spawned by the
 * parent CLI; see `src/index.tsx` — it never loads inside the Node API
 * runtime). The local Marketplace MVP only installs `in-process` extensions
 * whose runtime entrypoint exports a `VestaraExtension`, so this small adapter
 * is that host surface: it registers the terminal view contribution and
 * reports bundle health. It does not host or emulate the TUI in-process.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, 'vestara-package.json'), 'utf8'));

const VIEW_ID = 'vestara-terminal';

export const extension = {
  manifest: { id: manifest.id, version: manifest.version },
  async activate(context) {
    context.register('tuiViews', {
      id: VIEW_ID,
      entrypoint: 'dist/index.js',
      metadata: {
        label: 'Vestara Terminal',
        launch: 'standalone-executable',
        note: 'Launched via the CLI (`vestara tui`); the adapter only advertises the view, it does not render in-process.',
      },
    });
  },
  async healthCheck() {
    const runtime = join(here, 'dist', 'index.js');
    const present = existsSync(runtime);
    return {
      status: present ? 'healthy' : 'unhealthy',
      checkedAt: new Date().toISOString(),
      message: present
        ? 'Adapter active; the TUI runs as a standalone executable launched via the CLI, not in-process.'
        : 'TUI runtime bundle missing: dist/index.js was not staged with this package.',
    };
  },
};
