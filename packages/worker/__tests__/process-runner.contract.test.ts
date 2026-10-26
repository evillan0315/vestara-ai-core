import { describe, expect, it } from 'vitest';
import { runCommand } from '../src/process-runner';

describe('runCommand contract', () => {
  it('captures stdout and exit code', async () => {
    const result = await runCommand('echo', { args: ['wave5'] });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('wave5');
    expect(result.stderr).toBe('');
  });

  it('surfaces non-zero exit codes without throwing', async () => {
    const result = await runCommand('false');
    expect(result.exitCode).toBe(1);
  });
});
