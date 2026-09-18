/**
 * File Preview Component
 *
 * Renders appropriate preview for images, video, audio, text/code, and unsupported files.
 * Uses browser-native capabilities — no transcoding, no thumbnail services, no media databases.
 *
 * Architecture Traceability:
 *   FILES-ASSETS-001: Assets, Media Preview & Reusable Code Viewer/Editor
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, EmptyState, Pill } from '@vestara/ui';
import { CodeEditor, CodeViewer } from './CodeEditor';
import { classifyFile, type FileClassification, type FilePreviewType } from '../file-classification';

interface FilePreviewProps {
  /** File path (workspace-relative) */
  filePath: string;
  /** File classification */
  classification: FileClassification;
  /** File content (for text files) */
  content?: string;
  /** Base64 content (for binary files) */
  contentBase64?: string;
  /** File size in bytes */
  size: number;
  /** Read-only mode */
  readOnly?: boolean;
  /** Called when text content is saved */
  onSave?: (newContent: string) => void;
  /** Called when dirty state changes */
  onDirtyChange?: (dirty: boolean) => void;
  /** Called with the live draft text (F-E-2 per-tab draft isolation). */
  onDraftChange?: (draft: string) => void;
  /** Called with 1-based cursor line/column in edit mode (F-E-3). */
  onCursorChange?: (line: number, column: number) => void;
  /** Error message if loading failed */
  error?: string | null;
  /** Loading state */
  isLoading?: boolean;
}

const MAX_PREVIEW_SIZE = 5 * 1024 * 1024; // 5 MB

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

