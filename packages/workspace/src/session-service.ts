/**
 * SessionService — Unified engineering session orchestration.
 *
 * Combines all prior capabilities into a single, session-driven workflow:
 *   Created → Planning (Architect) → Executing (Developer) →
 *   Verifying (Verifier) → Reviewing (Human) → Completed
 *
 * Architecture Traceability:
 *   PCS: PCS-009 — Engineering Session
 *   Safety: Automation may execute. Governance decides.
 */

import type { AgentRuntime } from './agent-runtime';
import type { ChangeSetStorage } from './change-set-storage';
import type { CollaborationStorage } from './collaboration-storage';
import type { PlanStorage } from './plan-storage';
import type { PluginRuntime } from './plugin-runtime';
import type { SessionStorage } from './session-storage';
import type { EngineeringSession, WorkspaceEvent } from './types';
import type { VerificationStorage } from './verification-storage';
import type { WorkspaceSession } from './workspace-session';

export interface SessionRunResult {
  session: EngineeringSession;
  events: WorkspaceEvent[];
  completed: number;
  total: number;
}

export class SessionService {
  private storage: SessionStorage;
  private planStorage?: PlanStorage;
  private csStorage?: ChangeSetStorage;
  private collabStorage?: CollaborationStorage;
  private vrStorage?: VerificationStorage;
  private agentRuntime?: AgentRuntime;
  private pluginRuntime?: PluginRuntime;

  constructor(opts: {
    storage: SessionStorage;
    planStorage?: PlanStorage;
    csStorage?: ChangeSetStorage;
    collabStorage?: CollaborationStorage;
    vrStorage?: VerificationStorage;
    agentRuntime?: AgentRuntime;
    pluginRuntime?: PluginRuntime;
  }) {
    this.storage = opts.storage;
    this.planStorage = opts.planStorage;
    this.csStorage = opts.csStorage;
    this.collabStorage = opts.collabStorage;
    this.vrStorage = opts.vrStorage;
    this.agentRuntime = opts.agentRuntime;
    this.pluginRuntime = opts.pluginRuntime;
  }

  async createSession(title: string, objective: string): Promise<EngineeringSession> {
    const session = await this.storage.createSession(title, objective);
    await this.storage.logEvent({
      id: `evt-${Date.now()}`,
      sessionId: session.id,
      type: 'session.created',
      actor: 'human',
      artifactId: session.id,
      message: `Session created: ${title}`,
      timestamp: new Date().toISOString(),
    });
    return session;
  }

  async runSession(sessionId: string, workspaceSession: WorkspaceSession): Promise<SessionRunResult> {
    const session = await this.storage.getSession(sessionId);
    if (!session) throw new Error(`Session "${sessionId}" not found.`);
    if (session.status === 'completed') throw new Error(`Session "${sessionId}" is already completed.`);
    if (session.status === 'failed') throw new Error(`Session "${sessionId}" has failed.`);

    const workflow = getFeatureWorkflow();
    let completed = 0;

    for (const step of workflow.steps) {
      const _currentStatus = session.status;

      try {
        switch (step.agentId) {
          case 'agent-architect': {
            await this.storage.updateStatus(sessionId, 'planning');
            const result = await this.agentRuntime?.run('agent-architect', session.objective, workspaceSession);
            if (result?.execution) {
              const exec = result.execution;
              session.artifacts.push(`execution:${exec.id}`);
              await this.storage.addArtifact(sessionId, `execution:${exec.id}`);

              // Also create a plan artifact
              if (this.planStorage) {
                const plan = await this.planStorage.create(
                  `Plan for: ${session.objective.slice(0, 50)}`,
                  workspaceSession.fingerprint.id,
                );
                await this.planStorage.updateStatus(plan.id, 'approved');
                session.artifacts.push(`plan:${plan.id}`);
                await this.storage.addArtifact(sessionId, `plan:${plan.id}`);
              }

              await this.logStep(sessionId, 'architect', exec.status, `execution:${exec.id}`);
            }
            break;
          }

          case 'agent-developer': {
            await this.storage.updateStatus(sessionId, 'executing');
            const result = await this.agentRuntime?.run('agent-developer', session.objective, workspaceSession);
            if (result?.execution) {
              const exec = result.execution;
              session.artifacts.push(`execution:${exec.id}`);
              await this.storage.addArtifact(sessionId, `execution:${exec.id}`);

              // Create a change set artifact
              if (this.csStorage) {
                const cs = await this.csStorage.create(
                  `session-${sessionId}`,
                  session.objective.slice(0, 60),
                  workspaceSession.fingerprint.id,
                );
                session.artifacts.push(`changeset:${cs.id}`);
                await this.storage.addArtifact(sessionId, `changeset:${cs.id}`);
              }

              await this.logStep(sessionId, 'developer', exec.status, `execution:${exec.id}`);
            }
            break;
          }

          case 'agent-verifier': {
            await this.storage.updateStatus(sessionId, 'verifying');
            const result = await this.agentRuntime?.run('agent-verifier', session.objective, workspaceSession);
            if (result?.execution) {
              const exec = result.execution;
              session.artifacts.push(`execution:${exec.id}`);
              await this.storage.addArtifact(sessionId, `execution:${exec.id}`);
              await this.logStep(sessionId, 'verifier', exec.status, `execution:${exec.id}`);
            }
            break;
          }

          default:
            break;
        }

        if (step.approvalRequired) {
          await this.storage.updateStatus(sessionId, 'reviewing');
          session.status = 'reviewing';

          // Create collaboration record
          if (this.collabStorage) {
            const collab = await this.collabStorage.create(
              `session-${sessionId}`,
              `session-${sessionId}`,
              workspaceSession.fingerprint.id,
            );
            session.artifacts.push(`collaboration:${collab.id}`);
            await this.storage.addArtifact(sessionId, `collaboration:${collab.id}`);
          }

          await this.logStep(sessionId, 'system', 'awaiting-approval', sessionId);
        }

        completed++;
      } catch (_error) {
        await this.storage.updateStatus(sessionId, 'failed');
        await this.logStep(sessionId, 'system', 'failed', sessionId);
        break;
      }
    }

    if (completed === workflow.steps.length && session.status !== 'reviewing') {
      await this.storage.updateStatus(sessionId, 'completed');
      session.status = 'completed';
    }

    // Fire after-execution plugin hooks
    if (this.pluginRuntime) {
      try {
        await this.pluginRuntime.executeHook('after-execution', workspaceSession);
      } catch {
        /* best effort */
      }
    }

    const events = await this.storage.getEvents(sessionId);
    return {
      session: session,
      events,
      completed,
      total: workflow.steps.length,
    };
  }

