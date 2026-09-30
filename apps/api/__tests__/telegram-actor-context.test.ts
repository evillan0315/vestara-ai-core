import { describe, expect, it } from 'vitest';
import { rereadCanonicalWorkspace } from '../src/routes/telegram';

describe('ACTOR-IDENTITY-003A canonical workspace reread', () => {
  it('rereads workspace state with the canonical principal, not the legacy pairing ID', () => {
    const requested: string[] = [];
    const bindings = {
      getPreferredWorkspace(principalId: string) {
        requested.push(principalId);
        return principalId === 'hp-canonical-1' ? { workspaceId: 'workspace-1' } : undefined;
      },
    };

    expect(rereadCanonicalWorkspace(bindings, 'hp-canonical-1')).toEqual({ workspaceId: 'workspace-1' });
    expect(requested).toEqual(['hp-canonical-1']);
    expect(requested).not.toContain('tg-principal-8531736505');
  });
});
