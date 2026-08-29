import { createWorkspaceCommand } from '@vestara/configuration';
import { HttpWorkspaceRuntimeClient } from '@vestara/workspace';
import { BOLD, GOLD, GRAY, GREEN, RED, RESET } from '../output/format.js';

interface RoutingSelectionResponse {
  revision: number;
  updatedAt: string;
  updatedByClientId: string;
  selection: { profileId: string; roles: Record<string, { providerId: string; modelId: string }> };
}

function optionValue(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

export async function runRouting(args: readonly string[]): Promise<void> {
  const action = args[0] ?? 'show';
  const json = args.includes('--json');
  const client = new HttpWorkspaceRuntimeClient({ endpoint: optionValue(args, '--endpoint') });
  try {
    const status = await client.getStatus();
    if (action === 'catalog') {
      const result = await client.execute<any>(
        createWorkspaceCommand({ workspaceId: status.workspaceId, source: 'cli', type: 'routing.catalog.get' }),
      );
      if (json) console.log(JSON.stringify(result, null, 2));
      else renderCatalog(result);
      return;
    }

    if (action === 'show') {
      const result = await getSelection(client, status.workspaceId);
      if (json) console.log(JSON.stringify(result, null, 2));
      else renderSelection(result);
      return;
    }

    if (action === 'profile') {
      const profileId = args[1];
      if (!profileId) throw new Error('Usage: vestara routing profile <profile-id> [--endpoint URL] [--json]');
      const current = await getSelection(client, status.workspaceId);
      const result = await client.execute<RoutingSelectionResponse>(
        createWorkspaceCommand({
          workspaceId: status.workspaceId,
          source: 'cli',
          type: 'routing.selection.update',
          payload: {
            selection: { ...current.selection, profileId },
            expectedRevision: current.revision,
          },
        }),
      );
      if (json) console.log(JSON.stringify(result, null, 2));
      else {
        console.log(`${GREEN}✓${RESET} Routing profile updated to ${BOLD}${result.selection.profileId}${RESET}`);
        console.log(`${GRAY}Revision ${current.revision} → ${result.revision}${RESET}`);
      }
      return;
    }

    if (action === 'preview') {
      const role = args[1];
      const agentId = args[2];
      if (!role || !agentId)
        throw new Error(
          'Usage: vestara routing preview <role> <agent-id> [--profile ID] [--implementation-provider ID]',
        );
      const result = await client.execute<any>(
        createWorkspaceCommand({
          workspaceId: status.workspaceId,
          source: 'cli',
          type: 'routing.preview',
          payload: {
            role,
            agentId,
            profileId: optionValue(args, '--profile'),
            implementationProviderId: optionValue(args, '--implementation-provider'),
          },
        }),
      );
      if (json) console.log(JSON.stringify(result, null, 2));
      else renderPreview(result);
      return;
    }

    if (action === 'assignments') {
      const result = await client.execute<any>(
        createWorkspaceCommand({ workspaceId: status.workspaceId, source: 'cli', type: 'routing.assignment.list' }),
      );
      if (json) console.log(JSON.stringify(result, null, 2));
      else renderAssignments(result.assignments ?? []);
      return;
    }

    if (action === 'assign') {
      const [taskId, role, agentId, providerId, modelId] = args.slice(1, 6);
      if (!taskId || !role || !agentId || !providerId || !modelId)
        throw new Error('Usage: vestara routing assign <task> <role> <agent> <provider> <model>');
      const result = await client.execute<any>(
        createWorkspaceCommand({
          workspaceId: status.workspaceId,
          source: 'cli',
          type: 'routing.assignment.create',
          payload: { taskId, role, agentId, route: { providerId, modelId } },
        }),
      );
      if (json) console.log(JSON.stringify(result, null, 2));
      else renderAssignment(result);
      return;
    }

    if (action === 'assignment-status') {
      const [taskId, nextStatus, revisionText] = args.slice(1, 4);
      const expectedRevision = Number(revisionText);
      if (!taskId || !nextStatus || !Number.isInteger(expectedRevision))
        throw new Error('Usage: vestara routing assignment-status <task> <status> <expected-revision>');
      const result = await client.execute<any>(
        createWorkspaceCommand({
          workspaceId: status.workspaceId,
          source: 'cli',
          type: 'routing.assignment.status',
          payload: { taskId, status: nextStatus, expectedRevision },
        }),
      );
      if (json) console.log(JSON.stringify(result, null, 2));
      else renderAssignment(result);
      return;
    }

    if (action === 'record-side-effect') {
      const taskId = args[1];
      const expectedRevision = Number(args[2]);
      if (!taskId || !Number.isInteger(expectedRevision))
        throw new Error('Usage: vestara routing record-side-effect <task> <expected-revision>');
      const result = await client.execute<any>(
        createWorkspaceCommand({
          workspaceId: status.workspaceId,
          source: 'cli',
          type: 'routing.assignment.side-effect',
          payload: { taskId, expectedRevision },
        }),
      );
      if (json) console.log(JSON.stringify(result, null, 2));
      else renderAssignment(result);
      return;
    }

    if (action === 'reassign') {
      const [taskId, revisionText, agentId, providerId, modelId] = args.slice(1, 6);
      const expectedRevision = Number(revisionText);
      const reason = optionValue(args, '--reason');
      if (!taskId || !Number.isInteger(expectedRevision) || !agentId || !providerId || !modelId || !reason)
        throw new Error(
          'Usage: vestara routing reassign <task> <expected-revision> <agent> <provider> <model> --reason <text> [--approve]',
        );
      const result = await client.execute<any>(
        createWorkspaceCommand({
          workspaceId: status.workspaceId,
          source: 'cli',
          type: 'routing.assignment.reassign',
          payload: {
            taskId,
            expectedRevision,
            agentId,
            route: { providerId, modelId },
            reason,
            approved: args.includes('--approve'),
          },
        }),
      );
      if (json) console.log(JSON.stringify(result, null, 2));
      else {
        console.log(
          result.status === 'approval-required'
            ? `${GOLD}Active work paused; explicit reassignment approval is required.${RESET}`
            : `${GREEN}✓${RESET} Task routing reassigned; explicit resume is still required.`,
        );
        renderAssignment(result.assignment);
      }
      return;
    }

    throw new Error(
      'Usage: vestara routing show|catalog|profile|preview|assignments|assign|assignment-status|record-side-effect|reassign [options]',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (json) console.log(JSON.stringify({ error: message }, null, 2));
    else console.error(`${RED}Routing command failed: ${message}${RESET}`);
    process.exitCode = 1;
  }
}

async function getSelection(
  client: HttpWorkspaceRuntimeClient,
  workspaceId: string,
): Promise<RoutingSelectionResponse> {
  return client.execute(createWorkspaceCommand({ workspaceId, source: 'cli', type: 'routing.selection.get' }));
}

function renderCatalog(result: any): void {
  console.log(`${BOLD}${GOLD}Engineering Routing Catalog${RESET}`);
  console.log(`${GRAY}Profiles${RESET}`);
  for (const profile of result.profiles ?? [])
    console.log(`  ${GREEN}●${RESET} ${profile.name} ${GRAY}— ${profile.description}${RESET}`);
  console.log(`${GRAY}Provider models${RESET}`);
  for (const candidate of result.candidates ?? []) {
    const state = candidate.availability?.state ?? 'unknown';
    const icon = candidate.availability?.available ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    console.log(
      `  ${icon} ${candidate.ref.providerId}/${candidate.ref.modelId} ${GRAY}${candidate.locality} · ${state}${RESET}`,
    );
  }
}

function renderSelection(result: RoutingSelectionResponse): void {
  console.log(`${BOLD}${GOLD}Effective Routing Selection${RESET}`);
  console.log(`  Profile: ${BOLD}${result.selection.profileId}${RESET}`);
  console.log(`  Revision: ${result.revision} ${GRAY}by ${result.updatedByClientId} at ${result.updatedAt}${RESET}`);
  for (const [role, ref] of Object.entries(result.selection.roles))
    console.log(`  ${role}: ${ref.providerId}/${ref.modelId}`);
}

function renderPreview(result: any): void {
  const selected = result.selected;
  const evidence = result.evidence;
  console.log(`${BOLD}${GOLD}Routing Preview${RESET}`);
  console.log(`  Agent: ${evidence.selectedAgentId} (${evidence.agentRole})`);
  console.log(`  Provider: ${selected.providerName} (${selected.ref.providerId})`);
  console.log(
    `  Model: ${selected.ref.modelId}${selected.ref.modelRevision ? ` @ ${selected.ref.modelRevision}` : ''}`,
  );
  console.log(`  Policy: ${evidence.policyId}`);
  console.log(`  Reason: ${evidence.reasonCodes.join(', ')}`);
  console.log(`  Rejected candidates: ${evidence.rejectedCandidates.length}`);
}

function renderAssignments(assignments: readonly any[]): void {
  console.log(`${BOLD}${GOLD}Task Routing Assignments${RESET}`);
  if (assignments.length === 0) console.log(`${GRAY}  No task assignments.${RESET}`);
  for (const assignment of assignments) renderAssignment(assignment);
}

function renderAssignment(assignment: any): void {
  console.log(
    `  ${BOLD}${assignment.taskId}${RESET} r${assignment.revision} · ${assignment.status} · ${assignment.agentId} · ${assignment.route.providerId}/${assignment.route.modelId}${assignment.sideEffectsRecorded ? ` ${GOLD}side effects recorded${RESET}` : ''}`,
  );
}
