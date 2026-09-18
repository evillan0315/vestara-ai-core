/**
 * CAPTURE-001-M3 — X11 full-display screenshot adapter (screenshot + display only).
 *
 * Mechanism: `xwd -root` (existing host tool, zero installs) → minimal XWD
 * decode (ZPixmap TrueColor/DirectColor only) → minimal PNG encode (Node
 * builtins only) → injected ingest seam (real `ingestCaptureBytes` in
 * wiring; deterministic stub in tests) → digest adoption.
 *
 * Hard boundaries:
 *   - Adapter NEVER grants permission: every capture requires an
 *     already-authorized request (CaptureAuthorization). DISPLAY access,
 *     Xauthority readability, and agent requests grant nothing.
 *   - Window / region / recording / audio / Wayland / portal are explicitly
 *     unsupported (fail closed with `not-supported`).
 *   - No shell: xwd spawns via execFile argv only; display IDs are validated
 *     against a strict pattern, never concatenated into commands.
 *   - No FFmpeg, no Playwright cache, no new dependencies (node:* only).
 */

import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { deflateSync } from 'node:zlib';
import type {
  CaptureArtifact,
  CaptureArtifactKind,
  CaptureCapabilityStatus,
  CaptureOperation,
  CaptureState,
  CaptureStateListener,
  CaptureTarget,
  EvidenceBackedReference,
  RecordingRequest,
  ScreenCapturePort,
  ScreenCaptureProbeResult,
  ScreenshotRequest,
  TargetScope,
} from './index.js';
import {
  assertTransition,
  fromEvidenceReference,
  probeScreenCaptureCapabilities,
  scopeOfTarget,
  validateRecordingRequest,
  validateScreenshotRequest,
} from './index.js';

// ─── Errors ─────────────────────────────────────────────────────

export type X11AdapterErrorCode =
  | 'not-supported'
  | 'unauthorized'
  | 'backend-unavailable'
  | 'capture-failed'
  | 'decode-failed'
  | 'cancelled';

export class X11AdapterError extends Error {
  readonly code: X11AdapterErrorCode;

  constructor(code: X11AdapterErrorCode, message: string) {
    super(message);
    this.name = 'X11AdapterError';
    this.code = code;
  }
}

// ─── Authorization boundary ─────────────────────────────────────
//
// The adapter executes ONLY already-authorized requests. Authorization is
// granted elsewhere (human grant through the governed service boundary);
// the adapter verifies its presence, scope coverage, and shape.

export interface CaptureAuthorization {
  /** Who granted capture (human identity). Agent requests never self-grant. */
  readonly grantedBy: string;
  readonly grantedAt: string;
  /** Scope the grant covers — must include the request target scope. */
  readonly scope: TargetScope;
}

export type AuthorizedScreenshotRequest = ScreenshotRequest & {
  readonly authorization: CaptureAuthorization;
};

export function assertScreenshotAuthorized(request: ScreenshotRequest): asserts request is AuthorizedScreenshotRequest {
  const errors = validateScreenshotRequest(request);
  if (errors.length > 0) {
    throw new X11AdapterError('unauthorized', `request invalid: ${errors.join('; ')}`);
  }
  const authorization = (request as Partial<AuthorizedScreenshotRequest>).authorization;
  if (!authorization || typeof authorization !== 'object') {
    throw new X11AdapterError('unauthorized', 'capture requires an explicit authorization grant');
  }
  if (authorization.grantedBy.trim().length === 0 || authorization.grantedAt.trim().length === 0) {
    throw new X11AdapterError('unauthorized', 'authorization grant is incomplete');
  }
  if (scopeOfTarget(request.target) !== authorization.scope) {
    throw new X11AdapterError(
      'unauthorized',
      `grant scope '${authorization.scope}' does not cover target scope '${scopeOfTarget(request.target)}'`,
    );
  }
}

// ─── Backend prerequisites (non-destructive) ────────────────────
//
// DISPLAY alone is insufficient: usability requires a well-formed display,
// an executable xwd, AND readable X authority. Probing never captures.

