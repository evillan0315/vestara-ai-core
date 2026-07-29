import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ContextContribution, ContextSource } from './context-assembler';

export class RepositoryContextSource implements ContextSource {
  readonly name = 'repository';

  async contribute(
    request: string,
    workspaceName: string,
    workspacePath: string,
    _userId: string,
  ): Promise<ContextContribution> {
    const projectDir = path.join(workspacePath, workspaceName);

    if (!fs.existsSync(projectDir)) return {};

    const files = this.scanFiles(projectDir);
    const entryPoints = this.findEntryPoints(projectDir);

    const summary = [
      `Source files: ${files.length}`,
      entryPoints.length > 0 ? `Entry points: ${entryPoints.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return { repositorySummary: summary };
  }

  private scanFiles(dir: string): string[] {
    const results: string[] = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...this.scanFiles(fullPath));
        } else if (entry.isFile()) {
          results.push(fullPath);
        }
      }
    } catch {}
    return results;
  }

  private findEntryPoints(projectDir: string): string[] {
    const points: string[] = [];
    const candidates = [
      'package.json',
      'tsconfig.json',
      'index.ts',
      'index.tsx',
      'main.ts',
      'main.tsx',
      'src/index.ts',
      'src/main.tsx',
    ];
    for (const c of candidates) {
      if (fs.existsSync(path.join(projectDir, c))) points.push(c);
    }
    return points;
  }
}
