/**
 * File Classification Utility
 *
 * MIME-based file type detection for preview/editor routing.
 * Does not rely solely on filename extensions — uses MIME type from API.
 *
 * Architecture Traceability:
 *   FILES-ASSETS-001: Assets, Media Preview & Reusable Code Viewer/Editor
 */

export type FilePreviewType = 'image' | 'video' | 'audio' | 'text' | 'unsupported';

export interface FileClassification {
  readonly previewType: FilePreviewType;
  readonly mimeType: string;
  readonly isEditable: boolean;
  readonly isPreviewable: boolean;
  readonly languageHint?: string;
}

/** Known text/code MIME types that support syntax highlighting */
const TEXT_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/javascript',
  'text/typescript',
  'text/css',
  'text/html',
  'text/xml',
  'text/yaml',
  'text/x-python',
  'text/x-rust',
  'text/x-go',
  'text/x-java',
  'text/x-cpp',
  'text/x-c',
  'text/x-shellscript',
  'text/x-sql',
  'text/x-graphql',
  'application/json',
  'application/xml',
  'application/javascript',
  'application/typescript',
  'application/x-yaml',
  'application/toml',
]);

/** Known image MIME types */
const IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'image/x-icon',
  'image/tiff',
  'image/avif',
]);

/** Known video MIME types */
const VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
]);

/** Known audio MIME types */
const AUDIO_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/flac',
  'audio/mp4',
]);

/** Extension to language hint mapping for syntax highlighting */
const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'sass',
  '.less': 'less',
  '.html': 'html',
  '.htm': 'html',
  '.xml': 'xml',
  '.svg': 'xml',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.cpp': 'cpp',
  '.c': 'c',
  '.h': 'c',
  '.hpp': 'cpp',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.fish': 'fish',
  '.toml': 'toml',
  '.ini': 'ini',
  '.cfg': 'ini',
  '.conf': 'ini',
  '.dockerfile': 'dockerfile',
  '.sql': 'sql',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.proto': 'protobuf',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.astro': 'astro',
};

/**
 * Classify a file by its MIME type and path for preview/editor routing.
 * Does NOT rely solely on filename extension — MIME type from API is primary.
 */
export function classifyFile(mimeType: string, filePath: string): FileClassification {
  const normalizedMime = mimeType.toLowerCase();
  const ext = filePath.toLowerCase().slice(filePath.lastIndexOf('.'));

  let previewType: FilePreviewType;
  let isEditable = false;
  let isPreviewable = false;
  let languageHint: string | undefined;

  if (IMAGE_MIME_TYPES.has(normalizedMime)) {
    previewType = 'image';
    isPreviewable = true;
  } else if (VIDEO_MIME_TYPES.has(normalizedMime)) {
    previewType = 'video';
    isPreviewable = true;
  } else if (AUDIO_MIME_TYPES.has(normalizedMime)) {
    previewType = 'audio';
    isPreviewable = true;
  } else if (TEXT_MIME_TYPES.has(normalizedMime) || normalizedMime.startsWith('text/')) {
    previewType = 'text';
    isPreviewable = true;
    isEditable = true;
    languageHint = EXTENSION_LANGUAGE_MAP[ext] || normalizedMime.replace('text/', '').replace('application/', '');
  } else {
    previewType = 'unsupported';
  }

  return {
    previewType,
    mimeType: normalizedMime,
    isEditable,
    isPreviewable,
    languageHint,
  };
}

/**
 * Get the highlight.js language alias for a given language hint.
 * highlight.js uses specific aliases — map our hints to them.
 */
export function getHighlightLanguage(languageHint?: string): string | undefined {
  if (!languageHint) return undefined;

  const aliasMap: Record<string, string> = {
    javascript: 'javascript',
    typescript: 'typescript',
    js: 'javascript',
    ts: 'typescript',
    jsx: 'javascript',
    tsx: 'typescript',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    markdown: 'markdown',
    md: 'markdown',
    css: 'css',
    scss: 'scss',
    sass: 'scss',
    less: 'less',
    html: 'html',
    xml: 'xml',
    svg: 'xml',
    python: 'python',
    py: 'python',
    rust: 'rust',
    rs: 'rust',
    go: 'go',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    h: 'c',
    bash: 'bash',
    sh: 'bash',
    zsh: 'bash',
    fish: 'fish',
    toml: 'toml',
    ini: 'ini',
    dockerfile: 'dockerfile',
    sql: 'sql',
    graphql: 'graphql',
    protobuf: 'protobuf',
    vue: 'xml', // Vue templates are HTML-like
    svelte: 'html', // Svelte templates are HTML-like
    astro: 'html', // Astro templates are HTML-like
  };

  return aliasMap[languageHint.toLowerCase()];
}

/**
 * Check if a file size is within preview/edit limits.
 */
export function checkSizeLimits(size: number): { preview: boolean; edit: boolean } {
  const MAX_PREVIEW_SIZE = 5 * 1024 * 1024; // 5 MB
  const MAX_EDIT_SIZE = 2 * 1024 * 1024; // 2 MB
  return {
    preview: size <= MAX_PREVIEW_SIZE,
    edit: size <= MAX_EDIT_SIZE,
  };
}