const DISPLAY_PATTERN = /^:[0-9]+(\.[0-9]+)?$/;

export function isValidDisplayId(display: string): boolean {
  return DISPLAY_PATTERN.test(display);
}

export interface X11ProbeEnvironment {
  readonly DISPLAY?: string;
  readonly PATH?: string;
  readonly XAUTHORITY?: string;
  readonly HOME?: string;
}

export interface X11FilesystemSeam {
  existsSync(path: string): boolean;
  accessSync(path: string, mode?: number): void;
}

const defaultSeam: X11FilesystemSeam = {
  existsSync: (p: string) => fs.existsSync(p),
  accessSync: (p: string, mode?: number) => fs.accessSync(p, mode),
};

export function findXwd(searchPath: string | undefined, seam: X11FilesystemSeam = defaultSeam): string | undefined {
  return findX11Tool('xwd', searchPath, seam);
}

export function findX11Tool(
  name: string,
  searchPath: string | undefined,
  seam: X11FilesystemSeam = defaultSeam,
): string | undefined {
  if (!searchPath) return undefined;
  for (const dir of searchPath.split(':')) {
    if (!dir) continue;
    const candidate = path.join(dir, name);
    try {
      seam.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // not present/executable here — keep scanning
    }
  }
  return undefined;
}

export interface X11BackendStatus {
  readonly usable: boolean;
  readonly display: string | null;
  readonly xwdPath: string | undefined;
  readonly reason: string;
}

export function checkX11DisplayBackend(
  env: X11ProbeEnvironment,
  seam: X11FilesystemSeam = defaultSeam,
): X11BackendStatus {
  const display = env.DISPLAY?.trim() ? env.DISPLAY.trim() : null;
  if (!display || !isValidDisplayId(display)) {
    return { usable: false, display, xwdPath: undefined, reason: 'no valid X11 DISPLAY (expected like :0)' };
  }
  const xwdPath = findXwd(env.PATH, seam);
  if (!xwdPath) {
    return { usable: false, display, xwdPath, reason: 'xwd not found on PATH — no capture tool available' };
  }
  const authority = env.XAUTHORITY?.trim() ? env.XAUTHORITY.trim() : undefined;
  const homeAuthority = env.HOME?.trim() ? path.join(env.HOME.trim(), '.Xauthority') : undefined;
  const authorityPath = authority ?? homeAuthority ?? null;
  if (!authorityPath || !seam.existsSync(authorityPath)) {
    return { usable: false, display, xwdPath, reason: 'no readable X authority (XAUTHORITY or ~/.Xauthority)' };
  }
  return { usable: true, display, xwdPath, reason: `x11 backend ready: ${xwdPath} on ${display}` };
}

// ─── Process seam (argv only — never a shell) ───────────────────

export interface X11ExecResult {
  readonly stdout: string;
  readonly stderr: string;
}

export type X11ExecFn = (
  file: string,
  args: readonly string[],
  options: { timeoutMs: number },
) => Promise<X11ExecResult>;

function defaultExec(file: string, args: readonly string[], options: { timeoutMs: number }): Promise<X11ExecResult> {
  return new Promise((resolve, reject) => {
    execFile(file, [...args], { timeout: options.timeoutMs }, (error, stdout, stderr) => {
      if (error) {
        reject(
          new X11AdapterError(
            'capture-failed',
            `${path.basename(file)} failed: ${String(stderr ?? error.message).slice(0, 300)}`,
          ),
        );
      } else {
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      }
    });
  });
}

// ─── Window selection (M3A) ─────────────────────────────────────
//
// The canonical boundary carries an opaque window token minted by explicit
// user/OS selection. The adapter exposes NO enumeration: no window lists,
// no tree walks, no title scans. Tokens arrive selected; SELECTING
// re-validates existence against the OS before capture.

const WINDOW_ID_PATTERN = /^0x[0-9a-fA-F]+$/;

export function isValidWindowToken(token: string): boolean {
  return WINDOW_ID_PATTERN.test(token);
}