  async getSession(id: string): Promise<EngineeringSession | null> {
    return this.storage.getSession(id);
  }

  async listSessions(): Promise<EngineeringSession[]> {
    return this.storage.listSessions();
  }

  async getEvents(sessionId: string): Promise<WorkspaceEvent[]> {
    return this.storage.getEvents(sessionId);
  }

  private async logStep(sessionId: string, actor: string, status: string, artifactId: string): Promise<void> {
    await this.storage.logEvent({
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sessionId,
      type: `step.${status}`,
      actor: actor as any,
      artifactId,
      message: `${actor}: ${status} → ${artifactId}`,
      timestamp: new Date().toISOString(),
    });
  }

  renderSession(session: EngineeringSession): string {
    const lines: string[] = [];
    lines.push(`Session ${session.id}: ${session.title}`);
    lines.push(`Status: ${session.status}`);
    lines.push(`Objective: ${session.objective}`);
    lines.push(`Created: ${session.createdAt}`);
    if (session.completedAt) lines.push(`Completed: ${session.completedAt}`);
    lines.push('');
    lines.push('Participants:');
    for (const p of session.participants) {
      lines.push(`  • ${p.id} (${p.type}) — ${p.role}`);
    }
    lines.push('');
    if (session.artifacts.length > 0) {
      lines.push('Artifacts:');
      for (const a of session.artifacts) {
        lines.push(`  • ${a}`);
      }
      lines.push('');
    }
    return lines.join('\n');
  }

  renderSessionsList(sessions: EngineeringSession[]): string {
    if (sessions.length === 0) return 'No sessions.';
    const lines: string[] = [];
    lines.push('Sessions:');
    lines.push('');
    for (const s of sessions) {
      lines.push(`  ${s.id.padEnd(8)} ${s.status.padEnd(14)} ${s.title}`);
    }
    return lines.join('\n');
  }

  renderEvents(events: WorkspaceEvent[]): string {
    if (events.length === 0) return 'No events.';
    const lines: string[] = [];
    lines.push('Events:');
    for (const e of events) {
      lines.push(`  • ${e.actor}: ${e.message}`);
    }
    return lines.join('\n');
  }
}

/** Built-in feature development workflow */
function getFeatureWorkflow() {
  return {
    id: 'wf-feature',
    name: 'Feature Development',
    steps: [
      { order: 1, agentId: 'agent-architect', requiredArtifact: 'plan' as const, approvalRequired: false },
      { order: 2, agentId: 'agent-developer', requiredArtifact: 'changeset' as const, approvalRequired: false },
      { order: 3, agentId: 'agent-verifier', requiredArtifact: 'verification' as const, approvalRequired: false },
      { order: 4, agentId: 'human', requiredArtifact: 'verification' as const, approvalRequired: true },
    ],
  };
}
