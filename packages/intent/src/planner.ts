import type { Constraint, ExecutionPlan, JobId } from '@vestara/types';
import type { Intent } from './intent';

export interface ExecStepInfo {
  id: JobId;
  name: string;
  summary: string;
  capabilities: string[];
  duration: number;
}

export interface ExecPlan extends ExecutionPlan {
  steps: ExecStepInfo[];
}

export interface PlannerStepDefinition {
  idPrefix: string;
  targets: RegExp[];
  name: string;
  summary: string;
  capabilities: string[];
  duration: number;
  dependsOn?: string[];
}

export interface PlanOptions {
  maxJobs?: number;
}

const DEFAULT_STEP_DEFINITIONS: PlannerStepDefinition[] = [
  {
    idPrefix: 'analyze',
    targets: [/implement|build|create|add|generate|write|fix|migrate|refactor|feature|oauth|api|auth/i],
    name: 'Analyze',
    summary: 'Analyze the goal and understand the domain before changing anything.',
    capabilities: ['understanding:analyze'],
    duration: 120,
  },
  {
    idPrefix: 'plan',
    targets: [/implement|build|create|add|generate|write|fix|migrate|refactor|feature|api|auth/i],
    name: 'Plan',
    summary: 'Produce an execution plan against the identified context.',
    capabilities: ['planning:plan'],
    duration: 60,
    dependsOn: ['analyze'],
  },
  {
    idPrefix: 'implement',
    targets: [/implement|build|create|add|generate|write|fix|migrate|refactor|function|component|service|api|auth/i],
    name: 'Implement',
    summary: 'Execute the changes described by the plan.',
    capabilities: ['code:write'],
    duration: 360,
    dependsOn: ['plan'],
  },
  {
    idPrefix: 'verify',
    targets: [/verify|validate|check|test|confirm|proof/i],
    name: 'Verify',
    summary: 'Verify the outcome meets the success criteria.',
    capabilities: ['verification:verify'],
    duration: 60,
    dependsOn: ['implement'],
  },
];

/**
 * Decomposes a goal into an ordered execution plan of jobs.
 * Deterministic given stable step definitions — the same goal and constraints
 * always yield the same plan.
 */
export class Planner {
  private readonly _definitions: PlannerStepDefinition[];

  constructor(definitions: PlannerStepDefinition[] = DEFAULT_STEP_DEFINITIONS) {
    this._definitions = definitions;
  }

  plan(goal: string, options?: PlanOptions): ExecPlan {
    const maxJobs = options?.maxJobs ?? this._definitions.length;
    const selected: PlannerStepDefinition[] = [];

    for (const def of this._definitions) {
      if (selected.length >= maxJobs) break;
      if (def.targets.some((t) => t.test(goal))) {
        selected.push(def);
      }
    }

    if (selected.length === 0) {
      selected.push(this._definitions[0]);
    }

    const jobIds: JobId[] = selected.map((_, i) => `${String(i + 1)}` as JobId);
    const dependencies: Array<{ from: JobId; to: JobId }> = [];
    let estimatedDuration = 0;

    selected.forEach((def, i) => {
      estimatedDuration += def.duration;
      if (def.dependsOn) {
        for (const dep of def.dependsOn) {
          const depIndex = selected.findIndex((s) => s.idPrefix === dep);
          if (depIndex >= 0 && depIndex < i) {
            dependencies.push({ from: jobIds[depIndex], to: jobIds[i] });
          }
        }
      }
    });

    const steps: ExecStepInfo[] = selected.map((def, i) => ({
      id: jobIds[i],
      name: def.name,
      summary: def.summary,
      capabilities: [...def.capabilities],
      duration: def.duration,
    }));

    return {
      jobs: jobIds,
      dependencies,
      estimatedDuration,
      owner: String(goal),
      approved: false,
      steps,
    };
  }

  planFor(intent: Intent, options?: PlanOptions): ExecPlan {
    const constraints = [...intent.constraints];
    const maxJobs = this.maxJobsFromConstraints(constraints);
    return this.plan(intent.goal, { maxJobs });
  }

  private maxJobsFromConstraints(constraints: Constraint[]): number | undefined {
    for (const c of constraints) {
      if (c.type !== 'maxJobs') continue;
      const value = c.value.maxJobs;
      if (typeof value === 'number' && value > 0) return Math.floor(value);
    }
    return undefined;
  }
}
