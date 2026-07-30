import { MarkdownRenderer } from '../components/chat/MarkdownRenderer';
import cliDocs from '../docs/cli.md?raw';

const DOCS: Record<string, { label: string; content: string }> = {
  cli: { label: 'CLI Reference', content: cliDocs },
};

export default function Docs() {
  const entry = DOCS.cli;

  return (
    <div className="w-full">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-lg font-bold text-(--vestara-text)">Documentation</h1>
        <span className="text-[10px] text-(--vestara-text-muted) bg-(--vestara-accent-bg) px-2 py-0.5 rounded-full">{entry.label}</span>
      </div>
      <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-6 max-w-none">
        <MarkdownRenderer content={entry.content} />
      </div>
    </div>
  );
}
