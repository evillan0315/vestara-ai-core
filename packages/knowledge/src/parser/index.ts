// ═══════════════════════════════════════════════════════════════
// DOCUMENT PARSER
// ═══════════════════════════════════════════════════════════════

import type { KnowledgeDocument } from '../types/index.js';

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  md: 'markdown',
  txt: 'text',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  ts: 'typescript',
  js: 'javascript',
  tsx: 'tsx',
  jsx: 'jsx',
  py: 'python',
  html: 'html',
  css: 'css',
  sql: 'sql',
  rs: 'rust',
  go: 'go',
  java: 'java',
  rb: 'ruby',
  php: 'php',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  dockerfile: 'docker',
  tf: 'terraform',
  toml: 'toml',
  xml: 'xml',
  svg: 'svg',
};

const EXTENSION_MIME_MAP: Record<string, string> = {
  md: 'text/markdown',
  txt: 'text/plain',
  json: 'application/json',
  yaml: 'text/yaml',
  ts: 'text/typescript',
  js: 'text/javascript',
  py: 'text/x-python',
  html: 'text/html',
  css: 'text/css',
  sql: 'text/x-sql',
  rs: 'text/rust',
  go: 'text/go',
};

export interface DocumentParser {
  parse(uri: string, content: string): KnowledgeDocument;
  supports(extension: string): boolean;
}

export class DefaultDocumentParser implements DocumentParser {
  parse(uri: string, content: string): KnowledgeDocument {
    const ext = this.getExtension(uri);
    const language = EXTENSION_LANGUAGE_MAP[ext] ?? 'text';
    const mimeType = EXTENSION_MIME_MAP[ext] ?? 'text/plain';
    const title = uri.split('/').pop() ?? uri;

    return {
      id: `doc-${Buffer.from(uri).toString('base64').slice(0, 32)}`,
      uri,
      title,
      language,
      mimeType,
      content,
      metadata: { extension: ext, size: content.length, lines: content.split('\n').length },
      indexedAt: new Date().toISOString(),
    };
  }

  supports(extension: string): boolean {
    return extension in EXTENSION_LANGUAGE_MAP;
  }

  private getExtension(uri: string): string {
    const parts = uri.split('.');
    const ext = parts[parts.length - 1]?.toLowerCase() ?? '';
    // Handle Dockerfile (no extension)
    if (uri.endsWith('Dockerfile') || uri.endsWith('dockerfile')) return 'dockerfile';
    return ext;
  }
}
