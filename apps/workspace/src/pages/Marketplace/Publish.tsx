/**
 * VES-DESIGN-004A: Publish — Package Publishing Surface
 *
 * Migrated to reusable Marketplace composition.
 * Preserves publish workflow, signing, and result display.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { MarketplaceOperationDto, MarketplacePublishResult } from '../../lib/marketplace.js';
import { marketplaceClient } from '../../lib/marketplace.js';
import {
  MarketplaceErrorState,
  MarketplacePage,
  MarketplaceSection,
} from './MarketplaceLayout-components.js';

export default function Publish() {
  const [sourcePath, setSourcePath] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [operation, setOperation] = useState<MarketplaceOperationDto | null>(null);
  const [published, setPublished] = useState<MarketplacePublishResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const publish = async () => {
    setBusy(true);
    setError(null);
    setOperation(null);
    setPublished(null);
    try {
      const result = await marketplaceClient.publish({ sourcePath: sourcePath.trim(), key: key.trim() || undefined });
      setOperation(result);
      if (result.status === 'completed' && result.published) setPublished(result.published);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Publish failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <MarketplacePage
      title="Publish"
      description="Publish a package directory into the marketplace — validated, content-addressed, optionally signed, and indexed."
    >
      <MarketplaceSection title="Add a product">
        <div className="rounded-xl border border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] bg-[var(--vestara-color-surface,var(--color-zinc-900))] p-5 space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-[var(--vestara-text-muted,var(--color-zinc-400))]">
              Package directory path
            </span>
            <input
              className="mt-1 w-full rounded-md border border-[var(--vestara-color-border-subtle,var(--color-zinc-700))] bg-[var(--vestara-color-bg-workspace,var(--color-zinc-950))] px-3 py-2 font-mono text-sm"
              placeholder="/path/to/package (contains vestara-package.json)"
              value={sourcePath}
              onChange={(event) => setSourcePath(event.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-[var(--vestara-text-muted,var(--color-zinc-400))]">
              Ed25519 signing key (PEM, optional)
            </span>
            <textarea
              className="mt-1 w-full rounded-md border border-[var(--vestara-color-border-subtle,var(--color-zinc-700))] bg-[var(--vestara-color-bg-workspace,var(--color-zinc-950))] px-3 py-2 font-mono text-sm"
              rows={4}
              placeholder="-----BEGIN PRIVATE KEY-----"
              value={key}
              onChange={(event) => setKey(event.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={() => void publish()}
            className="rounded-md bg-[var(--vestara-accent,var(--color-sky-600))] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy || !sourcePath.trim()}
          >
            {busy ? 'Publishing…' : 'Publish to marketplace'}
          </button>
        </div>
      </MarketplaceSection>

      {error && <MarketplaceErrorState message={error} />}

      {operation && operation.status === 'failed' && (
        <div className="rounded-lg border border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          Publish failed: {operation.error?.message}
        </div>
      )}

      {published && (
        <MarketplaceSection title="Published">
          <div className="rounded-xl border border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] bg-[var(--vestara-color-surface,var(--color-zinc-900))] p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-800 px-2 py-0.5 text-xs text-emerald-300">
                published
              </span>
              <span className="text-sm font-medium text-zinc-100">
                {published.publisherId}/{published.packageName}@{published.version}
              </span>
              <span className="text-xs text-[var(--vestara-text-muted,var(--color-zinc-400))]">
                {published.signed ? (published.signatureValid ? 'signed ✓' : 'signature invalid') : 'unsigned'}
              </span>
            </div>
            <dl className="mt-3 space-y-1 font-mono text-xs">
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-[var(--vestara-text-muted,var(--color-zinc-400))]">digest</dt>
                <dd className="break-all text-zinc-300">{published.digest}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-[var(--vestara-text-muted,var(--color-zinc-400))]">registered</dt>
                <dd className="break-all text-zinc-300">{published.targetPath}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-[var(--vestara-text-muted,var(--color-zinc-400))]">published</dt>
                <dd className="text-zinc-300">{new Date(published.publishedAt).toLocaleString()}</dd>
              </div>
            </dl>
            <div className="mt-3">
              <Link to="/marketplace" className="text-sm text-sky-400 hover:underline">
                View in Discover →
              </Link>
            </div>
          </div>
        </MarketplaceSection>
      )}
    </MarketplacePage>
  );
}
