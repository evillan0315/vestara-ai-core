import { describe, expect, it } from 'vitest';
import { InteractionService } from '../src/interaction-service';

function interaction() {
  return {
    interactionId: 'i1',
    presentingParticipantId: 'system',
    presentingParticipantName: 'System',
    createdAt: new Date().toISOString(),
    content: 'Proceed?',
    choices: [{ choiceId: 'yes', label: 'Yes' }],
  } as never;
}

describe('InteractionService contract', () => {
  it('persists then publishes presented interactions', async () => {
    const persisted: unknown[] = [];
    const published: unknown[] = [];
    const service = new InteractionService({
      persistence: {
        put: async (i: unknown) => void persisted.push(i),
        markPublished: async () => {},
      } as never,
      publication: { onInteractionPresented: async (e: unknown) => void published.push(e) } as never,
    });
    await service.present(interaction());
    expect(persisted).toHaveLength(1);
    expect(published).toHaveLength(1);
  });

  it('rejects structurally invalid interactions before touching ports', async () => {
    let touched = false;
    const service = new InteractionService({
      persistence: { put: async () => void (touched = true) } as never,
      publication: { onInteractionPresented: async () => {} } as never,
    });
    await expect(service.present({ interactionId: 'bad', choices: [] } as never)).rejects.toThrow();
    expect(touched).toBe(false);
  });
});
