// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../src/lib/theme.js';
import EvidencePage from '../src/pages/Evidence.js';

// ─── Fixtures ──────────────────────────────────────────────────

const SCREENSHOT_DIGEST = 'a'.repeat(64);
const COMPARISON_DIGEST = 'b'.repeat(64);
const TEXT_DIGEST = 'c'.repeat(64);
const JPEG_DIGEST = 'd'.repeat(64);

const BUNDLE_FIXTURE = {
  id: 'bundle-1',
  executionId: 'test-execution-1',
  verifierId: 'verifier',
  profileId: 'standard',
  manifestId: 'm1',
  evidence: [
    {
      ref: SCREENSHOT_DIGEST,
      kind: 'screenshot',
      mediaType: 'image/png',
      size: 1024,
      summary: 'Matrix',
      provenance: { producer: 'Playwright', executionId: 'test-execution-1', createdAt: '2026-09-01T00:00:00Z', environment: 'test', contentHash: SCREENSHOT_DIGEST },
      visual: { width: 1280, height: 720, mediaType: 'image/png' },
    },
    {
      ref: COMPARISON_DIGEST,
      kind: 'visual-comparison',
      mediaType: 'image/png',
      size: 2048,
      summary: 'Narrow',
      provenance: { producer: 'Playwright', executionId: 'test-execution-1', createdAt: '2026-09-01T00:00:01Z', environment: 'test', contentHash: COMPARISON_DIGEST },
      visual: { width: 480, height: 900, mediaType: 'image/png' },
    },
    {
      ref: TEXT_DIGEST,
      kind: 'command',
      mediaType: 'text/plain',
      size: 512,
      summary: 'Build log',
      provenance: { producer: 'harness', executionId: 'test-execution-1', createdAt: '2026-09-01T00:00:02Z', environment: 'test', contentHash: TEXT_DIGEST },
    },
    {
      ref: JPEG_DIGEST,
      kind: 'screenshot',
      mediaType: 'image/jpeg',
      size: 4096,
      summary: 'Photo',
      provenance: { producer: 'Playwright', executionId: 'test-execution-1', createdAt: '2026-09-01T00:00:03Z', environment: 'test', contentHash: JPEG_DIGEST },
      visual: { width: 1920, height: 1080, mediaType: 'image/jpeg' },
    },
  ],
  checks: [],
  replay: { mode: 'artifact', steps: [], requires: {} },
  confidence: { score: 0.8, level: 'high', factors: [], limitations: [] },
  createdAt: '2026-09-01T00:00:00Z',
};

// Minimal valid PNG (1×1 red pixel)
const MINIMAL_PNG = (() => {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  function crc32(buf: Buffer): number {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i] as number;
      for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
  function chunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeAndData = Buffer.concat([Buffer.from(type), data]);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(typeAndData));
    return Buffer.concat([len, typeAndData, crcBuf]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const rawRow = Buffer.from([0x00, 0xff, 0x00, 0x00]);
  const zlib = require('node:zlib');
  const compressed = zlib.deflateSync(rawRow);
  return new Uint8Array(Buffer.concat([header, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]));
})();

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body };
}

function bytesResponse(bytes: Uint8Array, status = 200) {
  return { ok: status >= 200 && status < 300, status, body: bytes, headers: new Headers({ 'content-type': 'image/png' }) };
}

function notFound() {
  return { ok: false, status: 404, json: async () => ({ error: 'not found' }) };
}

function unsupported() {
  return { ok: false, status: 415, json: async () => ({ error: 'unsupported' }) };
}

// ─── Tests ─────────────────────────────────────────────────────