export interface SelectedWindow {
  readonly windowId: string;
  readonly width: number;
  readonly height: number;
}

function parseWindowId(output: string): string | undefined {
  const match = output.match(/Window id:\s*(0x[0-9a-fA-F]+)/);
  return match?.[1];
}

function parseDimensions(output: string): { width: number; height: number } | undefined {
  const width = output.match(/^\s*Width:\s*(\d+)/m)?.[1];
  const height = output.match(/^\s*Height:\s*(\d+)/m)?.[1];
  if (width === undefined || height === undefined) return undefined;
  return { width: Number(width), height: Number(height) };
}

/**
 * Verify a selected window still exists. Returns its OS-reported geometry.
 * Stale/invalid windows fail with a descriptive error (lifecycle FAILED —
 * the selection was valid when minted but the window is gone).
 */
export async function verifyWindow(
  windowId: string,
  display: string,
  tools: { xwininfoPath: string; exec: X11ExecFn; timeoutMs: number },
): Promise<SelectedWindow> {
  if (!isValidWindowToken(windowId)) {
    throw new X11AdapterError('not-supported', `window token '${windowId}' is not an opaque window id`);
  }
  let result: X11ExecResult;
  try {
    result = await tools.exec(tools.xwininfoPath, ['-id', windowId, '-display', display], {
      timeoutMs: tools.timeoutMs,
    });
  } catch {
    throw new X11AdapterError('backend-unavailable', `selected window ${windowId} no longer exists`);
  }
  const confirmed = parseWindowId(result.stdout);
  const dimensions = parseDimensions(result.stdout);
  if (confirmed?.toLowerCase() !== windowId.toLowerCase() || !dimensions) {
    throw new X11AdapterError('backend-unavailable', `selected window ${windowId} no longer exists`);
  }
  return { windowId, width: dimensions.width, height: dimensions.height };
}

export type WindowSelection = { status: 'selected'; windowId: string } | { status: 'cancelled' };

/**
 * Interactive OS-level window selection: bare `xwininfo` lets the USER click
 * the target window. User dismissal / empty pick maps to `cancelled`
 * (lifecycle CANCELLED — never FAILED). The agent never enumerates.
 */
export async function selectWindowInteractively(
  display: string,
  tools: { xwininfoPath: string; exec: X11ExecFn; timeoutMs: number },
): Promise<WindowSelection> {
  let result: X11ExecResult;
  try {
    result = await tools.exec(tools.xwininfoPath, ['-display', display], { timeoutMs: tools.timeoutMs });
  } catch {
    return { status: 'cancelled' };
  }
  const windowId = parseWindowId(result.stdout);
  return windowId ? { status: 'selected', windowId } : { status: 'cancelled' };
}

// ─── Region selection (M3A) ─────────────────────────────────────
//
// No drag-to-select tool exists in this environment (no slop/xrectsel/
// tkinter) and installs are forbidden, so interactive region picking is on
// HOLD. Region capture accepts explicit user/OS-selected geometry only:
// displayId + finite x/y + positive w/h, validated against live display
// bounds. Geometry minted by any other means is rejected, not clamped.

export interface RegionBounds {
  readonly width: number;
  readonly height: number;
}

export async function getDisplayBounds(
  display: string,
  tools: { xwininfoPath: string; exec: X11ExecFn; timeoutMs: number },
): Promise<RegionBounds> {
  const result = await tools.exec(tools.xwininfoPath, ['-root', '-display', display], {
    timeoutMs: tools.timeoutMs,
  });
  const dimensions = parseDimensions(result.stdout);
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    throw new X11AdapterError('backend-unavailable', `display ${display} reported no usable bounds`);
  }
  return dimensions;
}

