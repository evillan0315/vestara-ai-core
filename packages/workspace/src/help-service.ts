/**
 * HelpService — Context-sensitive help and lifecycle tour for the Vestara AI OS.
 *
 * Provides topic-based help, command discovery, and a guided welcome
 * tour for first-time users. Every topic maps to a capability.
 *
 * Architecture Traceability:
 *   Product Principle: Every capability is independently demonstrable
 */

export interface HelpTopic {
  id: string;
  title: string;
  description: string;
  command: string;
  example: string;
  related: string[];
}

const TOPICS: HelpTopic[] = [
  {
    id: 'open',
    title: 'Open a Repository',
    description: 'Open any repository to analyze its structure, dependencies, risks, and health score.',
    command: 'vestara open .',
    example: 'vestara open /path/to/repo',
    related: ['explain', 'plan', 'doctor'],
  },
  {
    id: 'explain',
    title: 'Explain Architecture',
    description: 'Ask questions about the repository architecture, packages, modules, and risks.',
    command: 'explain <target>',
    example: 'explain packages/workspace',
    related: ['open', 'plan', 'doctor'],
  },
  {
    id: 'plan',
    title: 'Create a Plan',
    description: 'Transform a goal into an executable plan with tasks and effort estimates.',
    command: 'plan <goal>',
    example: 'plan add input validation',
    related: ['explain', 'predict', 'implement'],
  },
  {
    id: 'predict',
    title: 'Predict Impact',
    description: 'Predict the likely impact of a change before implementing it.',
    command: 'predict <goal>',
    example: 'predict plan P-1',
    related: ['plan', 'recommend'],
  },
  {
    id: 'recommend',
    title: 'Get Recommendations',
    description: 'Get AI-assisted recommendations for the best course of action.',
    command: 'recommend',
    example: 'recommend plan P-1',
    related: ['predict', 'implement'],
  },
  {
    id: 'implement',
    title: 'Implement Changes',
    description: 'Generate code changes from an approved plan. Review before applying.',
    command: 'implement <plan-id>',
    example: 'implement P-1',
    related: ['plan', 'verify'],
  },
  {
    id: 'verify',
    title: 'Verify Changes',
    description: 'Run deterministic checks (typecheck, tests, build) to validate changes.',
    command: 'verify <cs-id>',
    example: 'verify CS-1',
    related: ['implement', 'collaborate'],
  },
  {
    id: 'collaborate',
    title: 'Review and Approve',
    description: 'Submit changes for review, add comments, approve or reject.',
    command: 'collab submit <cs-id>',
    example: 'collab approve CR-1',
    related: ['verify', 'enterprise'],
  },
  {
    id: 'agent',
    title: 'Agent Control Center',
    description: 'List, configure, and run specialized AI agents. 7 built-in agents available.',
    command: 'agent list',
    example: 'agent run architect "analyze dependencies"',
    related: ['plan', 'implement', 'doctor'],
  },
  {
    id: 'projects',
    title: 'Project Management',
    description: 'Create and manage projects with tasks, sprints, and team tracking.',
    command: 'projects',
    example: 'See all projects and task status',
    related: ['agent', 'plan'],
  },
  {
    id: 'sprints',
    title: 'Sprint Tracking',
    description: 'Track active sprints with progress bars, remaining days, and task completion.',
    command: 'sprints',
    example: 'View active sprints on the dashboard',
    related: ['projects', 'plan'],
  },
  {
    id: 'memory',
    title: 'Knowledge Graph',
    description: 'Index, search, and explore the workspace knowledge graph across all artifacts.',
    command: 'memory search <query>',
    example: 'memory search provider-runtime',
    related: ['explain', 'open'],
  },
  {
    id: 'doctor',
    title: 'System Diagnostics',
    description: 'Run health checks on audio, conversation pipeline, providers, and system services.',
    command: 'vestara doctor',
    example: 'vestara doctor audio',
    related: ['open', 'agent'],
  },
  {
    id: 'conversation-audit',
    title: 'Conversation Feature Audit',
    description: 'Scan all conversation packages and report build status, test coverage, and issues.',
    command: 'pnpm conversation-audit',
    example: 'pnpm conversation-audit',
    related: ['doctor', 'open'],
  },
  {
    id: 'suggest',
    title: 'AI Suggestions',
    description: 'Get AI-powered suggestions based on workspace health, risks, and activity.',
    command: 'suggest',
    example: 'suggest',
    related: ['recommend', 'plan'],
  },
  {
    id: 'profile',
    title: 'User Profile',
    description: 'View your conversational profile including name, role, preferred stack, and goals.',
    command: 'profile',
    example: 'profile',
    related: ['open', 'suggest'],
  },
  {
    id: 'enterprise',
    title: 'Enterprise Management',
    description: 'Manage teams, projects, approval policies, and audit trails.',
    command: 'enterprise',
    example: 'enterprise team create "Platform"',
    related: ['collaborate'],
  },
  {
    id: 'workspace',
    title: 'Engineering Sessions',
    description: 'Create and run sessions that orchestrate the full development lifecycle.',
    command: 'workspace create <title>',
    example: 'workspace create "Add OAuth"',
    related: ['plan', 'implement', 'verify'],
  },
  {
    id: 'os',
    title: 'AI OS Management',
    description: 'Monitor system health, manage services, and view system metrics.',
    command: 'os status',
    example: 'os dashboard',
    related: ['workspace', 'doctor'],
  },
];

