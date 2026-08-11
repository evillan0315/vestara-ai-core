import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { MarketplaceOperationDto, MarketplacePublishResult } from '../../lib/marketplace.js';
import { marketplaceClient } from '../../lib/marketplace.js';
import { buttonPrimary, chip, input, muted, panel } from './styles.js';

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
    <div className="space-y-4">
      <div className={`${panel} p-4`}>
        <h2 className="text-sm font-semibold">Add a product</h2>
        <p className={`mt-1 text-sm ${muted}`}>
          Publish a package directory into the marketplace: it is validated, content-addressed, optionally signed,
          registered into the marketplace root, and indexed on the next scan.
        </p>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className={`text-xs ${muted}`}>Package directory path</span>
            <input
              className={`${input} mt-1 font-mono`}
              placeholder="/path/to/package (contains vestara-package.json)"
              value={sourcePath}
              onChange={(event) => setSourcePath(event.target.value)}
            />
          </label>
          <label className="block">
            <span className={`text-xs ${muted}`}>Ed25519 signing key (PEM, optional)</span>
            <textarea
              className={`${input} mt-1 font-mono`}
              rows={4}
              placeholder="-----BEGIN PRIVATE KEY-----"
              value={key}
              onChange={(event) => setKey(event.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={() => void publish()}
            className={buttonPrimary}
            disabled={busy || !sourcePath.trim()}
          >
            {busy ? 'Publishing…' : 'Publish to marketplace'}
          </button>
        </div>
      </div>

      {error && <div className="text-sm text-red-300">{error}</div>}

      {operation && operation.status === 'failed' && (
        <div className="rounded-md border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          Publish failed: {operation.error?.message}
        </div>
      )}

      {published && (
        <div className={`${panel} p-4`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`${chip} text-emerald-300`}>published</span>
            <span className="text-sm font-medium">
              {published.publisherId}/{published.packageName}@{published.version}
            </span>
            <span className={`text-xs ${muted}`}>
              {published.signed ? (published.signatureValid ? 'signed ✓' : 'signature invalid') : 'unsigned'}
            </span>
          </div>
          <dl className="mt-3 space-y-1 font-mono text-xs">
            <div className="flex gap-2">
              <dt className={`w-24 shrink-0 ${muted}`}>digest</dt>
              <dd className="break-all">{published.digest}</dd>
            </div>
            <div className="flex gap-2">
              <dt className={`w-24 shrink-0 ${muted}`}>registered</dt>
              <dd className="break-all">{published.targetPath}</dd>
            </div>
            <div className="flex gap-2">
              <dt className={`w-24 shrink-0 ${muted}`}>published</dt>
              <dd>{new Date(published.publishedAt).toLocaleString()}</dd>
            </div>
          </dl>
          <div className="mt-3">
            <Link to="/marketplace" className="text-sm text-sky-400 hover:underline">
              View in Discover →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
