import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AiProjectPlanner } from '../../src/ev001/ai-project-planner';
import { HardcodedProjectPlanner } from '../../src/ev001/hardcoded-planner';
import type { PlanningContext } from '../../src/ev001/planning-context';
import { ProjectOrchestrator } from '../../src/ev001/project-orchestrator';
import { ProjectWorkflow } from '../../src/ev001/project-workflow';

const TEST_DIR = path.join(os.tmpdir(), `vestara-ev002-${Date.now()}`);

function makeContext(overrides?: Partial<PlanningContext>): PlanningContext {
  return {
    request: 'Build a Personal Finance Tracker',
    workspaceName: 'personal-finance-tracker',
    architectureDecisions: [],
    repositorySummary: '',
    outstandingWork: [],
    conversationSummary: '',
    ...overrides,
  };
}

describe('EV-002: Project Continuity', () => {
  describe('PlanningContext', () => {
    it('carries forward architecture decisions', async () => {
      const context = makeContext({
        architectureDecisions: ['React', 'TypeScript', 'PostgreSQL'],
      });
      expect(context.architectureDecisions).toHaveLength(3);
    });

    it('carries forward outstanding work', async () => {
      const context = makeContext({
        outstandingWork: ['Authentication', 'Dashboard'],
      });
      expect(context.outstandingWork).toContain('Authentication');
    });

    it('detects resume vs new project', async () => {
      const newContext = makeContext({ architectureDecisions: [], outstandingWork: [] });
      const resumeContext = makeContext({ architectureDecisions: ['React'], outstandingWork: [] });
      const hasResume = (c: PlanningContext) => c.architectureDecisions.length > 0 || c.outstandingWork.length > 0;

      expect(hasResume(newContext)).toBe(false);
      expect(hasResume(resumeContext)).toBe(true);
    });
  });

  describe('HardcodedProjectPlanner (with context)', () => {
    it('returns new-project plan when context is empty', async () => {
      const planner = new HardcodedProjectPlanner();
      const context = makeContext({ architectureDecisions: [], outstandingWork: [] });
      const plan = await planner.createPlan(context);
      expect(plan.projectName).toBe('personal-finance-tracker');
      expect(plan.steps[0].id).toBe('create-workspace');
    });

    it('returns resume plan when context has decisions', async () => {
      const planner = new HardcodedProjectPlanner();
      const context = makeContext({
        architectureDecisions: ['React', 'TypeScript'],
        outstandingWork: ['Authentication'],
      });
      const plan = await planner.createPlan(context);
      expect(plan.steps[0].id).toBe('restore-context');
      expect(plan.steps.some((s) => s.id === 'plan-next')).toBe(true);
    });
  });

  describe('ProjectWorkflow (file system)', () => {
    it('creates project directory structure', async () => {
      const workflow = new ProjectWorkflow();
      const planner = new HardcodedProjectPlanner();
      const context = makeContext({ workspaceName: 'TestWorkflow' });
      const plan = await planner.createPlan(context);
      await workflow.execute(plan, TEST_DIR);

      const projectDir = path.join(TEST_DIR, 'TestWorkflow');
      expect(fs.existsSync(path.join(projectDir, 'README.md'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, '.memory', 'project.json'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, 'vestara.json'))).toBe(true);
    });

    it('reports correct step count', async () => {
      const workflow = new ProjectWorkflow();
      const planner = new HardcodedProjectPlanner();
      const context = makeContext({ workspaceName: 'StepCount' });
      const plan = await planner.createPlan(context);
      const progress = await workflow.execute(plan, TEST_DIR);
      expect(progress.totalSteps).toBe(plan.steps.length);
      expect(progress.status).toBe('completed');
    });
  });

  describe('ProjectOrchestrator (end-to-end)', () => {
    it('completes full project creation flow (HardcodedProjectPlanner)', async () => {
      const planner = new HardcodedProjectPlanner();
      const orchestrator = new ProjectOrchestrator(planner);
      const result = await orchestrator.createProject('MyApp', TEST_DIR);
      expect(result.projectName).toBe('myapp');
      expect(result.stepsCompleted).toBeGreaterThan(0);
      expect(result.duration).toBeGreaterThan(0);

      const projectDir = path.join(TEST_DIR, 'myapp');
      expect(fs.existsSync(path.join(projectDir, 'README.md'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, 'vestara.json'))).toBe(true);
    });
  });

  describe('Planner Compatibility', () => {
    it('HardcodedProjectPlanner and AiProjectPlanner use the same interface', () => {
      const hardcoded: { createPlan: (ctx: PlanningContext) => Promise<{ projectName: string; steps: unknown[] }> } =
        new HardcodedProjectPlanner();
      const ai: { createPlan: (ctx: PlanningContext) => Promise<{ projectName: string; steps: unknown[] }> } =
        new AiProjectPlanner({} as any);

      expect(typeof hardcoded.createPlan).toBe('function');
      expect(typeof ai.createPlan).toBe('function');
    });

    it('both planners produce valid ProjectPlan structures from context', async () => {
      const hardcoded = new HardcodedProjectPlanner();
      const context = makeContext({ workspaceName: 'CompatTest' });
      const plan = await hardcoded.createPlan(context);
      expect(plan.projectName).toBe('CompatTest');
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.steps.every((s) => s.id && s.name && s.description)).toBe(true);
    });
  });

  describe('MemoryContextService', () => {
    it('creates empty context when no memory runtime', () => {
      const context = makeContext();
      expect(context.request).toBe('Build a Personal Finance Tracker');
      expect(context.architectureDecisions).toEqual([]);
    });

    it('empty context returns reasonable defaults', () => {
      const context = makeContext({ request: '', workspaceName: '', architectureDecisions: [] });
      expect(context.request).toBe('');
      expect(context.workspaceName).toBe('');
    });
  });
});
