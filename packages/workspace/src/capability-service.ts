/**
 * CapabilityService — Exposes VSDE capability maturity and status from the CLI.
 *
 * Reads CSP metadata to show capability state, maturity, and relationships
 * without requiring access to the documentation files at runtime.
 *
 * Architecture Traceability:
 *   VSDE: VSDE-006 — Capability States
 */

export interface CapabilityInfo {
  id: string;
  name: string;
  command: string;
  version: string;
  artifact: string;
  state: 'proposed' | 'specified' | 'approved' | 'implemented' | 'verified' | 'measured' | 'released';
  maturity: {
    specification: number;
    architecture: number;
    implementation: number;
    verification: number;
    documentation: number;
  };
}

function toInfo(d: any): CapabilityInfo {
  const m = d.maturity;
  return {
    id: d.id,
    name: d.name,
    command: d.command,
    version: d.version,
    artifact: d.artifact,
    state: d.state,
    maturity: {
      specification: m[0],
      architecture: m[1],
      implementation: m[2],
      verification: m[3],
      documentation: m[4],
    },
  };
}

const CAPABILITY_DATA: any[] = [
  {
    id: 'CSP-001',
    name: 'Repository Comprehension',
    command: 'vestara open .',
    version: 'v0.3.0',
    artifact: 'RepositoryWorkspace',
    state: 'released',
    maturity: [100, 100, 100, 100, 100],
  },
  {
    id: 'CSP-002',
    name: 'Repository Explanation',
    command: 'vestara explain <target>',
    version: 'v0.3.3',
    artifact: 'Explanation',
    state: 'released',
    maturity: [100, 100, 100, 100, 100],
  },
  {
    id: 'CSP-003',
    name: 'Planning',
    command: 'vestara plan <goal>',
    version: 'v0.4',
    artifact: 'Plan',
    state: 'released',
    maturity: [100, 100, 100, 100, 100],
  },
  {
    id: 'CSP-004',
    name: 'Implementation',
    command: 'vestara implement <plan-id>',
    version: 'v0.5',
    artifact: 'ChangeSet',
    state: 'released',
    maturity: [100, 100, 100, 100, 100],
  },
  {
    id: 'CSP-005',
    name: 'Verification',
    command: 'vestara verify <cs-id>',
    version: 'v0.6',
    artifact: 'VerificationReport',
    state: 'released',
    maturity: [100, 100, 100, 100, 100],
  },
  {
    id: 'CSP-006',
    name: 'Collaboration',
    command: 'vestara collaborate',
    version: 'v0.7',
    artifact: 'CollaborationRecord',
    state: 'released',
    maturity: [100, 100, 100, 100, 100],
  },
  {
    id: 'CSP-007',
    name: 'Agent Runtime',
    command: 'vestara agent',
    version: 'v0.8',
    artifact: 'AgentDefinition',
    state: 'released',
    maturity: [100, 100, 100, 80, 100],
  },
  {
    id: 'CSP-008',
    name: 'Knowledge Graph',
    command: 'vestara memory',
    version: 'v0.9',
    artifact: 'KnowledgeNode',
    state: 'released',
    maturity: [100, 100, 100, 80, 100],
  },
  {
    id: 'CSP-009',
    name: 'Engineering Session',
    command: 'workspace create',
    version: 'v1.0',
    artifact: 'EngineeringSession',
    state: 'released',
    maturity: [100, 100, 100, 80, 100],
  },
  {
    id: 'CSP-010',
    name: 'Workspace UI',
    command: 'apps/workspace',
    version: 'v1.1',
    artifact: 'Web UI',
    state: 'released',
    maturity: [80, 80, 60, 60, 80],
  },
  {
    id: 'CSP-011',
    name: 'Remote Agent Execution',
    command: 'cloud job submit',
    version: 'v1.2',
    artifact: 'AgentWorker',
    state: 'released',
    maturity: [100, 100, 100, 80, 100],
  },
  {
    id: 'CSP-012',
    name: 'Multi-Repository Intelligence',
    command: 'org search',
    version: 'v1.3',
    artifact: 'Organization',
    state: 'released',
    maturity: [100, 100, 100, 100, 100],
  },
  {
    id: 'CSP-013',
    name: 'Enterprise Organizations',
    command: 'enterprise team',
    version: 'v1.4',
    artifact: 'Team, Policy',
    state: 'released',
    maturity: [100, 100, 100, 80, 100],
  },
  {
    id: 'CSP-014',
    name: 'Plugin Ecosystem',
    command: 'plugin list',
    version: 'v1.5',
    artifact: 'PluginDefinition',
    state: 'released',
    maturity: [100, 100, 100, 100, 100],
  },
  {
    id: 'CSP-015',
    name: 'Cloud Execution',
    command: 'cloud status',
    version: 'v1.6',
    artifact: 'CloudJob',
    state: 'released',
    maturity: [100, 100, 100, 80, 100],
  },
  {
    id: 'CSP-016',
    name: 'AI OS Integration',
    command: 'os status',
    version: 'v2.0',
    artifact: 'SystemInfo',
    state: 'released',
    maturity: [100, 100, 100, 80, 100],
  },
  {
    id: 'CSP-017',
    name: 'Async Execution Engine',
    command: 'exec <type>',
    version: 'v2.1',
    artifact: 'ExecJob',
    state: 'released',
    maturity: [100, 100, 100, 100, 100],
  },
  {
    id: 'CSP-018',
    name: 'Auto-Indexing',
    command: 'auto-index run',
    version: 'v2.2',
    artifact: '—',
    state: 'released',
    maturity: [100, 100, 100, 80, 100],
  },
  {
    id: 'CSP-019',
    name: 'Health Scoring',
    command: '(in vestara open)',
    version: 'v2.3',
    artifact: 'HealthScore',
    state: 'released',
    maturity: [100, 100, 100, 100, 100],
  },
  {
    id: 'CSP-020',
    name: 'Predictive Engineering',
    command: 'predict <goal>',
    version: 'v2.4',
    artifact: 'ImpactAssessment',
    state: 'released',
    maturity: [100, 100, 100, 100, 100],
  },
  {
    id: 'CSP-021',
    name: 'Decision Intelligence',
    command: 'recommend',
    version: 'v2.5',
    artifact: 'Decision',
    state: 'released',
    maturity: [100, 100, 100, 100, 100],
  },
  {
    id: 'CSP-022',
    name: 'Traceable Implementation',
    command: 'implement decision',
    version: 'v2.6',
    artifact: 'ChangeSet',
    state: 'released',
    maturity: [100, 100, 100, 100, 100],
  },
  {
    id: 'CSP-023',
    name: 'Outcome Verification',
    command: 'verify plan/workspace',
    version: 'v2.7',
    artifact: 'VerificationReport',
    state: 'released',
    maturity: [100, 100, 100, 100, 100],
  },
];

