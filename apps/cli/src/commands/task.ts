/**
 * Task CLI commands — manage tasks within plans.
 *
 * Architecture Traceability:
 *   PCS-003 — Planning (Task lifecycle within plans)
 */

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GRAY = '\x1b[90m';

export async function runTaskCreate(_planId: string): Promise<void> {
  console.log();
  console.log(`${RED}Task creation requires an AI provider in the workspace REPL.${RESET}`);
  console.log(`${GRAY}Open the workspace first with 'vestara open .', then use${RESET}`);
  console.log(`${GRAY}  plan <goal>    to create a plan with tasks${RESET}`);
  console.log(`${GRAY}  plan list      to see existing plans${RESET}`);
  console.log();
}

export async function runTaskAssign(_planId: string, _task: string): Promise<void> {
  console.log();
  console.log(`${RED}Task assignment is managed via the Agent Control Center.${RESET}`);
  console.log(`${GRAY}Use 'vestara agents' to list available agents,${RESET}`);
  console.log(`${GRAY}then open the workspace REPL with 'vestara open .' for full task management.${RESET}`);
  console.log();
}

export async function runTaskPrioritize(_planId: string, _task: string): Promise<void> {
  console.log();
  console.log(`${RED}Task prioritization is managed through the workspace REPL.${RESET}`);
  console.log(`${GRAY}Open the workspace with 'vestara open .' and use 'plan' commands.${RESET}`);
  console.log();
}

export async function runTaskComment(_planId: string, _message: string): Promise<void> {
  console.log();
  console.log(`${RED}Task comments are managed through the collaboration system.${RESET}`);
  console.log(`${GRAY}Open the workspace with 'vestara open .' and use 'collab' commands.${RESET}`);
  console.log();
}
