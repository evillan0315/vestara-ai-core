import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  type DocumentationRepositoryConfig,
  DocumentationService,
  projectDocumentationGraph,
} from '@vestara/documentation';

function optionValue(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

async function serviceFor(root: string): Promise<DocumentationService> {
  const ecosystem = path.dirname(root);
  const repositories: DocumentationRepositoryConfig[] = [
    { id: 'vestara-ai-core', path: root, authority: 'implementation', writable: true },
    { id: 'vestara-blueprint', path: path.join(ecosystem, 'vestara-blueprint'), authority: 'architecture' },
    { id: 'vestara-standards', path: path.join(ecosystem, 'vestara-standards'), authority: 'standard' },
    { id: 'vestara-specifications', path: path.join(ecosystem, 'vestara-specifications'), authority: 'specification' },
  ];
  const service = new DocumentationService({
    repositories,
    workspaceId: root,
    stateDirectory: path.join(root, '.vestara', 'documentation'),
  });
  await service.initialize();
  await service.start();
  return service;
}

export async function runDocs(args: readonly string[]): Promise<void> {
  const command = args[0] ?? 'status';
  const json = args.includes('--json');
  const service = await serviceFor(path.resolve(optionValue(args, '--workspace') ?? process.cwd()));
  try {
    let result: unknown;
    if (command === 'scan') result = await service.scan();
    else if (command === 'status') result = service.getStatus();
    else if (command === 'findings') {
      await service.scan();
      result = { findings: service.getFindings() };
    } else if (command === 'impact')
      result = await service.analyzeImpact({
        workspaceId: process.cwd(),
        executionId: optionValue(args, '--execution'),
        changedPaths: args
          .filter((item) => !item.startsWith('--') && item !== command)
          .slice(optionValue(args, '--execution') ? 2 : 0),
      });
    else if (command === 'plan')
      result = await service.createPlan(optionValue(args, '--execution') ? 'execution' : 'manual');
    else if (command === 'run' || command === 'propose') {
      const id = optionValue(args, '--plan');
      if (!id) throw new Error('--plan is required');
      result = { proposals: await service.runPlan(id, true) };
    } else if (command === 'verify')
      result = await service.verify(
        args.includes('--strict') ? 'strict' : args.includes('--fast') ? 'fast' : 'standard',
      );
    else if (command === 'report') {
      if (!service.getInventory()) await service.scan();
      const report = service.createReport();
      result = json ? report : service.reportAsMarkdown(report);
    } else if (command === 'approve' || command === 'reject') {
      const id = optionValue(args, '--proposal');
      if (!id) throw new Error('--proposal is required');
      result = await service.decideProposal(id, command, optionValue(args, '--actor') ?? 'local-operator');
    } else if (command === 'apply') {
      const id = optionValue(args, '--proposal');
      if (!id) throw new Error('--proposal is required');
      result = await service.applyProposal(id, optionValue(args, '--actor') ?? 'local-operator');
    } else if (command === 'graph') {
      const inventory = await service.scan();
      result = projectDocumentationGraph(inventory, service.listPlans(), service.listProposals());
    } else if (command === 'baseline') {
      await service.scan();
      const baseline = service.createBaseline(args.includes('--include-warnings') ? ['warning', 'error'] : ['error']);
      const output = path.resolve(optionValue(args, '--output') ?? 'docs/documentation-baseline.json');
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
      result = { output, baselineCount: baseline.findingIds.length };
    } else if (command === 'check') {
      const baselinePath = path.resolve(optionValue(args, '--baseline') ?? 'docs/documentation-baseline.json');
      const baseline = JSON.parse(
        fs.readFileSync(baselinePath, 'utf8'),
      ) as import('@vestara/documentation').DocumentationBaseline;
      const checked = await service.checkBaseline(baseline);
      result = checked;
      const output = optionValue(args, '--output');
      if (output) {
        const reportPath = path.resolve(output);
        fs.mkdirSync(path.dirname(reportPath), { recursive: true });
        fs.writeFileSync(reportPath, `${JSON.stringify(checked, null, 2)}\n`, 'utf8');
      }
      if (!checked.passed) process.exitCode = 1;
    } else
      throw new Error(
        'Usage: vestara docs scan|status|findings|impact|plan|run|verify|report|propose|approve|reject|apply|graph|baseline|check [--json]',
      );
    console.log(typeof result === 'string' ? result : JSON.stringify(result, null, json ? 2 : 2));
  } finally {
    await service.dispose();
  }
}
