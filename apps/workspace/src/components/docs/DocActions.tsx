/**
 * Document action toolbar.
 *
 * Quick buttons (favorite, pin, print, ask AI) plus an overflow menu with
 * copy link / markdown / path, view raw, and open source (GitHub).
 */

import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import BookmarkBorderRoundedIcon from '@mui/icons-material/BookmarkBorderRounded';
import BookmarkRoundedIcon from '@mui/icons-material/BookmarkRounded';
import PrintRoundedIcon from '@mui/icons-material/PrintRounded';
import PushPinRoundedIcon from '@mui/icons-material/PushPinRounded';
import ArtifactActionsMenu from '../artifacts/ArtifactActionsMenu';
import { inspectEntity } from '../graph/GraphContext';
import { copyToClipboard } from '../../lib/platform';

interface DocActionsProps {
  docPath: string | null;
  hasContent: boolean;
  rawContent: string;
  isFavorite: boolean;
  isPinned: boolean;
  remoteUrl: string | null;
  onToggleFavorite: () => void;
  onTogglePin: () => void;
  onViewRaw: () => void;
  onAskAi: () => void;
}

async function copyText(text: string): Promise<void> {
  try {
    await copyToClipboard(text);
  } catch {
    /* clipboard unavailable */
  }
}

export function DocActions({
  docPath,
  hasContent,
  rawContent,
  isFavorite,
  isPinned,
  remoteUrl,
  onToggleFavorite,
  onTogglePin,
  onViewRaw,
  onAskAi,
}: DocActionsProps) {
  const disabled = !hasContent || !docPath;

  const copyLink = () => {
    if (!docPath) return;
    void copyText(`${window.location.origin}${window.location.pathname}?path=${encodeURIComponent(docPath)}`);
  };

  const openSource = () => {
    if (!remoteUrl || !docPath) return;
    window.open(`${remoteUrl}/blob/main/${docPath}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="doc-actions">
      <button
        type="button"
        className="doc-action-btn"
        onClick={onToggleFavorite}
        aria-label="Favorite"
        title="Favorite"
      >
        {isFavorite ? (
          <BookmarkRoundedIcon fontSize="inherit" className="text-(--vestara-accent)" />
        ) : (
          <BookmarkBorderRoundedIcon fontSize="inherit" />
        )}
      </button>
      <button
        type="button"
        className={`doc-action-btn ${isPinned ? 'doc-action-btn-active' : ''}`}
        onClick={onTogglePin}
        aria-label="Pin"
        title="Pin"
      >
        <PushPinRoundedIcon fontSize="inherit" />
      </button>
      <button
        type="button"
        className="doc-action-btn"
        onClick={onAskAi}
        aria-label="Ask AI"
        title="Ask AI about this document"
      >
        <AutoAwesomeRoundedIcon fontSize="inherit" className="text-(--vestara-accent)" />
      </button>
      <button type="button" className="doc-action-btn" onClick={() => window.print()} aria-label="Print" title="Print">
        <PrintRoundedIcon fontSize="inherit" />
      </button>
      <ArtifactActionsMenu
        actions={[
          {
            id: 'copy-link',
            label: 'Copy link',
            disabled,
            onClick: copyLink,
          },
          {
            id: 'copy-markdown',
            label: 'Copy markdown',
            disabled,
            onClick: () => void copyText(rawContent),
          },
          {
            id: 'copy-path',
            label: 'Copy path',
            disabled,
            onClick: () => {
              if (docPath) void copyText(docPath);
            },
          },
          { id: 'divider-1', label: '', divider: true, disabled: true, onClick: () => {} },
          {
            id: 'view-raw',
            label: 'View raw markdown',
            disabled,
            onClick: onViewRaw,
          },
          {
            id: 'open-source',
            label: 'Open source',
            disabled: !remoteUrl || !docPath,
            onClick: openSource,
          },
          { id: 'divider-2', label: '', divider: true, disabled: true, onClick: () => {} },
          {
            id: 'inspect',
            label: 'Open in Engineering Graph',
            disabled: !docPath,
            onClick: () => {
              if (docPath) inspectEntity(`document://${docPath}`);
            },
          },
        ]}
      />
    </div>
  );
}
