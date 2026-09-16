/**
 * HTTP content-encoding negotiation + bounded compression.
 *
 * Shared by the JSON response helper and the static UI asset server so both
 * apply one policy: brotli preferred, gzip fallback, identity below the size
 * threshold, and a hard guarantee that compression failure never fails a
 * request.
 */

import { brotliCompress, gzip, constants as zlibConstants } from 'node:zlib';

export type ContentEncoding = 'br' | 'gzip';

/** Bodies below this size are sent identity: compression overhead is not worth it. */
export const COMPRESSION_MIN_BYTES = 1024;

/** Brotli quality 4 balances ratio against CPU on multi-hundred-KB bodies. */
const BROTLI_OPTIONS = { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 } };

/**
 * Pick the best client-accepted encoding, honouring `q=0` rejections.
 * Returns null when the client accepts neither br nor gzip.
 */
export function negotiateEncoding(header: string | undefined): ContentEncoding | null {
  if (!header) return null;
  const accepted = new Map<string, number>();
  for (const part of header.split(',')) {
    const [name, ...params] = part.trim().toLowerCase().split(';');
    if (!name) continue;
    let quality = 1;
    for (const param of params) {
      const match = /^\s*q\s*=\s*([0-9.]+)\s*$/.exec(param);
      if (match) quality = Number(match[1]);
    }
    accepted.set(name, quality);
  }
  if ((accepted.get('br') ?? 0) > 0) return 'br';
  if ((accepted.get('gzip') ?? 0) > 0) return 'gzip';
  return null;
}

/** Compress `input`; rejects on failure so callers can fall back to identity. */
export function compressBuffer(input: Buffer, encoding: ContentEncoding): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const done = (error: Error | null, payload?: Buffer): void => {
      if (error || !payload) {
        reject(error ?? new Error('compression produced no output'));
        return;
      }
      resolve(payload);
    };
    if (encoding === 'br') {
      brotliCompress(input, BROTLI_OPTIONS, done);
    } else {
      gzip(input, done);
    }
  });
}
