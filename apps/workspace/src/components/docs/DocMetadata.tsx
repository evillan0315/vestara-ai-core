/**
 * Document metadata header card.
 *
 * Renders frontmatter (title, description, status, version, category,
 * author, updated, tags) as an elegant summary above the markdown body.
 */

import type { Frontmatter } from './frontmatter';
import { metaList, metaString } from './frontmatter';

interface DocMetadataProps {
  fileName: string;
  path: string;
  fm: Frontmatter;
  onTagClick: (tag: string) => void;
}

function Badge({ label, tone }: { label: string; tone?: string }) {
  return <span className={`doc-meta-badge doc-meta-badge-${tone ?? 'default'}`}>{label}</span>;
}

export function DocMetadata({ fileName, path, fm, onTagClick }: DocMetadataProps) {
  const meta = fm.meta;
  const title = metaString(meta, 'title') || fileName.replace(/\.(md|mdx|markdown)$/i, '');
  const description = metaString(meta, 'description');
  const status = metaString(meta, 'status');
  const version = metaString(meta, 'version');
  const category = metaString(meta, 'category');
  const author = metaString(meta, 'author');
  const updated = metaString(meta, 'updated') || metaString(meta, 'date');
  const tags = metaList(meta, 'tags');

  return (
    <header className="doc-metadata">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="doc-title">{title}</h1>
          {description && <p className="doc-description">{description}</p>}
          {(status || version || category) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {status && <Badge label={status} tone="status" />}
              {version && <Badge label={`v${version}`} tone="version" />}
              {category && <Badge label={category} tone="category" />}
            </div>
          )}
        </div>
        <code className="doc-path">{path}</code>
      </div>

      {(author || updated || tags.length > 0) && (
        <div className="doc-meta-grid">
          {author && (
            <div className="doc-meta-item">
              <span className="doc-meta-key">Author</span>
              <span className="doc-meta-value">{author}</span>
            </div>
          )}
          {updated && (
            <div className="doc-meta-item">
              <span className="doc-meta-key">Updated</span>
              <span className="doc-meta-value">{updated}</span>
            </div>
          )}
          {tags.length > 0 && (
            <div className="doc-meta-item doc-meta-tags">
              <span className="doc-meta-key">Tags</span>
              <div className="flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <button key={tag} type="button" className="doc-tag" onClick={() => onTagClick(tag)}>
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
