export const CATEGORY_CONFIG: Record<string, { label: string; icon: string; color: string; border: string }> = {
  workspace: { label: 'Workspace', icon: '◈', color: '#60a5fa', border: 'border-l-blue-500/40' },
  explanation: { label: 'Explanations', icon: '◎', color: '#a78bfa', border: 'border-l-purple-500/40' },
  plan: { label: 'Plans', icon: '△', color: '#f59e0b', border: 'border-l-amber-500/40' },
  changeset: { label: 'Change Sets', icon: '◇', color: '#22d3ee', border: 'border-l-cyan-500/40' },
  verification: { label: 'Verifications', icon: '✓', color: '#4ade80', border: 'border-l-green-500/40' },
  approval: { label: 'Approvals', icon: '⚑', color: '#f472b6', border: 'border-l-pink-500/40' },
};
