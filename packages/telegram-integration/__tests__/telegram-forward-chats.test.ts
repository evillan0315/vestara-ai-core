/**
 * Forward picker — listActiveBindings contract.
 *
 * The Activity Room forward dialog lists workspace-scoped ACTIVE bindings
 * only (most recently active first). Paused/closed chats and other
 * workspaces must never appear as forward targets.
 */

import { describe, expect, it } from 'vitest';
import { TelegramConversationBindingService } from '../src/conversation-binding';

function seed(service: TelegramConversationBindingService) {
  const a = service.createBinding({
    principalId: 'principal-1',
    workspaceId: 'workspace-1',
    telegramChatId: 'chat-old',
    telegramChatType: 'direct',
    vestaraConversationId: 'vestara-old',
  });
  const b = service.createBinding({
    principalId: 'principal-1',
    workspaceId: 'workspace-1',
    telegramChatId: 'chat-new',
    telegramChatType: 'group',
    telegramChatTitle: 'Ops Room',
    vestaraConversationId: 'vestara-new',
  });
  const other = service.createBinding({
    principalId: 'principal-1',
    workspaceId: 'workspace-2',
    telegramChatId: 'chat-elsewhere',
    telegramChatType: 'direct',
    vestaraConversationId: 'vestara-elsewhere',
  });
  return { a, b, other };
}

describe('listActiveBindings', () => {
  it('lists workspace-scoped active chats, most recent first', () => {
    const service = new TelegramConversationBindingService();
    const { b } = seed(service);
    service.touchBinding(b.id);
    const listed = service.listActiveBindings('workspace-1');
    expect(listed.map((x) => x.telegramChatId)).toEqual(['chat-new', 'chat-old']);
    expect(listed.every((x) => x.workspaceId === 'workspace-1')).toBe(true);
  });

  it('excludes paused and closed chats', () => {
    const service = new TelegramConversationBindingService();
    const { a, b } = seed(service);
    service.pauseBinding(a.id);
    service.closeBinding(b.id);
    expect(service.listActiveBindings('workspace-1')).toEqual([]);
  });

  it('never leaks other workspaces', () => {
    const service = new TelegramConversationBindingService();
    seed(service);
    const listed = service.listActiveBindings('workspace-1');
    expect(listed.some((x) => x.telegramChatId === 'chat-elsewhere')).toBe(false);
  });
});
