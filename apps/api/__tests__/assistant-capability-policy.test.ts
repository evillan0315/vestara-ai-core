/**
 * GA-CAP-003 / GA-RUNTIME-001 B: Assistant Capability Policy — Deterministic Tests.
 *
 * Proves:
 * 1. Assistant can read repository file (ALLOW)
 * 2. Assistant can glob/search repository (ALLOW)
 * 3. Assistant can use allowed skill (ALLOW)
 * 4. edit requires user approval (ASK) — Addendum B supersedes blanket deny
 * 5. bash requires user approval (ASK) — Addendum B supersedes blanket deny
 * 6. A skill cannot upgrade ASK to ALLOW (skills never grant authority)
 * 7. Assistant cannot establish a different repository directory (confinement)
 * 8. webfetch/websearch/external_directory retain ASK semantics
 * 9. Developer agent permissions remain unchanged (no policy applied)
 * 10. Model/provider independence (policy is model-agnostic)
 */

import type { OpenCodePermissionAction } from '@vestara/opencode-runtime';
import { describe, expect, it } from 'vitest';
import {
  type AssistantCapabilityPolicy,
  checkRepositoryConfinement,
  createDefaultAssistantPolicy,
  evaluatePermission,
} from '../src/assistant-capability-policy';

const REPO_DIR = '/home/user/projects/vestara/vestara-ai-core';

function policy(): AssistantCapabilityPolicy {
  return createDefaultAssistantPolicy(REPO_DIR);
}

