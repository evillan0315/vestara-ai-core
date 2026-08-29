/**
 * `vestara suggest` — AI-powered implementation suggestions for an open
 * repository. Opens the workspace via WorkspaceRuntime (deterministic
 * suggestions, no provider required) and surfaces the highest-priority
 * suggestions with their suggested next commands.
 */

import fs from 'node:fs';
import path from 'node:path';
import { PlanStorage, SuggestionService, WorkspaceRuntime } from '@vestara/workspace';
import initSqlJs from 'sql.js';
import { BOLD, GOLD, GRAY, GREEN, RED, RESET } from '../output/format.js';

export async function runSuggest(targetPath: string | undefined, json = false): Promise<void> {
  const repo = targetPath ? path.resolve(targetPath) : path.resolve(process.env.VESTARA_REPO ?? process.cwd());
  if (!requireRepo(repo)) return;

  const runtime = new WorkspaceRuntime();
  await runtime.open(repo);
  const session = runtime.currentSession;
  if (!session) {
    console.log(`${RED}No workspace session available for ${repo}${RESET}`);
    return;
  }

  const SQL = await initSqlJs();
  const sugDb = new SQL.Database();
  const sugSvc = new SuggestionService({ planStorage: new PlanStorage(sugDb) });
  const suggestions = await sugSvc.generate(session);
  const highPri = suggestions.filter((s) => s.priority === 'high');
  const ranked = [...highPri, ...suggestions.filter((s) => s.priority !== 'high')];

  if (json) {
    console.log(JSON.stringify({ repo, suggestions: ranked }, null, 2));
    return;
  }

  if (ranked.length === 0) {
    console.log(`${GREEN}No suggestions — repository is in good shape.${RESET}`);
    return;
  }
  console.log(`${BOLD}${GOLD}Suggestions for ${repo}${RESET}`);
  for (const suggestion of ranked) {
    const tag = suggestion.priority === 'high' ? RED : suggestion.priority === 'medium' ? GOLD : GRAY;
    console.log(`  ${tag}[${suggestion.priority}]${RESET} ${suggestion.title}`);
    if (suggestion.description) console.log(`      ${GRAY}${suggestion.description}${RESET}`);
    if (suggestion.command) console.log(`      ${GRAY}run: ${BOLD}${suggestion.command}${RESET}`);
  }
}

function requireRepo(repo: string): boolean {
  if (!fs.existsSync(path.join(repo, '.vestara', 'workspace.json'))) {
    console.log(`${RED}No open workspace at ${repo}. Run ${BOLD}vestara open ${repo}${RESET} first.${RESET}`);
    return false;
  }
  return true;
}