export class HelpService {
  /**
   * Get all help topics.
   */
  listTopics(): HelpTopic[] {
    return TOPICS;
  }

  /**
   * Find a topic by ID or partial match.
   */
  findTopic(query: string): HelpTopic | undefined {
    const lower = query.toLowerCase();
    return TOPICS.find((t) => t.id === lower || t.title.toLowerCase().includes(lower) || t.command.includes(lower));
  }

  /**
   * Get related topics for a given topic.
   */
  getRelated(topic: HelpTopic): HelpTopic[] {
    return topic.related.map((id) => TOPICS.find((t) => t.id === id)).filter(Boolean) as HelpTopic[];
  }

  /**
   * Get topics for a specific workspace state.
   */
  getTopicsForState(hasWorkspace: boolean, hasPlan: boolean, hasChangeSet: boolean): HelpTopic[] {
    if (!hasWorkspace) return TOPICS.filter((t) => ['open', 'os'].includes(t.id));
    if (!hasPlan)
      return TOPICS.filter((t) => ['explain', 'plan', 'memory', 'agent', 'enterprise', 'os'].includes(t.id));
    if (!hasChangeSet) return TOPICS.filter((t) => ['predict', 'recommend', 'implement'].includes(t.id));
    return TOPICS.filter((t) => ['verify', 'collaborate'].includes(t.id));
  }

  /**
   * Render a topic for terminal display.
   */
  renderTopic(topic: HelpTopic): string {
    const lines: string[] = [];
    lines.push(`${topic.title}`);
    lines.push(`${'─'.repeat(topic.title.length)}`);
    lines.push('');
    lines.push(`  ${topic.description}`);
    lines.push('');
    lines.push(`  Command: ${topic.command}`);
    lines.push(`  Example: ${topic.example}`);
    if (topic.related.length > 0) {
      lines.push('');
      lines.push(
        `  Related: ${topic.related
          .map((r) => {
            const rel = TOPICS.find((t) => t.id === r);
            return rel ? rel.title : r;
          })
          .join(', ')}`,
      );
    }
    return lines.join('\n');
  }

  /**
   * Render the welcome tour for first-time users.
   */
  renderWelcomeTour(): string {
    const steps = [
      {
        step: 1,
        title: 'Open a Repository',
        command: 'vestara open .',
        detail: 'Start by opening any repository. Vestara analyzes structure, dependencies, risks, and health.',
      },
      {
        step: 2,
        title: 'Explore',
        command: 'explain architecture',
        detail: 'Ask questions about the codebase. Understand packages, entry points, and architecture.',
      },
      {
        step: 3,
        title: 'Health Check',
        command: 'vestara doctor',
        detail: 'Run diagnostics on audio, conversation pipeline, providers, and system services.',
      },
      {
        step: 4,
        title: 'Plan',
        command: 'plan <goal>',
        detail: 'Describe what you want to build. Vestara creates a structured plan with tasks.',
      },
      {
        step: 5,
        title: 'Projects & Tasks',
        command: 'projects',
        detail: 'Track work with projects, tasks, and sprints. Monitor progress on the dashboard.',
      },
      {
        step: 6,
        title: 'Agents',
        command: 'agent list',
        detail: 'Use 7 specialized AI agents for architecture, development, verification, and more.',
      },
      {
        step: 7,
        title: 'Implement',
        command: 'implement <plan-id>',
        detail: 'Generate code changes from an approved plan. Review before applying.',
      },
      {
        step: 8,
        title: 'Verify',
        command: 'verify <cs-id>',
        detail: 'Run automated checks: typecheck, tests, build. Verify outcomes.',
      },
      {
        step: 9,
        title: 'Collaborate',
        command: 'collab submit <cs-id>',
        detail: 'Submit changes for review. Approve, comment, and track decisions.',
      },
      {
        step: 10,
        title: 'Profile',
        command: 'profile',
        detail: 'View your conversational profile. Vestara learns your preferences over time.',
      },
    ];

    const lines: string[] = [];
    lines.push('Welcome to Vestara AI OS');
    lines.push('═══════════════════════════');
    lines.push('');
    lines.push('The Vestara AI OS experience:');
    lines.push('');

    for (const s of steps) {
      lines.push(`  Step ${s.step}: ${s.title}`);
      lines.push(`           ${s.command}`);
      lines.push(`           ${s.detail}`);
      lines.push('');
    }

    lines.push('Type "help" at any time for detailed guidance.');
    lines.push('Type "help <topic>" for specific commands.');

    return lines.join('\n');
  }

  /**
   * Render the full topic list.
   */
  renderTopicList(topics?: HelpTopic[]): string {
    const list = topics ?? TOPICS;
    const lines: string[] = ['Available commands:'];
    for (const t of list) {
      lines.push(`  ${t.command.padEnd(35)} ${t.title}`);
    }
    return lines.join('\n');
  }
}
