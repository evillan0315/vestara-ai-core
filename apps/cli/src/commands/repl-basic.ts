import type { WorkspaceRuntime, WorkspaceSession } from '@vestara/workspace';
import { BOLD, GOLD, GRAY, GREEN, RED, RESET } from '../output/format.js';

export async function handleSearch(input: string, line: string, session: WorkspaceSession, rl: any): Promise<boolean> {
  if (!input.startsWith('search ')) return false;
  const query = line.slice(7).trim();
  if (!query) {
    console.log(`${GRAY}  Usage: search <term>${RESET}`);
    rl.prompt();
    return true;
  }
  try {
    const results = await session.search(query, 5);
    if (results.length === 0) {
      console.log(`${GRAY}  No results found for "${query}"${RESET}`);
    } else {
      console.log(`${GRAY}  Results for "${query}":${RESET}`);
      for (const r of results.slice(0, 5)) {
        console.log(`  \u2022 ${r.document.title} (${r.document.language}) [score: ${r.score.toFixed(2)}]`);
      }
    }
  } catch (error: any) {
    console.log(`${RED}  Search error: ${error.message}${RESET}`);
  }
  rl.prompt();
  return true;
}

export async function handleRisks(session: WorkspaceSession, rl: any): Promise<boolean> {
  const profile = session.profile;
  if (profile.risks.length === 0) {
    console.log(`${GREEN}  No risks detected${RESET}`);
  } else {
    console.log(`${GOLD}  Detected Risks (${profile.risks.length}):${RESET}`);
    for (const risk of profile.risks) {
      const icon = risk.severity === 'high' ? '\u26A0' : risk.severity === 'medium' ? '\u2022' : '\u00B7';
      console.log(`  ${icon} [${risk.severity}] ${risk.category} \u2014 ${risk.detail}`);
      console.log(`     ${GRAY}${risk.location}${RESET}`);
    }
  }
  rl.prompt();
  return true;
}

export async function handleSummary(runtime: WorkspaceRuntime, rl: any): Promise<boolean> {
  const result = runtime.currentWorkspace;
  if (result.presentation) {
    const { RepositoryPresenter } = await import('@vestara/workspace');
    process.stdout.write(new RepositoryPresenter().renderCli(result.presentation));
  } else console.log(`${GRAY}  Summary not available${RESET}`);
  rl.prompt();
  return true;
}

export async function handleHistory(session: WorkspaceSession, rl: any): Promise<boolean> {
  const conv = session.conversation.getConversation((session.conversation as any).listConversations()?.[0]?.id ?? '');
  if (conv) {
    console.log(`${GRAY}Conversation: ${conv.title} (${conv.messages.length} messages)${RESET}`);
    for (const msg of conv.messages) {
      const role = msg.role === 'user' ? 'You' : 'Vestara';
      console.log(`  ${BOLD}${role}${RESET}: ${msg.content.slice(0, 100)}${msg.content.length > 100 ? '...' : ''}`);
    }
  } else console.log(`${GRAY}  No conversation history${RESET}`);
  rl.prompt();
  return true;
}

export async function handleRead(input: string, line: string, rl: any): Promise<boolean> {
  const matches = input.match(/^(read|analyze|cat)\s+/);
  if (!matches) return false;
  const filePath = line.slice(matches[1].length + 1).trim();
  if (!filePath) {
    console.log(`${GRAY}  Usage: read <path>${RESET}`);
    rl.prompt();
    return true;
  }
  try {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
      console.log(`\n${RED}  File not found:${RESET} ${filePath}\n`);
      rl.prompt();
      return true;
    }
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      console.log(`\n${GRAY}  ${resolved} is a directory${RESET}\n`);
      rl.prompt();
      return true;
    }
    if (stat.size > 1_048_576) {
      console.log(`\n${GOLD}  File too large (${(stat.size / 1024).toFixed(0)} KB). Max: 1 MB${RESET}\n`);
      rl.prompt();
      return true;
    }
    const content = fs.readFileSync(resolved, 'utf-8');
    const lines = content.split('\n');
    const lineCount = lines.length;
    const pad = String(lineCount).length;
    console.log(
      `\n${GRAY}${path.basename(resolved)} (${lineCount} lines, ${(stat.size / 1024).toFixed(1)} KB)${RESET}`,
    );
    console.log(`${GRAY}${'─'.repeat(60)}${RESET}`);
    const maxLines = 200;
    const display = lines.slice(0, maxLines);
    for (let i = 0; i < display.length; i++) {
      const lineNo = String(i + 1).padStart(pad);
      console.log(`  ${GRAY}${lineNo}${RESET}  ${display[i]}`);
    }
    if (lines.length > maxLines)
      console.log(`\n${GRAY}  ... ${lines.length - maxLines} more lines (file truncated)${RESET}`);
    console.log();
  } catch (error: any) {
    console.log(`\n${RED}  Error reading file: ${error.message}${RESET}\n`);
  }
  rl.prompt();
  return true;
}

export async function handleExplain(
  input: string,
  line: string,
  session: WorkspaceSession,
  provider: any,
  rl: any,
): Promise<boolean> {
  if (!input.startsWith('explain ')) return false;
  const target = line.slice(8).trim();
  if (!target) {
    console.log(`${GRAY}  Usage: explain <target>${RESET}`);
    rl.prompt();
    return true;
  }
  try {
    const { ExplainService } = await import('@vestara/workspace');
    const result = await new ExplainService({ provider }).explain(target, session);
    process.stdout.write(`\n${result.content}\n\n`);
    try {
      await session.storeMemory('event', `Explained ${target}: ${result.content.slice(0, 100)}...`);
    } catch {}
  } catch (error: any) {
    console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
  }
  rl.prompt();
  return true;
}
