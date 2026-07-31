import * as fs from 'node:fs';
import * as path from 'node:path';
import { ArchitectureRuntime } from '@vestara/architecture-runtime';
import { BOLD, CYAN, GOLD, GRAY, GREEN, RED, RESET } from '../output/format.js';

function resolveAdrDir(): string {
  const envDir = process.env['VESTARA_BLUEPRINT_DIR'];
  if (envDir) return path.join(envDir, '00-governance', 'adr');

  const fromCwd = path.resolve(process.cwd(), '..', 'vestara-blueprint', '00-governance', 'adr');
  if (fs.existsSync(fromCwd)) return fromCwd;

  const fromCwdAlt = path.resolve(process.cwd(), 'vestara-blueprint', '00-governance', 'adr');
  if (fs.existsSync(fromCwdAlt)) return fromCwdAlt;

  const fromDirname = path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    '..',
    '..',
    'vestara-blueprint',
    '00-governance',
    'adr',
  );
  if (fs.existsSync(fromDirname)) return fromDirname;

  return fromCwd;
}

function runtime(): ArchitectureRuntime {
  return new ArchitectureRuntime(resolveAdrDir());
}

function printAdr(node: {
  id: string;
  adr: string;
  title: string;
  category: string;
  status: string;
  dependsOn: string[];
  influences: string[];
}): void {
  const statusIcon =
    node.status === 'superseded'
      ? `${GRAY}○${RESET}`
      : node.status === 'deprecated'
        ? `${RED}✗${RESET}`
        : `${GOLD}?${RESET}`;
  console.log(`  ${statusIcon} ${BOLD}${node.adr}${RESET} ${node.title}`);
  console.log(`       ${GRAY}id: ${node.id}  |  category: ${node.category}  |  status: ${node.status}${RESET}`);
  if (node.dependsOn.length > 0) {
    console.log(`       ${GRAY}depends on: ${node.dependsOn.join(', ')}${RESET}`);
  }
  if (node.influences.length > 0) {
    console.log(`       ${GRAY}influences: ${node.influences.join(', ')}${RESET}`);
  }
}

