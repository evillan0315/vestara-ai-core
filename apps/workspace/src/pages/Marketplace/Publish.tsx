/**
 * Marketplace Premium Gallery (v7.14) — Publish.
 *
 * Premium form with validation, glass panel, and published receipt.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button } from '@vestara/ui';
import type { MarketplaceOperationDto, MarketplacePublishResult } from '../../lib/marketplace.js';
import { marketplaceClient } from '../../lib/marketplace.js';
import {
  DetailCard,
  InsightBanner,
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

  const valid = sourcePath.trim().length > 0;

  return (
    <MarketplacePage
      title="Publish"
      description="Publish a package directory into the marketplace — validated, content-addressed, optionally signed, and indexed."
    >
      <MarketplaceSection title="Add a product">
        <div className="mpg-card mpg-hairline-top space-y-4 p-5">
          <div className="relative z-[2] space-y-4">
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
              {!valid && (
                <span className="mt-1 block text-xs text-[var(--vestara-text-muted,var(--color-zinc-400))]">
                  Enter the absolute path to a directory containing vestara-package.json.
                </span>
              )}
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
            <Button variant="primary" size="md" loading={busy} disabled={!valid} onClick={() => void publish()}>
              {busy ? 'Publishing…' : 'Publish to marketplace'}
            </Button>
          </div>
        </div>
      </MarketplaceSection>

      {error && <InsightBanner severity="error" description={error} />}

      {operation && operation.status === 'failed' && (
        <InsightBanner severity="error" description={`Publish failed: ${operation.error?.message}`} />
      )}

      {published && (
        <MarketplaceSection title="Published">
          <DetailCard title="Published package">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success" size="md">
                published
              </Badge>
              <span className="font-mono text-sm font-medium text-zinc-100">
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
          </DetailCard>
        </MarketplaceSection>
      )}
    </MarketplacePage>
  );
}
