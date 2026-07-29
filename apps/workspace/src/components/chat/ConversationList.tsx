import { useMemo } from 'react';
import { ConversationItem } from './ConversationItem';
import type { ConversationData } from './types';
import { getRelativeDateGroup } from './utils';

interface ConversationListProps {
  conversations: ConversationData[];
  activeBranch: string;
  branches: Record<string, any>;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

type GroupedConvs = Record<string, ConversationData[]>;

export function ConversationList({ conversations, activeBranch, branches, onSelect, onDelete }: ConversationListProps) {
  const grouped = useMemo(() => {
    const groups: GroupedConvs = {};
    const sorted = [...conversations].sort((a, b) => b.timestamp - a.timestamp);
    for (const conv of sorted) {
      const group = getRelativeDateGroup(conv.timestamp);
      if (!groups[group]) groups[group] = [];
      groups[group].push(conv);
    }
    return groups;
  }, [conversations]);

  const groupOrder = ['Today', 'Yesterday', 'Previous 7 Days', 'Older'];
  const hasConvs = conversations.length > 0;

  if (!hasConvs) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center px-4">
        <svg className="w-8 h-8 text-zinc-800 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
          />
        </svg>
        <p className="text-[11px] text-zinc-700">No conversations yet</p>
      </div>
    );
  }

  return (
    <div className="py-2 space-y-3">
      {groupOrder.map(
        (group) =>
          grouped[group] && (
            <div key={group}>
              <div className="px-3 py-1 text-[10px] font-semibold text-zinc-700 uppercase tracking-wider">{group}</div>
              <div className="space-y-0.5">
                {grouped[group].map((conv) => (
                  <ConversationItem
                    key={conv.id}
                    conversation={conv}
                    isActive={
                      conv.branches === branches ||
                      (conv.branches[conv.activeBranch] && conv.branches[conv.activeBranch] === branches[activeBranch])
                    }
                    onSelect={onSelect}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            </div>
          ),
      )}
    </div>
  );
}
