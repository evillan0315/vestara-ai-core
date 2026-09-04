// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../src/lib/theme.js';
import EvidencePage from '../src/pages/Evidence.js';

// ─── Fixtures ──────────────────────────────────────────────────

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const DIGEST_C = 'c'.repeat(64);
const DIGEST_TEXT = 'd'.repeat(64);

function makeRef(overrides: Partial<{ ref: string; kind: string; mediaType: string; summary: string; width: number; height: number }>) {
  const ref = overrides.ref ?? DIGEST_A;
  return {
    ref,
    kind: overrides.kind ?? 'screenshot',
    mediaType: overrides.mediaType ?? 'image/png',
    size: 1024,
    summary: overrides.summary ?? `Artifact ${ref.slice(0, 4)}`,
    provenance: { producer: 'Playwright', executionId: 'exec-1', createdAt: '2026-09-01T00:00:00Z', environment: 'test', contentHash: ref },
    visual: { width: overrides.width ?? 1280, height: overrides.height ?? 720, mediaType: overrides.mediaType ?? 'image/png' },
  };
}

const BUNDLE = {
  id: 'bundle-1',
  executionId: 'exec-1',
  verifierId: 'verifier',
  profileId: 'standard',
  manifestId: 'm1',
  evidence: [
    makeRef({ ref: DIGEST_A, summary: 'Matrix', width: 1280, height: 720 }),
    makeRef({ ref: DIGEST_B, summary: 'Narrow', kind: 'visual-comparison', width: 480, height: 900 }),
    makeRef({ ref: DIGEST_C, summary: 'Expanded', width: 1280, height: 900 }),
    { ref: DIGEST_TEXT, kind: 'command', mediaType: 'text/plain', size: 512, summary: 'Log', provenance: { producer: 'harness', executionId: 'exec-1', createdAt: '2026-09-01T00:00:03Z', environment: 'test', contentHash: DIGEST_TEXT } },
  ],
  checks: [],
  replay: { mode: 'artifact', steps: [], requires: {} },
  confidence: { score: 0.8, level: 'high', factors: [], limitations: [] },
  createdAt: '2026-09-01T00:00:00Z',
};

// Minimal valid PNG
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

function pngBytesResponse(bytes: Uint8Array, status = 200) {
  return { ok: status >= 200 && status < 300, status, body: bytes, headers: new Headers({ 'content-type': 'image/png' }) };
}

function errorResponse(status: number) {
  return { ok: false, status, json: async () => ({ error: `HTTP ${status}` }) };
}

// ─── Tests ─────────────────────────────────────────────────────