export async function runArchitecture(cliArgs: string[]): Promise<void> {
  const sub = cliArgs[0];

  if (!sub || sub === 'list') {
    const ar = runtime();
    const all = ar.getAllNodes();
    console.log(`\n  ${BOLD}${GOLD}Architecture Knowledge Graph${RESET}`);
    console.log(`  ${GRAY}${all.length} decisions${RESET}\n`);
    for (const node of all) {
      printAdr(node);
      console.log();
    }
    return;
  }

  if (sub === 'show') {
    const id = cliArgs[1];
    if (!id) {
      console.log(`${GOLD}Usage: vestara architecture show <id>${RESET}`);
      return;
    }
    const ar = runtime();
    const node = ar.getNode(id);
    if (!node) {
      console.log(`${RED}ADR not found: ${id}${RESET}`);
      return;
    }
    console.log();
    console.log(`  ${BOLD}${node.adr}: ${node.title}${RESET}`);
    console.log(`  ${GRAY}${'-'.repeat(50)}${RESET}`);
    console.log(`  id:         ${node.id}`);
    console.log(`  status:     ${node.status}`);
    console.log(`  category:   ${node.category}`);
    console.log(`  file:       ${node.filePath}`);
    if (node.dependsOn.length > 0) console.log(`  depends on: ${node.dependsOn.join(', ')}`);
    if (node.influences.length > 0) console.log(`  influences: ${node.influences.join(', ')}`);
    if (node.referencedBy.length > 0) {
      console.log(`  referenced by:`);
      for (const ref of node.referencedBy) {
        console.log(`    ${ref.type}: ${ref.target}`);
      }
    }
    console.log();
    return;
  }

  if (sub === 'depends-on') {
    const id = cliArgs[1];
    if (!id) {
      console.log(`${GOLD}Usage: vestara architecture depends-on <id>${RESET}`);
      return;
    }
    const ar = runtime();
    const deps = ar.getDependencies(id);
    console.log(`\n  ${BOLD}Dependencies of ${id}${RESET}\n`);
    if (deps.length === 0) {
      console.log(`  ${GRAY}(none)${RESET}\n`);
      return;
    }
    for (const dep of deps) {
      printAdr(dep);
      console.log();
    }
    return;
  }

  if (sub === 'dependents-of') {
    const id = cliArgs[1];
    if (!id) {
      console.log(`${GOLD}Usage: vestara architecture dependents-of <id>${RESET}`);
      return;
    }
    const ar = runtime();
    const deps = ar.getDependents(id);
    console.log(`\n  ${BOLD}Dependents of ${id}${RESET}\n`);
    if (deps.length === 0) {
      console.log(`  ${GRAY}(none)${RESET}\n`);
      return;
    }
    for (const dep of deps) {
      printAdr(dep);
      console.log();
    }
    return;
  }

  if (sub === 'influences') {
    const role = cliArgs[1];
    if (!role) {
      console.log(`${GOLD}Usage: vestara architecture influences <role>${RESET}`);
      return;
    }
    const ar = runtime();
    const nodes = ar.findDecisionsByRole(role);
    console.log(`\n  ${BOLD}ADRs influencing "${role}"${RESET}\n`);
    if (nodes.length === 0) {
      console.log(`  ${GRAY}(none)${RESET}\n`);
      return;
    }
    for (const node of nodes) {
      printAdr(node);
      console.log();
    }
    return;
  }

  if (sub === 'impact') {
    const id = cliArgs[1];
    if (!id) {
      console.log(`${GOLD}Usage: vestara architecture impact <id>${RESET}`);
      return;
    }
    const ar = runtime();
    const report = ar.analyzeImpact(id);
    if (!report) {
      console.log(`${RED}ADR not found: ${id}${RESET}`);
      return;
    }
    console.log();
    console.log(`  ${BOLD}${GOLD}Impact Analysis: ${report.target.adr}${RESET}`);
    console.log(`  ${report.target.title}`);
    console.log(
      `  ${GRAY}Risk: ${report.risk === 'high' ? `${RED}${report.risk.toUpperCase()}${RESET}${GRAY}` : report.risk === 'medium' ? `${GOLD}${report.risk.toUpperCase()}${RESET}${GRAY}` : `${GREEN}${report.risk.toUpperCase()}${RESET}${GRAY}`}${RESET}`,
    );
    console.log();
    if (report.affectedAdrs.length > 0) {
      console.log(`  ${BOLD}Affected ADRs${RESET}`);
      for (const adr of report.affectedAdrs) {
        console.log(`    ${adr.adr} — ${adr.title}`);
      }
      console.log();
    }
    if (report.affectedBlueprints.length > 0) {
      console.log(`  ${BOLD}Affected Blueprint${RESET}`);
      for (const bp of report.affectedBlueprints) {
        console.log(`    ${bp}`);
      }
      console.log();
    }
    if (report.affectedAgents.length > 0) {
      console.log(`  ${BOLD}Affected Agents${RESET}`);
      for (const agent of report.affectedAgents) {
        console.log(`    ${agent}`);
      }
      console.log();
    }
    return;
  }

  console.log(`${GOLD}Usage:${RESET}`);
  console.log(`  vestara architecture list              List all ADRs`);
  console.log(`  vestara architecture show <id>         Show a decision`);
  console.log(`  vestara architecture depends-on <id>   Show dependencies`);
  console.log(`  vestara architecture dependents-of <id> Show dependents`);
  console.log(`  vestara architecture influences <role>  Find ADRs influencing a role`);
  console.log(`  vestara architecture impact <id>       Impact analysis`);
}

export async function runBlueprintVerify(): Promise<void> {
  const ar = runtime();
  const report = ar.verify();

  console.log(`\n  ${BOLD}${GOLD}Vestara Blueprint Verification${RESET}`);
  console.log(`  ${GRAY}${'='.repeat(40)}${RESET}\n`);

  const ok = (label: string, count: number) => console.log(`  ${GREEN}✓${RESET} ${label}: ${BOLD}${count}${RESET}`);
  const fail = (label: string, count: number) => console.log(`  ${RED}✗${RESET} ${label}: ${BOLD}${count}${RESET}`);

  ok('Foundational ADRs', report.totalAdrs);
  console.log();

  if (report.brokenDependencies.length > 0) {
    fail('Broken Dependencies', report.brokenDependencies.length);
    for (const bd of report.brokenDependencies) {
      console.log(`       ${RED}→${RESET} ${bd.from} ${GRAY}depends on${RESET} ${bd.to} ${GRAY}— ${bd.error}${RESET}`);
    }
  } else {
    ok('Broken Dependencies', 0);
  }

  if (report.circularDependencies.length > 0) {
    fail('Circular Dependencies', report.circularDependencies.length);
    for (const cycle of report.circularDependencies) {
      console.log(`       ${RED}→${RESET} ${cycle.join(' → ')}${RESET}`);
    }
  } else {
    ok('Circular Dependencies', 0);
  }

  if (report.missingReferences.length > 0) {
    fail('Missing References', report.missingReferences.length);
  } else {
    ok('Missing References', 0);
  }

  if (report.duplicateIds.length > 0) {
    fail('Duplicate IDs', report.duplicateIds.length);
  } else {
    ok('Duplicate IDs', 0);
  }

  console.log();
  if (report.pass) {
    console.log(`  ${GREEN}${BOLD}Architecture Graph: PASS${RESET}`);
  } else {
    console.log(`  ${RED}${BOLD}Architecture Graph: FAIL${RESET}`);
  }
  console.log();
}
