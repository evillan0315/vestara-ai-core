import type { ExecutionActor } from '@vestara/execution-types';
import type { AssistantIdentityContext } from '@vestara/shared';
import type { WorkspaceContext } from './workspace-context';

/** Resolve only an active, explicit principal representation for one actor. */
export async function resolveAssistantIdentity(
  ctx: Pick<WorkspaceContext, 'humanPrincipals' | 'humanIdentityRepresentations'>,
  actor: ExecutionActor | undefined,
): Promise<AssistantIdentityContext | undefined> {
  if (!actor || actor.kind !== 'human') return undefined;
  const principal = await ctx.humanPrincipals.get(actor.id);
  if (!principal || principal.status !== 'active') return undefined;
  const representation = await ctx.humanIdentityRepresentations.get(actor.id);
  if (!representation || representation.status !== 'active') return undefined;
  return { preferredName: representation.preferredName };
}