export interface ValidatedRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function validateRegionGeometry(
  geometry: { x: number; y: number; width: number; height: number } | undefined,
  bounds: RegionBounds,
): ValidatedRegion {
  if (!geometry) {
    throw new X11AdapterError('not-supported', 'region capture requires explicit OS-selected geometry');
  }
  const { x, y, width, height } = geometry;
  for (const [name, value] of [
    ['x', x],
    ['y', y],
    ['width', width],
    ['height', height],
  ] as const) {
    if (!Number.isFinite(value)) {
      throw new X11AdapterError('not-supported', `region geometry.${name} must be finite`);
    }
  }
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(width) || !Number.isInteger(height)) {
    throw new X11AdapterError('not-supported', 'region geometry must use integer pixels');
  }
  if (width <= 0 || height <= 0) {
    throw new X11AdapterError('not-supported', 'region selection has zero area');
  }
  if (x < 0 || y < 0 || x + width > bounds.width || y + height > bounds.height) {
    throw new X11AdapterError(
      'not-supported',
      `region ${width}x${height}+${x}+${y} exceeds display bounds ${bounds.width}x${bounds.height}`,
    );
  }
  return { x, y, width, height };
}

/** Crop a decoded full-display image to a validated region. */
export function cropImage(image: DecodedImage, region: ValidatedRegion): DecodedImage {
  const cropped = new Uint8Array(region.width * region.height * 4);
  for (let row = 0; row < region.height; row += 1) {
    const source = ((region.y + row) * image.width + region.x) * 4;
    cropped.set(image.rgba.slice(source, source + region.width * 4), row * region.width * 4);
  }
  return { width: region.width, height: region.height, rgba: cropped };
}

// ─── Per-scope backend checks (independent — never inferred) ────

export interface X11ScopeStatus {
  readonly usable: boolean;
  readonly reason: string;
}

export async function checkX11WindowBackend(
  env: X11ProbeEnvironment,
  options?: { seam?: X11FilesystemSeam; exec?: X11ExecFn; timeoutMs?: number },
): Promise<X11ScopeStatus> {
  const base = checkX11DisplayBackend(env, options?.seam);
  if (!base.usable) return { usable: false, reason: base.reason };
  const xwininfoPath = findX11Tool('xwininfo', env.PATH, options?.seam);
  if (!xwininfoPath) return { usable: false, reason: 'xwininfo not found on PATH — no window selection path' };
  return { usable: true, reason: `x11 window backend ready: click-select + verify on ${base.display}` };
}

export async function checkX11RegionBackend(
  env: X11ProbeEnvironment,
  options?: { seam?: X11FilesystemSeam; exec?: X11ExecFn; timeoutMs?: number },
): Promise<X11ScopeStatus> {
  const base = checkX11DisplayBackend(env, options?.seam);
  if (!base.usable) return { usable: false, reason: base.reason };
  const xwininfoPath = findX11Tool('xwininfo', env.PATH, options?.seam);
  if (!xwininfoPath) return { usable: false, reason: 'xwininfo not found on PATH — no bounds source for regions' };
  try {
    const bounds = await getDisplayBounds(base.display as string, {
      xwininfoPath,
      exec: options?.exec ?? defaultExec,
      timeoutMs: options?.timeoutMs ?? 10000,
    });
    return {
      usable: true,
      reason: `x11 region backend ready: explicit geometry within ${bounds.width}x${bounds.height}`,
    };
  } catch {
    return { usable: false, reason: `display ${base.display} bounds are unreadable — region capture disabled` };
  }
}