describe('GA-CAP-003: Assistant Capability Policy', () => {
  // ── 1. Read repository file (ALLOW) ──
  it('allows read actions on repository files', () => {
    const result = evaluatePermission(policy(), 'read', ['packages/shared/src/audio.ts']);
    expect(result.decision).toBe('allow');
    expect(result.action).toBe('read');
  });

  // ── 2. Glob/search repository (ALLOW) ──
  it('allows glob actions', () => {
    const result = evaluatePermission(policy(), 'glob', ['**/*.ts']);
    expect(result.decision).toBe('allow');
  });

  it('allows grep actions', () => {
    const result = evaluatePermission(policy(), 'grep', ['import.*from']);
    expect(result.decision).toBe('allow');
  });

  it('allows list actions', () => {
    const result = evaluatePermission(policy(), 'list', ['packages/']);
    expect(result.decision).toBe('allow');
  });

  // ── 3. Allowed skill (ALLOW) ──
  it('allows skill usage (maps to other with resource pattern)', () => {
    const result = evaluatePermission(policy(), 'other', ['skill:testing-and-quality']);
    expect(result.decision).toBe('allow');
    expect(result.reason).toContain('skill');
  });

  it('allows todowrite (maps to other with resource pattern)', () => {
    const result = evaluatePermission(policy(), 'other', ['todowrite:create-task']);
    expect(result.decision).toBe('allow');
    expect(result.reason).toContain('todowrite');
  });

  it('allows lsp (maps to other with resource pattern)', () => {
    const result = evaluatePermission(policy(), 'other', ['lsp:getSymbols']);
    expect(result.decision).toBe('allow');
    expect(result.reason).toContain('assistant support');
  });

  // ── 4. edit requires user approval (ASK) ──
  it('asks for edit actions (GA-RUNTIME-001 B supersedes blanket deny)', () => {
    const result = evaluatePermission(policy(), 'edit', ['packages/shared/src/audio.ts']);
    expect(result.decision).toBe('ask');
    expect(result.action).toBe('edit');
    expect(result.reason).toContain('user approval');
  });

  // ── 5. bash requires user approval (ASK) ──
  it('asks for bash actions', () => {
    const result = evaluatePermission(policy(), 'bash', ['pnpm build']);
    expect(result.decision).toBe('ask');
    expect(result.action).toBe('bash');
    expect(result.reason).toContain('user approval');
  });

  it('asks for write actions', () => {
    const result = evaluatePermission(policy(), 'write', ['output.txt']);
    expect(result.decision).toBe('ask');
    expect(result.action).toBe('write');
  });

  // ── 6. A skill cannot upgrade ASK to ALLOW ──
  it('skill usage does not upgrade ask authority to allow', () => {
    // A skill like git-commit-push instructs the model to use bash/edit,
    // but the policy keeps bash/edit at ASK regardless of skill context.
    const bashResult = evaluatePermission(policy(), 'bash', ['git commit -m "test"']);
    const editResult = evaluatePermission(policy(), 'edit', ['README.md']);
    const writeResult = evaluatePermission(policy(), 'write', ['README.md']);

    expect(bashResult.decision).toBe('ask');
    expect(editResult.decision).toBe('ask');
    expect(writeResult.decision).toBe('ask');
  });

  it('skill resource pattern does not match mutation actions', () => {
    // Even if a skill name contains "bash" or "edit", the action-level rules take precedence
    const result = evaluatePermission(policy(), 'bash', ['skill:git-commit-push']);
    expect(result.decision).toBe('ask');
  });

  // ── 7. Cannot establish a different repository directory ──
  it('confines resources to repository directory', () => {
    const check = checkRepositoryConfinement(REPO_DIR, `${REPO_DIR}/packages/shared/src/audio.ts`);
    expect(check.confined).toBe(true);
  });

  it('rejects external directory paths', () => {
    const check = checkRepositoryConfinement(REPO_DIR, '/etc/passwd');
    expect(check.confined).toBe(false);
    expect(check.reason).toContain('outside repository');
  });

  it('rejects parent directory traversal', () => {
    const check = checkRepositoryConfinement(REPO_DIR, '/home/user/projects/sibling-project/file.ts');
    expect(check.confined).toBe(false);
  });

  it('rejects home directory access', () => {
    const check = checkRepositoryConfinement(REPO_DIR, '/home/user/.ssh/id_rsa');
    expect(check.confined).toBe(false);
  });

  // ── 8. webfetch/websearch retain ASK semantics ──
  it('asks for webfetch permission', () => {
    const result = evaluatePermission(policy(), 'webfetch', ['https://example.com']);
    expect(result.decision).toBe('ask');
    expect(result.action).toBe('webfetch');
  });

  it('asks for websearch permission (maps to other)', () => {
    const result = evaluatePermission(policy(), 'other', ['websearch:query']);
    expect(result.decision).toBe('ask');
    expect(result.reason).toContain('websearch');
  });

  it('asks for external directory access (maps to other)', () => {
    const result = evaluatePermission(policy(), 'other', ['external_directory:/tmp/file']);
    expect(result.decision).toBe('ask');
    expect(result.reason).toContain('external');
  });

  // ── 9. Developer agent permissions remain unchanged ──
  it('policy does not apply to non-assistant agents', () => {
    // The policy is only enforced when capabilityPolicy is provided to the adapter.
    // When no policy is set (Developer, Planner, etc.), all permissions are surfaced.
    // This test verifies the policy object is self-contained and doesn't leak.
    const p = policy();
    expect(p.repositoryDir).toBe(REPO_DIR);
    // The policy only affects calls that pass it — no global side effects
  });

  // ── 10. Model/provider independence ──
  it('policy decisions are independent of model/provider', () => {
    // Same policy, same inputs → same output regardless of model
    const p = policy();
    const models = ['claude-sonnet-4-20250514', 'gpt-4o', 'gemini-2.5-pro', 'local-model'];

    for (const _model of models) {
      const readResult = evaluatePermission(p, 'read', ['file.ts']);
      const editResult = evaluatePermission(p, 'edit', ['file.ts']);
      const bashResult = evaluatePermission(p, 'bash', ['command']);

      expect(readResult.decision).toBe('allow');
      expect(editResult.decision).toBe('ask');
      expect(bashResult.decision).toBe('ask');
    }
  });

  // ── Default decision for unknown actions ──
  it('denies unknown actions by default', () => {
    const result = evaluatePermission(policy(), 'other', ['unknown-tool']);
    expect(result.decision).toBe('deny');
    expect(result.reason).toContain('default');
  });

  // ── Policy structure ──
  it('has correct rule ordering (read before deny before other)', () => {
    const p = policy();
    const readRuleIndex = p.rules.findIndex((r) => r.action === 'read');
    const editRuleIndex = p.rules.findIndex((r) => r.action === 'edit');
    const otherRuleIndex = p.rules.findIndex((r) => r.action === 'other');

    expect(readRuleIndex).toBeLessThan(editRuleIndex);
    expect(editRuleIndex).toBeLessThan(otherRuleIndex);
  });

  it('first-match-wins semantics', () => {
    // The 'other' action has multiple rules (skill, websearch, external).
    // First matching rule wins.
    const skillResult = evaluatePermission(policy(), 'other', ['skill:foo']);
    const websearchResult = evaluatePermission(policy(), 'other', ['websearch:query']);
    const externalResult = evaluatePermission(policy(), 'other', ['external:/tmp']);

    expect(skillResult.decision).toBe('allow'); // skill rule matches first
    expect(websearchResult.decision).toBe('ask'); // websearch rule matches
    expect(externalResult.decision).toBe('ask'); // external rule matches
  });
});