export class CapabilityService {
  list(): CapabilityInfo[] {
    return CAPABILITY_DATA.map(toInfo);
  }

  get(id: string): CapabilityInfo | undefined {
    return this.list().find((c) => c.id.toLowerCase() === id.toLowerCase());
  }

  getByCommand(command: string): CapabilityInfo | undefined {
    return this.list().find((c) => c.command.includes(command));
  }

  renderList(): string {
    const lines: string[] = ['Capabilities:'];
    for (const cap of this.list()) {
      const avg = Math.round(
        (cap.maturity.specification +
          cap.maturity.architecture +
          cap.maturity.implementation +
          cap.maturity.verification +
          cap.maturity.documentation) /
          5,
      );
      const bar = '█'.repeat(Math.round(avg / 10)) + '░'.repeat(10 - Math.round(avg / 10));
      lines.push(`  ${cap.id.padEnd(8)} ${bar} ${avg}%  ${cap.name}`);
    }
    return lines.join('\n');
  }

  renderDetail(cap: CapabilityInfo): string {
    return [
      `${cap.id} — ${cap.name}`,
      `Command: ${cap.command}`,
      `Version: ${cap.version}`,
      `Artifact: ${cap.artifact}`,
      `State: ${cap.state}`,
      '',
      'Maturity:',
      `  Specification:  ${cap.maturity.specification}%`,
      `  Architecture:   ${cap.maturity.architecture}%`,
      `  Implementation: ${cap.maturity.implementation}%`,
      `  Verification:   ${cap.maturity.verification}%`,
      `  Documentation:  ${cap.maturity.documentation}%`,
    ].join('\n');
  }
}