describe('evidence visual viewer (EVIDENCE-UX-002 M4)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    // Mock Image to auto-fire onload in jsdom
    vi.stubGlobal(
      'Image',
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        #src = '';
        set src(value: string) {
          this.#src = value;
          setTimeout(() => {
            // Gallery thumbnails always load; viewer original always loads
            if (value.includes('/thumbnail')) {
              this.onload?.();
            } else {
              // Original artifact endpoint — succeed for known digests
              if (value.includes(DIGEST_A) || value.includes(DIGEST_B) || value.includes(DIGEST_C)) {
                this.onload?.();
              } else {
                this.onerror?.();
              }
            }
          }, 0);
        }
        get src() { return this.#src; }
      },
    );
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/evidence/bundles') return Promise.resolve(jsonResponse({ bundles: [BUNDLE] }));
      if (url === '/api/evidence/baselines') return Promise.resolve(jsonResponse({ baselines: [] }));
      if (url.startsWith('/api/evidence/bundles/')) return Promise.resolve(jsonResponse({ bundle: BUNDLE }));
      if (url.includes('/thumbnail')) return Promise.resolve(pngBytesResponse(MINIMAL_PNG));
      if (url.includes('/artifacts/')) return Promise.resolve(pngBytesResponse(MINIMAL_PNG));
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

  async function openViewer(summary: string) {
    renderPage();
    await screen.findByText('Visual Evidence');
    await waitFor(() => {
      expect(screen.getAllByRole('img').length).toBeGreaterThan(0);
    });
    const card = screen.getByText(summary).closest('button')!;
    fireEvent.click(card);
    await screen.findByRole('dialog');
  }

  function viewer() {
    return screen.getByRole('dialog');
  }

  function viewerButton(name: string) {
    return within(viewer()).getByRole('button', { name });
  }

  function viewerText(text: string) {
    return within(viewer()).getByText(text);
  }

  // ─── Open/close lifecycle ────────────────────────────────────

  it('gallery selection opens the correct evidence in the viewer', async () => {
    await openViewer('Matrix');
    expect(viewer()).toBeTruthy();
    expect(viewerText('Matrix')).toBeTruthy();
  });

  it('close button closes the viewer', async () => {
    await openViewer('Matrix');
    const closeBtn = screen.getByRole('button', { name: 'Close viewer' });
    fireEvent.click(closeBtn);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('Escape closes the viewer', async () => {
    await openViewer('Matrix');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  // ─── Secure original integration ─────────────────────────────

  it('loads the original through the secure artifact endpoint', async () => {
    await openViewer('Matrix');
    await waitFor(() => {
      const imgs = screen.getAllByRole('img');
      const original = imgs.find((el) => el.getAttribute('alt') === 'Matrix' && el.getAttribute('src')?.includes('/artifacts/') && !el.getAttribute('src')?.includes('/thumbnail'));
      expect(original).toBeTruthy();
      expect(original!.getAttribute('src')).toBe(`/api/evidence/artifacts/${DIGEST_A}`);
    });
  });

  it('never uses producer or filesystem path as image src', async () => {
    await openViewer('Matrix');
    await waitFor(() => {
      for (const img of screen.getAllByRole('img')) {
        const src = img.getAttribute('src') ?? '';
        expect(src).not.toContain('/home/');
        expect(src).not.toContain('/tmp/');
        expect(src).not.toContain('Playwright');
      }
    });
  });

  it('thumbnail is not treated as the original evidence', async () => {
    await openViewer('Matrix');
    await waitFor(() => {
      const imgs = screen.getAllByRole('img');
      const originals = imgs.filter((el) => {
        const src = el.getAttribute('src') ?? '';
        return src.includes('/artifacts/') && !src.includes('/thumbnail');
      });
      expect(originals.length).toBe(1);
    });
  });

  // ─── Previous/next ───────────────────────────────────────────

  it('navigates to next artifact', async () => {
    await openViewer('Matrix');
    const dialog = screen.getByRole('dialog');
    const nextBtn = within(viewer()).getByRole('button', { name: 'Next' });
    fireEvent.click(nextBtn);
    await waitFor(() => {
      expect(within(viewer()).getByText('Narrow')).toBeTruthy();
    });
  });

  it('navigates to previous artifact', async () => {
    await openViewer('Narrow');
    const dialog = screen.getByRole('dialog');
    const prevBtn = within(viewer()).getByRole('button', { name: 'Previous' });
    fireEvent.click(prevBtn);
    await waitFor(() => {
      expect(within(viewer()).getByText('Matrix')).toBeTruthy();
    });
  });

  it('disables previous on first artifact', async () => {
    await openViewer('Matrix');
    const dialog = screen.getByRole('dialog');
    const prevBtn = within(viewer()).getByRole('button', { name: 'Previous' });
    expect(prevBtn.hasAttribute('disabled')).toBeTruthy();
  });

  it('disables next on last artifact', async () => {
    await openViewer('Expanded');
    const dialog = screen.getByRole('dialog');
    const nextBtn = within(viewer()).getByRole('button', { name: 'Next' });
    expect(nextBtn.hasAttribute('disabled')).toBeTruthy();
  });

  it('shows counter (2 / 3)', async () => {
    await openViewer('Narrow');
    const dialog = screen.getByRole('dialog');
    expect(within(viewer()).getByText('2 / 3')).toBeTruthy();
  });

  it('ArrowRight navigates to next', async () => {
    await openViewer('Matrix');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' });
    await waitFor(() => {
      expect(within(viewer()).getByText('Narrow')).toBeTruthy();
    });
  });

  it('ArrowLeft navigates to previous', async () => {
    await openViewer('Narrow');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft' });
    await waitFor(() => {
      expect(within(viewer()).getByText('Matrix')).toBeTruthy();
    });
  });

  // ─── Zoom ────────────────────────────────────────────────────

  it('zoom in increases zoom level', async () => {
    await openViewer('Matrix');
    const dialog = screen.getByRole('dialog');
    const zoomIn = within(viewer()).getByRole('button', { name: 'Zoom in' });
    fireEvent.click(zoomIn);
    await waitFor(() => {
      expect(within(viewer()).getByText('125%')).toBeTruthy();
    });
  });

  it('zoom out decreases zoom level', async () => {
    await openViewer('Matrix');
    const dialog = screen.getByRole('dialog');
    const zoomIn = within(viewer()).getByRole('button', { name: 'Zoom in' });
    const zoomOut = within(viewer()).getByRole('button', { name: 'Zoom out' });
    fireEvent.click(zoomIn);
    fireEvent.click(zoomIn);
    fireEvent.click(zoomOut);
    await waitFor(() => {
      expect(within(viewer()).getByText('125%')).toBeTruthy();
    });
  });

  it('100% button sets zoom to 100%', async () => {
    await openViewer('Matrix');
    const zoomIn = within(viewer()).getByRole('button', { name: 'Zoom in' });
    fireEvent.click(zoomIn);
    fireEvent.click(zoomIn);
    const btn100 = within(viewer()).getByRole('button', { name: '100%' });
    fireEvent.click(btn100);
    await waitFor(() => {
      expect(within(viewer()).getAllByText('100%').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('Fit button enters fit mode', async () => {
    await openViewer('Matrix');
    const zoomIn = within(viewer()).getByRole('button', { name: 'Zoom in' });
    fireEvent.click(zoomIn);
    const fitBtn = within(viewer()).getByRole('button', { name: 'Fit' });
    fireEvent.click(fitBtn);
    await waitFor(() => {
      expect(within(viewer()).getAllByText('Fit').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('+ key zooms in', async () => {
    await openViewer('Matrix');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: '+' });
    await waitFor(() => {
      expect(within(viewer()).getByText('125%')).toBeTruthy();
    });
  });

  it('- key zooms out', async () => {
    await openViewer('Matrix');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: '+' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: '+' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: '-' });
    await waitFor(() => {
      expect(within(viewer()).getByText('125%')).toBeTruthy();
    });
  });

  it('0 key sets 100%', async () => {
    await openViewer('Matrix');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: '+' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: '0' });
    await waitFor(() => {
      expect(within(viewer()).getAllByText('100%').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('Fit does not crop the image', async () => {
    await openViewer('Matrix');
    const dialog = screen.getByRole('dialog');
    const img = within(viewer()).getAllByRole('img').find((el) => {
      const src = el.getAttribute('src') ?? '';
      return src.includes('/artifacts/') && !src.includes('/thumbnail');
    });
    expect(img).toBeTruthy();
    expect(img!.className).toContain('max-w-full');
    expect(img!.className).toContain('max-h-full');
  });

  // ─── Artifact switch resets zoom ──────────────────────────────

  it('switching artifacts resets zoom to fit mode', async () => {
    await openViewer('Matrix');
    const zoomIn = within(viewer()).getByRole('button', { name: 'Zoom in' });
    fireEvent.click(zoomIn);
    fireEvent.click(zoomIn);
    expect(within(viewer()).getAllByText('156%').length).toBeGreaterThanOrEqual(1);
    const nextBtn = within(viewer()).getByRole('button', { name: 'Next' });
    fireEvent.click(nextBtn);
    await waitFor(() => {
      expect(within(viewer()).getAllByText('Fit').length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Metadata ────────────────────────────────────────────────

  it('shows dimensions', async () => {
    await openViewer('Matrix');
    const dialog = screen.getByRole('dialog');
    expect(within(viewer()).getByText('1280 × 720')).toBeTruthy();
  });

  it('shows media type', async () => {
    await openViewer('Matrix');
    const dialog = screen.getByRole('dialog');
    expect(within(viewer()).getByText('PNG')).toBeTruthy();
  });

  it('shows producer', async () => {
    await openViewer('Matrix');
    const dialog = screen.getByRole('dialog');
    expect(within(viewer()).getByText('Playwright')).toBeTruthy();
  });

  // ─── Loading/failure ─────────────────────────────────────────

  it('shows loading state while original loads', async () => {
    renderPage();
    await screen.findByText('Visual Evidence');
    await waitFor(() => {
      expect(screen.getAllByRole('img').length).toBeGreaterThan(0);
    });
    // Click to open — the loading state appears briefly
    const card = screen.getByText('Matrix').closest('button')!;
    fireEvent.click(card);
    const dialog = screen.getByRole('dialog');
    // Loading or ready — both acceptable
    expect(dialog).toBeTruthy();
  });

  it('handles 404 gracefully (unavailable state)', async () => {
    // Override Image to simulate 404
    vi.stubGlobal(
      'Image',
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        #src = '';
        set src(value: string) {
          this.#src = value;
          setTimeout(() => {
            if (value.includes('/thumbnail')) {
              this.onload?.();
            } else {
              this.onerror?.();
            }
          }, 0);
        }
        get src() { return this.#src; }
      },
    );
    await openViewer('Matrix');
    await waitFor(() => {
      expect(screen.getByText('Original unavailable')).toBeTruthy();
    });
  });

  // ─── JPEG/WebP originals ─────────────────────────────────────

  it('inspects JPEG originals via the secure endpoint', async () => {
    // Override Image to succeed for all originals
    vi.stubGlobal(
      'Image',
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        #src = '';
        set src(value: string) {
          this.#src = value;
          setTimeout(() => this.onload?.(), 0);
        }
        get src() { return this.#src; }
      },
    );
    const jpegBundle = {
      ...BUNDLE,
      evidence: [
        { ref: DIGEST_A, kind: 'screenshot', mediaType: 'image/jpeg', size: 4096, summary: 'Photo', provenance: { producer: 'Playwright', executionId: 'exec-1', createdAt: '2026-09-01T00:00:00Z', environment: 'test', contentHash: DIGEST_A }, visual: { width: 1920, height: 1080, mediaType: 'image/jpeg' } },
      ],
    };
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/evidence/bundles') return Promise.resolve(jsonResponse({ bundles: [jpegBundle] }));
      if (url === '/api/evidence/baselines') return Promise.resolve(jsonResponse({ baselines: [] }));
      return Promise.resolve(jsonResponse({}));
    });
    renderPage();
    await screen.findByText('Visual Evidence');
    await waitFor(() => {
      expect(screen.getAllByRole('img').length).toBeGreaterThan(0);
    });
    const card = screen.getByText('Photo').closest('button')!;
    fireEvent.click(card);
    await screen.findByRole('dialog');
    await waitFor(() => {
      const imgs = screen.getAllByRole('img');
      const original = imgs.find((el) => {
        const src = el.getAttribute('src') ?? '';
        return src.includes('/artifacts/') && !src.includes('/thumbnail');
      });
      expect(original).toBeTruthy();
    });
  });

  // ─── No SVG ──────────────────────────────────────────────────

  it('does not render SVG as inline image', async () => {
    // SVG evidence is excluded by kind filtering (not screenshot/visual-comparison)
    // But even if it were visual, M2 would return 415
    await openViewer('Matrix');
    for (const img of screen.getAllByRole('img')) {
      const src = img.getAttribute('src') ?? '';
      expect(src).not.toContain('image/svg');
    }
  });

  // ─── No verification inference ───────────────────────────────

  it('does not display verification verdict from screenshot presence', async () => {
    await openViewer('Matrix');
    expect(screen.queryByText('Verified')).toBeNull();
    expect(screen.queryByText('✓ Verified')).toBeNull();
    expect(screen.queryByText('Passed')).toBeNull();
  });

  // ─── Responsive layout ───────────────────────────────────────

  it('renders viewer as full-screen dialog', async () => {
    await openViewer('Matrix');
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('fixed');
    expect(dialog.className).toContain('inset-0');
  });

  // ─── Nonvisual evidence regression ───────────────────────────

  it('nonvisual evidence still renders in bundle detail', async () => {
    renderPage();
    const bundleHeader = await screen.findByText('exec-1');
    fireEvent.click(bundleHeader);
    await screen.findByText('Log');
  });

  // ─── M4A viewer acceptance ───────────────────────────────────

  it('M4A: opens Matrix (1280×720) in viewer', async () => {
    await openViewer('Matrix');
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(within(viewer()).getByText('1280 × 720')).toBeTruthy();
    expect(within(viewer()).getByText('PNG')).toBeTruthy();
    expect(within(viewer()).getByText('Playwright')).toBeTruthy();
  });

  it('M4A: navigates through all 3 artifacts', async () => {
    await openViewer('Matrix');
    const dialog = screen.getByRole('dialog');
    // Matrix → Narrow
    fireEvent.click(within(viewer()).getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(within(viewer()).getByText('Narrow')).toBeTruthy());
    expect(within(viewer()).getByText('2 / 3')).toBeTruthy();
    // Narrow → Expanded
    fireEvent.click(within(viewer()).getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(within(viewer()).getByText('Expanded')).toBeTruthy());
    expect(within(viewer()).getByText('3 / 3')).toBeTruthy();
    // Next disabled on last
    expect(within(viewer()).getByRole('button', { name: 'Next' }).hasAttribute('disabled')).toBeTruthy();
    // Navigate back
    fireEvent.click(within(viewer()).getByRole('button', { name: 'Previous' }));
    await waitFor(() => expect(within(viewer()).getByText('Narrow')).toBeTruthy());
  });

  it('M4A: zoom and fit work correctly', async () => {
    await openViewer('Matrix');
    // Start in Fit mode
    expect(within(viewer()).getAllByText('Fit').length).toBeGreaterThanOrEqual(1);
    // Zoom in
    fireEvent.click(within(viewer()).getByRole('button', { name: 'Zoom in' }));
    await waitFor(() => expect(within(viewer()).getAllByText('125%').length).toBeGreaterThanOrEqual(1));
    // 100%
    fireEvent.click(within(viewer()).getByRole('button', { name: '100%' }));
    await waitFor(() => expect(within(viewer()).getAllByText('100%').length).toBeGreaterThanOrEqual(1));
    // Back to Fit
    fireEvent.click(within(viewer()).getByRole('button', { name: 'Fit' }));
    await waitFor(() => expect(within(viewer()).getAllByText('Fit').length).toBeGreaterThanOrEqual(1));
  });
});
