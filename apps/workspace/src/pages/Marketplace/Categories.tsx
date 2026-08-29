import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MarketplaceAsset } from '../../lib/marketplace.js';
import { marketplaceClient } from '../../lib/marketplace.js';
import { chip, muted, panel } from './styles.js';

export default function Categories() {
  const [categories, setCategories] = useState<Array<{ name: string; assetCount: number }>>([]);
  const [assets, setAssets] = useState<MarketplaceAsset[]>([]);
  const [selected, setSelected] = useState<string>('');

  useEffect(() => {
    Promise.all([marketplaceClient.categories(), marketplaceClient.listAssets()])
      .then(([categoryList, assetList]) => {
        setCategories(categoryList);
        setAssets(assetList);
      })
      .catch(() => {});
  }, []);

  const visible = selected ? assets.filter((asset) => asset.type === selected) : assets;

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside className={`${panel} h-fit p-3`}>
        <div className="px-2 pb-2 text-sm font-semibold">Categories</div>
        {categories.length === 0 && <div className={`px-2 text-sm ${muted}`}>No categories yet.</div>}
        {categories.map((category) => (
          <button
            type="button"
            key={category.name}
            onClick={() => setSelected(category.name === selected ? '' : category.name)}
            className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm ${category.name === selected ? 'bg-sky-900/40 text-sky-300' : `hover:bg-zinc-800 ${muted}`}`}
          >
            <span>{category.name}</span>
            <span className={`${chip} ${muted}`}>{category.assetCount}</span>
          </button>
        ))}
      </aside>
      <section>
        {selected && (
          <div className={`mb-3 text-sm ${muted}`}>
            {selected} — {visible.length} asset(s)
          </div>
        )}
        {visible.length === 0 ? (
          <div className={`${panel} p-8 text-center text-sm ${muted}`}>No assets in this category.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((asset) => (
              <Link
                key={asset.id}
                to={`/marketplace/assets/${encodeURIComponent(asset.publisherId)}/${encodeURIComponent(asset.packageName)}`}
                className={`${panel} block p-4 transition hover:border-sky-700`}
              >
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{asset.displayName}</span>
                  <span className={`${chip} ${muted}`}>{asset.type}</span>
                </div>
                <p className={`mt-1 line-clamp-2 text-sm ${muted}`}>{asset.summary}</p>
                <div className={`mt-2 text-xs ${muted}`}>v{asset.latestVersion}</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