export interface DecodedImage {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

// ─── Minimal XWD decode (ZPixmap TrueColor/DirectColor, 24/32bpp) ─

function u32(view: DataView, offset: number, littleEndian: boolean): number {
  return view.getUint32(offset, littleEndian);
}

interface XwdHeader {
  littleEndian: boolean;
  pixmapFormat: number;
  depth: number;
  width: number;
  height: number;
  xoffset: number;
  byteOrderLsbFirst: boolean;
  bitsPerPixel: number;
  /** Byte step between consecutive pixels (differs from bpp/8 when padded). */
  pixelStep: number;
  bytesPerLine: number;
  visualClass: number;
  redMask: number;
  greenMask: number;
  blueMask: number;
  ncolors: number;
  headerSize: number;
}

/**
 * Read the XWD file header (xwd.h XWDFileHeader: header_size, file_version,
 * pixmap_format, depth, width, height, ...). Probe both endiannesses and
 * accept the reading with file_version 7 and sane geometry.
 */
function readHeader(bytes: Uint8Array): XwdHeader {
  if (bytes.length < 100) throw new X11AdapterError('decode-failed', 'XWD truncated before header');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  for (const littleEndian of [false, true]) {
    const headerSize = u32(view, 0, littleEndian);
    const fileVersion = u32(view, 4, littleEndian);
    const pixmapFormat = u32(view, 8, littleEndian);
    const depth = u32(view, 12, littleEndian);
    const width = u32(view, 16, littleEndian);
    const height = u32(view, 20, littleEndian);
    const bitsPerPixel = u32(view, 44, littleEndian);
    const bytesPerLine = u32(view, 48, littleEndian);
    if (
      fileVersion === 7 &&
      headerSize >= 100 &&
      pixmapFormat <= 2 &&
      depth >= 1 &&
      depth <= 32 &&
      width >= 1 &&
      width <= 32768 &&
      height >= 1 &&
      height <= 32768 &&
      bitsPerPixel >= 1 &&
      bitsPerPixel <= 32 &&
      bytesPerLine >= 1
    ) {
      const naturalStep = bitsPerPixel / 8;
      const strideStep = bytesPerLine % width === 0 ? bytesPerLine / width : 0;
      const pixelStep =
        strideStep >= naturalStep && strideStep <= 4 && Number.isInteger(strideStep) ? strideStep : naturalStep;
      return {
        littleEndian,
        pixmapFormat,
        depth,
        width,
        height,
        xoffset: u32(view, 24, littleEndian),
        byteOrderLsbFirst: u32(view, 28, littleEndian) === 0,
        bitsPerPixel,
        pixelStep,
        bytesPerLine,
        visualClass: u32(view, 52, littleEndian),
        redMask: u32(view, 56, littleEndian),
        greenMask: u32(view, 60, littleEndian),
        blueMask: u32(view, 64, littleEndian),
        ncolors: u32(view, 76, littleEndian),
        headerSize,
      };
    }
  }
  throw new X11AdapterError('decode-failed', 'XWD header is not a readable pixmap description');
}

function channelScale(mask: number): { shift: number; max: number } {
  let shift = 0;
  let m = mask >>> 0;
  while (m !== 0 && (m & 1) === 0) {
    shift += 1;
    m >>>= 1;
  }
  return { shift, max: m };
}

/**
 * Decode XWD bytes to RGBA. Supports the M3 envelope only: ZPixmap with
 * 24/32 bits per pixel on TrueColor (4) / DirectColor (5) visuals. Anything
 * else — XYBitmap, XYPixmap, palette visuals, odd depths — fails closed.
 */
export function decodeXwd(bytes: Uint8Array): DecodedImage {
  const header = readHeader(bytes);
  if (header.pixmapFormat !== 2) {
    throw new X11AdapterError('decode-failed', `XWD pixmap format ${header.pixmapFormat} unsupported (ZPixmap only)`);
  }
  if (header.bitsPerPixel !== 24 && header.bitsPerPixel !== 32) {
    throw new X11AdapterError('decode-failed', `XWD ${header.bitsPerPixel}bpp unsupported (24/32 only)`);
  }
  if (header.visualClass !== 4 && header.visualClass !== 5) {
    throw new X11AdapterError('decode-failed', `XWD visual class ${header.visualClass} needs a colormap path M3 omits`);
  }
  if (header.redMask === 0 || header.greenMask === 0 || header.blueMask === 0) {
    throw new X11AdapterError('decode-failed', 'XWD TrueColor masks are degenerate');
  }
  const dataOffset = header.headerSize + header.ncolors * 12;
  const needed = dataOffset + header.height * header.bytesPerLine;
  if (bytes.length < needed) {
    throw new X11AdapterError('decode-failed', 'XWD pixmap data is truncated');
  }
  const red = channelScale(header.redMask);
  const green = channelScale(header.greenMask);
  const blue = channelScale(header.blueMask);
  const rgba = new Uint8Array(header.width * header.height * 4);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  const readPixel = (offset: number): number => {
    if (header.pixelStep === 4) {
      return view.getUint32(offset, header.byteOrderLsbFirst);
    }
    const b0 = bytes[offset] as number;
    const b1 = bytes[offset + 1] as number;
    const b2 = bytes[offset + 2] as number;
    return header.byteOrderLsbFirst ? b0 + (b1 << 8) + (b2 << 16) : (b0 << 16) + (b1 << 8) + b2;
  };
  const maskChannel = (pixel: number, mask: number, shift: number, max: number): number =>
    max === 0 ? 0 : Math.min(255, Math.round(((((pixel >>> 0) & (mask >>> 0)) >>> shift) * 255) / max));
  for (let y = 0; y < header.height; y += 1) {
    for (let x = 0; x < header.width; x += 1) {
      const pixel = readPixel(dataOffset + y * header.bytesPerLine + (x + header.xoffset) * header.pixelStep);
      const o = (y * header.width + x) * 4;
      rgba[o] = maskChannel(pixel, header.redMask, red.shift, red.max);
      rgba[o + 1] = maskChannel(pixel, header.greenMask, green.shift, green.max);
      rgba[o + 2] = maskChannel(pixel, header.blueMask, blue.shift, blue.max);
      rgba[o + 3] = 255;
    }
  }
  return { width: header.width, height: header.height, rgba };
}

// ─── Minimal PNG encode (Node builtins only) ────────────────────

function crc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = crc32Table();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = (CRC_TABLE[(c ^ (bytes[i] as number)) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)])), 8 + data.length);
  return out;
}