export function FilePreview({
  filePath,
  classification,
  content,
  contentBase64,
  size,
  readOnly = false,
  onSave,
  onDirtyChange,
  onDraftChange,
  onCursorChange,
  error,
  isLoading,
}: FilePreviewProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const previewType = classification.previewType;
  const mimeType = classification.mimeType;
  const isText = previewType === 'text';
  const isImage = previewType === 'image';
  const isVideo = previewType === 'video';
  const isAudio = previewType === 'audio';
  const isUnsupported = previewType === 'unsupported';

  // Generate data URL for binary previews (images, video, audio)
  useEffect(() => {
    if ((isImage || isVideo || isAudio) && contentBase64 && !dataUrl) {
      try {
        const blob = base64ToBlob(contentBase64, mimeType);
        const url = URL.createObjectURL(blob);
        setDataUrl(url);
        return () => URL.revokeObjectURL(url);
      } catch {
        setVideoError('Failed to load preview');
      }
    }
  }, [contentBase64, mimeType, isImage, isVideo, isAudio, dataUrl]);

  // Handle video/audio errors
  const handleMediaError = useCallback((e: React.SyntheticEvent<HTMLMediaElement>) => {
    const target = e.currentTarget;
    setVideoError(`Unable to play: ${target.error?.message || 'Unsupported format or codec'}`);
  }, []);

  // Handle image errors
  const handleImageError = useCallback(() => {
    setVideoError('Unable to load image: Unsupported format or corrupted file');
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div className="file-preview min-w-0 flex flex-col min-h-0">
        <div className="p-8 text-center">
          <div className="mpg-skeleton h-8 w-48 mx-auto mb-4" />
          <p className="text-sm text-[var(--vestara-text-muted)]">Loading preview…</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="file-preview min-w-0 flex flex-col min-h-0">
        <div className="p-6">
          <EmptyState
            title="Unable to load preview"
            description={error}
            icon="⚠"
          />
          <div className="mt-3 text-xs text-[var(--vestara-text-muted)] font-mono">{filePath}</div>
        </div>
      </div>
    );
  }

  // Unsupported file type
  if (isUnsupported) {
    return (
      <div className="file-preview min-w-0 flex flex-col min-h-0">
        <div className="p-6">
          <EmptyState
            title="Preview not available"
            description={`File type "${mimeType || 'unknown'}" cannot be previewed in the browser.`}
            icon="📄"
          />
          <div className="mt-3 space-y-1 text-xs text-[var(--vestara-text-muted)]">
            <div className="font-mono">{filePath}</div>
            <div>Size: {formatBytes(size)}</div>
            <div>Type: {mimeType || 'unknown'}</div>
          </div>
        </div>
      </div>
    );
  }

  // File too large for preview
  if (size > MAX_PREVIEW_SIZE) {
    return (
      <div className="file-preview min-w-0 flex flex-col min-h-0">
        <div className="p-6">
          <EmptyState
            title="File too large for preview"
            description={`File size (${formatBytes(size)}) exceeds the ${formatBytes(MAX_PREVIEW_SIZE)} preview limit.`}
            icon="📦"
          />
          <div className="mt-3 space-y-1 text-xs text-[var(--vestara-text-muted)]">
            <div className="font-mono">{filePath}</div>
            <div>Type: {mimeType}</div>
          </div>
        </div>
      </div>
    );
  }

  // Text/Code preview with editor
  if (isText && content !== undefined) {
    return (
      <div className="file-preview min-w-0 flex flex-col min-h-0">
        {readOnly ? (
          <CodeViewer filePath={filePath} content={content} classification={classification} />
        ) : (
          <CodeEditor
            filePath={filePath}
            content={content}
            classification={classification}
            onSave={onSave}
            onDirtyChange={onDirtyChange}
            onDraftChange={onDraftChange}
            onCursorChange={onCursorChange}
            readOnly={readOnly}
          />
        )}
      </div>
    );
  }

  // Image preview
  if (isImage && dataUrl) {
    return (
      <div className="file-preview min-w-0 flex flex-col min-h-0">
        <div className="p-0">
          <div className="relative overflow-auto max-h-[70vh] bg-[var(--vestara-surface-canvas)]">
            <img
              ref={imgRef}
              src={dataUrl}
              alt={filePath}
              className="block max-w-full max-h-[70vh] mx-auto"
              onError={handleImageError}
              style={{ imageRendering: 'auto' }}
            />
            {videoError && (
              <div className="absolute inset-0 flex items-center justify-center p-4 bg-[var(--vestara-surface-panel)]">
                <EmptyState title="Image load failed" description={videoError} icon="🖼" />
              </div>
            )}
          </div>
          <div className="px-4 py-2 border-t border-[var(--vestara-border-subtle)] flex items-center justify-between text-xs text-[var(--vestara-text-muted)]">
            <span className="font-mono truncate max-w-[200px]" title={filePath}>{filePath}</span>
            <div className="flex items-center gap-3">
              <Pill  className="text-[var(--vestara-text-secondary)]">
                {mimeType}
              </Pill>
              <span>{formatBytes(size)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Video preview
  if (isVideo && dataUrl) {
    return (
      <div className="file-preview min-w-0 flex flex-col min-h-0">
        <div className="p-0">
          <div className="relative overflow-auto max-h-[70vh] bg-[var(--vestara-surface-canvas)]">
            <video
              ref={videoRef}
              src={dataUrl}
              controls
              className="block max-w-full max-h-[70vh] mx-auto"
              onError={handleMediaError}
              preload="metadata"
            >
              Your browser does not support the video tag.
            </video>
            {videoError && (
              <div className="absolute inset-0 flex items-center justify-center p-4 bg-[var(--vestara-surface-panel)]">
                <EmptyState title="Video playback failed" description={videoError} icon="🎬" />
              </div>
            )}
          </div>
          <div className="px-4 py-2 border-t border-[var(--vestara-border-subtle)] flex items-center justify-between text-xs text-[var(--vestara-text-muted)]">
            <span className="font-mono truncate max-w-[200px]" title={filePath}>{filePath}</span>
            <div className="flex items-center gap-3">
              <Pill  className="text-[var(--vestara-text-secondary)]">
                {mimeType}
              </Pill>
              <span>{formatBytes(size)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Audio preview
  if (isAudio && dataUrl) {
    return (
      <div className="file-preview min-w-0 flex flex-col min-h-0">
        <div className="p-4">
          <div className="space-y-3">
            <audio ref={audioRef} src={dataUrl} controls onError={handleMediaError} preload="metadata" />
            {videoError && <p className="text-sm text-[var(--vestara-status-error)]">{videoError}</p>}
            <div className="flex items-center justify-between text-xs text-[var(--vestara-text-muted)]">
              <span className="font-mono truncate max-w-[200px]" title={filePath}>{filePath}</span>
              <div className="flex items-center gap-3">
                <Pill  className="text-[var(--vestara-text-secondary)]">
                  {mimeType}
                </Pill>
                <span>{formatBytes(size)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Fallback for binary types without base64 content
  return (
    <div className="file-preview min-w-0 flex flex-col min-h-0">
      <div className="p-6">
        <EmptyState
          title="Preview unavailable"
          description={isText ? 'File content could not be loaded.' : 'Binary preview requires file content.'}
          icon="📄"
        />
        <div className="mt-3 space-y-1 text-xs text-[var(--vestara-text-muted)]">
          <div className="font-mono">{filePath}</div>
          <div>Size: {formatBytes(size)}</div>
          <div>Type: {mimeType}</div>
        </div>
      </div>
    </div>
  );
}

/** Minimal preview card for list/grid views */
export function FilePreviewCard({
  filePath,
  classification,
  size,
}: Pick<FilePreviewProps, 'filePath' | 'classification' | 'size'>) {
  const previewType = classification.previewType;
  const isPreviewable = classification.isPreviewable;

  const typeIcons: Record<FilePreviewType, string> = {
    image: '🖼',
    video: '🎬',
    audio: '🎵',
    text: '📝',
    unsupported: '📄',
  };

  const typeLabels: Record<FilePreviewType, string> = {
    image: 'Image',
    video: 'Video',
    audio: 'Audio',
    text: 'Text',
    unsupported: 'Binary',
  };

  return (
    <Card className="file-preview-card min-w-0 p-3">
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0" aria-hidden="true">{typeIcons[previewType]}</span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm truncate" title={filePath}>{filePath}</p>
          <div className="flex items-center gap-2 mt-1 text-xs text-[var(--vestara-text-muted)]">
            <Pill  size="sm" className="text-[var(--vestara-text-secondary)]">
              {typeLabels[previewType]}
            </Pill>
            {classification.languageHint && (
            <Pill  size="sm" className="text-[var(--vestara-text-secondary)]">
                {classification.languageHint}
              </Pill>
            )}
            <span className="tabular-nums">{formatBytes(size)}</span>
          </div>
          {!isPreviewable && (
            <p className="mt-1 text-xs text-[var(--vestara-status-warning)]">
              Preview not available
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}