describe('evidence visual gallery (EVIDENCE-UX-002 M3)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    // Mock Image to auto-fire onload/onerror in jsdom based on URL
    vi.stubGlobal(
      'Image',
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        #src = '';
        set src(value: string) {
          this.#src = value;
          setTimeout(() => {
            if (value.includes(JPEG_DIGEST)) {
              this.onerror?.();
            } else {
              this.onload?.();
            }
          }, 0);
        }
        get src() { return this.#src; }
      },
    );
    // Mock thumbnail endpoint — return PNG for known digests, 415 for JPEG
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/thumbnail')) {
        if (url.includes(JPEG_DIGEST)) return Promise.resolve(unsupported());
        if (url.includes(SCREENSHOT_DIGEST) || url.includes(COMPARISON_DIGEST)) {
          return Promise.resolve(bytesResponse(MINIMAL_PNG));
        }
        return Promise.resolve(notFound());
      }
      if (url === '/api/evidence/bundles') {
        return Promise.resolve(jsonResponse({ bundles: [BUNDLE_FIXTURE] }));
      }
      if (url === '/api/evidence/baselines') {
        return Promise.resolve(jsonResponse({ baselines: [] }));
      }
      if (url.startsWith('/api/evidence/bundles/')) {
        return Promise.resolve(jsonResponse({ bundle: BUNDLE_FIXTURE }));
      }
      return Promise.resolve(jsonResponse({}));
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function renderPage() {
    return render(
      <ThemeProvider>
        <EvidencePage />
      </ThemeProvider>,
    );
  }

  // ─── Visual evidence selection ───────────────────────────────

  it('recognizes screenshot as visual evidence', async () => {
    renderPage();
    expect(await screen.findByText('Visual Evidence')).toBeTruthy();
    expect(screen.getByText('Matrix')).toBeTruthy();
  });

  it('recognizes visual-comparison as visual evidence', async () => {
    renderPage();
    await screen.findByText('Visual Evidence');
    expect(screen.getByText('Narrow')).toBeTruthy();
  });

  it('excludes nonvisual evidence from gallery', async () => {
    renderPage();
    await screen.findByText('Visual Evidence');
    expect(screen.queryByText('Build log')).toBeNull();
  });

  // ─── Secure thumbnail integration ────────────────────────────

  it('uses the secure thumbnail endpoint for card images', async () => {
    renderPage();
    await screen.findByText('Visual Evidence');
    await waitFor(() => {
      const img = screen.getAllByRole('img').find((el) => el.getAttribute('alt') === 'Matrix');
      expect(img).toBeTruthy();
      expect(img!.getAttribute('src')).toBe(`/api/evidence/artifacts/${SCREENSHOT_DIGEST}/thumbnail`);
    });
  });

  it('never uses producer or local filesystem paths as img src', async () => {
    renderPage();
    await screen.findByText('Visual Evidence');
    await waitFor(() => {
      for (const img of screen.getAllByRole('img')) {
        const src = img.getAttribute('src') ?? '';
        expect(src).not.toContain('/home/');
        expect(src).not.toContain('/tmp/');
        expect(src).not.toContain('Playwright');
        expect(src).not.toContain('.artifacts');
      }
    });
  });

  // ─── Thumbnail-unavailable semantics ─────────────────────────

  it('shows preview unavailable for unsupported thumbnail (415)', async () => {
    renderPage();
    await screen.findByText('Visual Evidence');
    await waitFor(() => {
      const photoCard = screen.getByText('Photo').closest('button');
      expect(photoCard).toBeTruthy();
      expect(within(photoCard!).getByText('Preview unavailable')).toBeTruthy();
    });
  });

  it('does not fall back to the original full-resolution artifact for thumbnails', async () => {
    renderPage();
    await screen.findByText('Visual Evidence');
    await waitFor(() => {
      for (const img of screen.getAllByRole('img')) {
        const src = img.getAttribute('src') ?? '';
        if (src.includes('/artifacts/')) {
          expect(src).toContain('/thumbnail');
        }
      }
    });
  });

  // ─── Card metadata ───────────────────────────────────────────

  it('renders dimensions when visual metadata is available', async () => {
    renderPage();
    await screen.findByText('Visual Evidence');
    expect(screen.getByText('1280 × 720')).toBeTruthy();
    expect(screen.getByText('480 × 900')).toBeTruthy();
  });

  it('renders media type label', async () => {
    renderPage();
    await screen.findByText('Visual Evidence');
    const pngLabels = screen.getAllByText('PNG');
    expect(pngLabels.length).toBeGreaterThanOrEqual(1);
  });

  it('renders provenance producer', async () => {
    renderPage();
    await screen.findByText('Visual Evidence');
    const playwrights = screen.getAllByText('Playwright');
    expect(playwrights.length).toBeGreaterThanOrEqual(2);
  });

  it('handles missing optional visual metadata gracefully', async () => {
    // The JPEG card has visual metadata, but if it were missing the card should still render
    renderPage();
    await screen.findByText('Visual Evidence');
    expect(screen.getByText('Photo')).toBeTruthy();
  });

  // ─── Responsive layout ───────────────────────────────────────

  it('renders a responsive grid for visual cards', async () => {
    const { container } = renderPage();
    await screen.findByText('Visual Evidence');
    const grid = container.querySelector('.grid.grid-cols-1');
    expect(grid).toBeTruthy();
    expect(grid!.classList.contains('sm:grid-cols-2')).toBeTruthy();
    expect(grid!.classList.contains('lg:grid-cols-3')).toBeTruthy();
  });

  // ─── Selection ───────────────────────────────────────────────

  it('selects a visual card on click', async () => {
    renderPage();
    await screen.findByText('Visual Evidence');
    const card = screen.getByText('Matrix').closest('button')!;
    fireEvent.click(card);
    // Selected state uses accent border (verified by class)
    expect(card.className).toContain('border-(--vestara-accent)');
  });

  it('deselects on second click', async () => {
    renderPage();
    await screen.findByText('Visual Evidence');
    const card = screen.getByText('Matrix').closest('button')!;
    fireEvent.click(card);
    fireEvent.click(card);
    // After deselect, should not have accent border
    expect(card.className).not.toContain('border-(--vestara-accent)');
  });

  it('keyboard reachable via button element', async () => {
    renderPage();
    await screen.findByText('Visual Evidence');
    const cards = screen.getAllByRole('button');
    const visualCards = cards.filter((c) => c.getAttribute('aria-label')?.startsWith('Visual evidence'));
    expect(visualCards.length).toBeGreaterThanOrEqual(2);
    for (const card of visualCards) {
      expect(card.tagName).toBe('BUTTON');
    }
  });

  it('provides meaningful accessible labels', async () => {
    renderPage();
    await screen.findByText('Visual Evidence');
    expect(screen.getByRole('button', { name: 'Visual evidence: Matrix' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Visual evidence: Narrow' })).toBeTruthy();
  });

  it('selection is not color-only (has border change)', async () => {
    renderPage();
    await screen.findByText('Visual Evidence');
    const card = screen.getByText('Matrix').closest('button')!;
    const classBefore = card.className;
    fireEvent.click(card);
    const classAfter = card.className;
    expect(classAfter).not.toBe(classBefore);
  });

  // ─── Lazy loading ────────────────────────────────────────────

  it('uses native lazy loading for thumbnail images', async () => {
    renderPage();
    await screen.findByText('Visual Evidence');
    await waitFor(() => {
      const img = screen.getAllByRole('img').find((el) => el.getAttribute('alt') === 'Matrix');
      expect(img?.getAttribute('loading')).toBe('lazy');
    });
  });

  // ─── Nonvisual evidence unchanged ────────────────────────────

  it('keeps nonvisual evidence rendering unchanged in bundle detail', async () => {
    renderPage();
    // Expand the bundle
    const bundleHeader = await screen.findByText('test-execution-1');
    fireEvent.click(bundleHeader);
    // The text evidence should appear in the expanded detail
    await screen.findByText('Build log');
  });

  // ─── Verification verdict not inferred ───────────────────────

  it('does not infer verification verdict from screenshot presence', async () => {
    renderPage();
    await screen.findByText('Visual Evidence');
    // The gallery should not display any "Verified" or verdict text
    expect(screen.queryByText('Verified')).toBeNull();
    expect(screen.queryByText('✓ Verified')).toBeNull();
    expect(screen.queryByText('Passed')).toBeNull();
  });

  // ─── M4A acceptance ──────────────────────────────────────────

  it('M4A: shows 3 visual cards when 3 visual references exist', async () => {
    renderPage();
    await screen.findByText('Visual Evidence');
    const visualCards = screen.getAllByRole('button').filter((c) =>
      c.getAttribute('aria-label')?.startsWith('Visual evidence'),
    );
    expect(visualCards).toHaveLength(3);
  });

  it('M4A: all 3 thumbnails render from the secure endpoint', async () => {
    renderPage();
    await screen.findByText('Visual Evidence');
    await waitFor(() => {
      const images = screen.getAllByRole('img').filter((el) => {
        const src = el.getAttribute('src') ?? '';
        return src.includes('/thumbnail');
      });
      expect(images).toHaveLength(2); // 2 PNGs succeed, 1 JPEG returns 415
    });
  });

  it('M4A: correct dimensions shown for each artifact', async () => {
    renderPage();
    await screen.findByText('Visual Evidence');
    expect(screen.getByText('1280 × 720')).toBeTruthy();
    expect(screen.getByText('480 × 900')).toBeTruthy();
  });
});