/** Encode RGBA to PNG (8-bit, truecolor+alpha, filter-0 scanlines). */
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  if (rgba.length !== width * height * 4)
    throw new X11AdapterError('decode-failed', 'RGBA length mismatches dimensions');
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    raw[y * (1 + width * 4)] = 0;
    Buffer.from(rgba.slice(y * width * 4, (y + 1) * width * 4)).copy(raw, y * (1 + width * 4) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', new Uint8Array(ihdr)),
    chunk('IDAT', new Uint8Array(deflateSync(raw))),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

// ─── X11 display adapter (ScreenCapturePort) ────────────────────

export interface CaptureIngestInput {
  readonly bytes: Uint8Array;
  readonly kind: CaptureArtifactKind;
  readonly summary: string;
  readonly operation: string;
  readonly captureTarget: TargetScope;
}

/**
 * Ingest seam: the wiring layer supplies the real M2 `ingestCaptureBytes`
 * bound to a CAS (or a deterministic stub in tests). The adapter never
 * touches evidence storage directly.
 */
export type CaptureIngestFn = (input: CaptureIngestInput) => Promise<EvidenceBackedReference>;

export interface X11DisplayAdapterOptions {
  readonly xwdPath?: string;
  readonly xwininfoPath?: string;
  readonly timeoutMs?: number;
  readonly tmpRoot?: string;
  readonly producer?: string;
  readonly executionId?: string;
  /** Process environment override (tests inject DISPLAY/PATH without touching process.env). */
  readonly env?: X11ProbeEnvironment;
  /** Filesystem seam for backend checks + tool discovery. Defaults to node:fs. */
  readonly seam?: X11FilesystemSeam;
  /** Spawn seam (argv only, never a shell). Defaults to execFile. */
  readonly exec?: X11ExecFn;
  readonly ingest: CaptureIngestFn;
}

function runXwd(
  exec: X11ExecFn,
  xwdPath: string,
  args: readonly string[],
  outFile: string,
  timeoutMs: number,
): Promise<void> {
  return exec(xwdPath, [...args, '-out', outFile], { timeoutMs }).then(
    () => undefined,
    (error) => {
      throw error instanceof X11AdapterError
        ? error
        : new X11AdapterError('capture-failed', `xwd capture failed: ${(error as Error).message}`);
    },
  );
}

export class X11DisplayAdapter implements ScreenCapturePort {
  private readonly listeners = new Set<CaptureStateListener>();
  private lastState: CaptureState | undefined;

  constructor(private readonly options: X11DisplayAdapterOptions) {}

  private emit(id: string, from: CaptureState | undefined, to: CaptureState): void {
    if (from !== undefined) assertTransition(from, to);
    this.lastState = to;
    for (const listener of this.listeners) listener(id, to);
  }

  onStateChanged(listener: CaptureStateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async probe(): Promise<ScreenCaptureProbeResult> {
    const env = this.options.env ?? (process.env as X11ProbeEnvironment);
    const seam = this.options.seam;
    const displayBackend = checkX11DisplayBackend(env, seam);
    const windowBackend = await checkX11WindowBackend(env, { seam, exec: this.exec(), timeoutMs: this.timeout() });
    const regionBackend = await checkX11RegionBackend(env, { seam, exec: this.exec(), timeoutMs: this.timeout() });
    const statusFor = (scope: TargetScope): X11ScopeStatus => {
      if (scope === 'display') return { usable: displayBackend.usable, reason: displayBackend.reason };
      if (scope === 'window') return windowBackend;
      return regionBackend;
    };
    const capabilities: CaptureCapabilityStatus[] = (
      ['screenshot', 'recording'] as readonly CaptureOperation[]
    ).flatMap((operation) =>
      (['display', 'window', 'region'] as readonly TargetScope[]).map((scope) => {
        const status = statusFor(scope);
        const supported = operation === 'screenshot' && status.usable;
        return {
          operation,
          scope,
          supported,
          reason: operation === 'screenshot' ? status.reason : 'M3A: recording is not implemented',
        };
      }),
    );
    return probeScreenCaptureCapabilities(env, capabilities);
  }

  private requireSupportedTarget(target: CaptureTarget): { display: string; kind: TargetScope } {
    if (target.kind === 'display') {
      if (!isValidDisplayId(target.displayId)) {
        throw new X11AdapterError('not-supported', `display id '${target.displayId}' is not a local display`);
      }
      return { display: target.displayId, kind: 'display' };
    }
    if (target.kind === 'window') {
      if (!isValidWindowToken(target.windowToken)) {
        throw new X11AdapterError('not-supported', 'window capture needs an opaque OS-selected window token');
      }
      // Display affinity comes from the backend environment, never the token.
      const display = this.display();
      if (!display) throw new X11AdapterError('backend-unavailable', 'no valid X11 DISPLAY for window capture');
      return { display, kind: 'window' };
    }
    if (target.kind === 'region') {
      const display = this.display();
      if (!display) throw new X11AdapterError('backend-unavailable', 'no valid X11 DISPLAY for region capture');
      return { display, kind: 'region' };
    }
    throw new X11AdapterError('not-supported', 'M3A supports display, window, and region targets only');
  }

  private display(): string | null {
    const env = this.options.env ?? (process.env as X11ProbeEnvironment);
    const display = env.DISPLAY?.trim() ? env.DISPLAY.trim() : null;
    return display && isValidDisplayId(display) ? display : null;
  }

  private exec(): X11ExecFn {
    return this.options.exec ?? defaultExec;
  }

  private timeout(): number {
    return this.options.timeoutMs ?? 20000;
  }

  private tool(name: string): string {
    const env = this.options.env ?? (process.env as X11ProbeEnvironment);
    const override = name === 'xwd' ? this.options.xwdPath : this.options.xwininfoPath;
    if (override) return override;
    const found = findX11Tool(name, env.PATH, this.options.seam);
    if (!found) throw new X11AdapterError('backend-unavailable', `${name} not found on PATH`);
    return found;
  }

  async requestScreenshot(request: ScreenshotRequest): Promise<CaptureArtifact> {
    const captureId = `xcap-${Date.now()}`;
    assertScreenshotAuthorized(request);
    const { display, kind } = this.requireSupportedTarget(request.target);
    this.emit(captureId, undefined, 'REQUESTED');
    this.emit(captureId, 'REQUESTED', 'AUTHORIZED');

    const backend = checkX11DisplayBackend(this.options.env ?? (process.env as X11ProbeEnvironment), this.options.seam);
    if (!backend.usable) {
      this.emit(captureId, 'AUTHORIZED', 'FAILED');
      throw new X11AdapterError('backend-unavailable', backend.reason);
    }
    this.emit(captureId, 'AUTHORIZED', 'SELECTING');

    // SELECTING re-validates the OS selection: window existence, region
    // bounds. Display targets need no picker — the display IS the selection.
    const tools = { xwininfoPath: this.tool('xwininfo'), exec: this.exec(), timeoutMs: this.timeout() };
    let xwdArgs: readonly string[];
    let summaryScope: string;
    let validatedRegion: ValidatedRegion | undefined;
    if (kind === 'display') {
      xwdArgs = ['-silent', '-root', '-display', display];
      summaryScope = `display ${display}`;
    } else if (kind === 'window') {
      const token = (request.target as { windowToken: string }).windowToken;
      const selected = await verifyWindow(token, display, tools).catch((error) => {
        this.emit(captureId, 'SELECTING', 'FAILED');
        throw error;
      });
      xwdArgs = ['-silent', '-id', selected.windowId, '-display', display];
      summaryScope = `window ${selected.windowId}`;
    } else {
      const bounds = await getDisplayBounds(display, tools).catch((error) => {
        this.emit(captureId, 'SELECTING', 'FAILED');
        throw error;
      });
      try {
        validatedRegion =
          request.target.kind === 'region'
            ? validateRegionGeometry(request.target.geometry, bounds)
            : validateRegionGeometry(undefined, bounds);
      } catch (error) {
        this.emit(captureId, 'SELECTING', 'FAILED');
        throw error;
      }
      xwdArgs = ['-silent', '-root', '-display', display];
      summaryScope = `region ${validatedRegion.width}x${validatedRegion.height}+${validatedRegion.x}+${validatedRegion.y}`;
    }
    this.emit(captureId, 'SELECTING', 'CAPTURING');

    const tmpDir = fs.mkdtempSync(path.join(this.options.tmpRoot ?? os.tmpdir(), 'vestara-capture-'));
    const outFile = path.join(tmpDir, 'capture.xwd');
    try {
      await runXwd(this.exec(), this.tool('xwd'), xwdArgs, outFile, this.timeout());
      const xwdBytes = new Uint8Array(fs.readFileSync(outFile));
      this.emit(captureId, 'CAPTURING', 'FINALIZING');
      const decoded = decodeXwd(xwdBytes);
      const framed = validatedRegion ? cropImage(decoded, validatedRegion) : decoded;
      const pngBytes = new Uint8Array(encodePng(framed.width, framed.height, framed.rgba));
      const reference = await this.options.ingest({
        bytes: pngBytes,
        kind: 'screenshot',
        summary: `screenshot: ${summaryScope}`,
        operation: `screenshot:${kind}:${display}`,
        captureTarget: kind,
      });
      const { artifact } = fromEvidenceReference(
        {
          ...reference,
          producer: this.options.producer ?? 'screen-capture-x11',
          capturedAt: new Date().toISOString(),
        },
        { captureTarget: kind },
      );
      this.emit(captureId, 'FINALIZING', 'COMPLETED');
      return artifact;
    } catch (error) {
      if (this.lastState === 'CAPTURING' || this.lastState === 'FINALIZING') {
        try {
          this.emit(captureId, this.lastState, 'FAILED');
        } catch {
          // transition bookkeeping must never mask the root failure
        }
      }
      throw error;
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  async startRecording(request: RecordingRequest): Promise<never> {
    validateRecordingRequest(request);
    throw new X11AdapterError('not-supported', 'M3 does not implement recording');
  }

  async stopRecording(): Promise<never> {
    throw new X11AdapterError('not-supported', 'M3 does not implement recording');
  }

  async cancel(): Promise<never> {
    throw new X11AdapterError('not-supported', 'M3 tracks no cancellable handles');
  }
}
