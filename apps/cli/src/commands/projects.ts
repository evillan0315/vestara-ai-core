import { BOLD, GOLD, GREEN, RED, GRAY, RESET } from '../output/format.js';
import { openSharedDb } from '../lib/db.js';

export async function runProjectsList(): Promise<void> {
  console.log(); console.log(`${BOLD}${GOLD}Vestara Projects${RESET}`); console.log(`${GRAY}─────────────────────────────────────${RESET}`); console.log();
  try {
    const db = await openSharedDb();
    const { ProjectStorage } = await import('@vestara/workspace');
    const store = new ProjectStorage(db);
    const projects = await store.listProjects();
    const sprints = await store.listSprints();
    console.log(`  ${BOLD}Summary${RESET}`); console.log(`    Projects:    ${projects.length}`); console.log(`    Sprints:     ${sprints.length}`); console.log();
    if (projects.length === 0) { console.log(`  ${GRAY}No projects found.${RESET}\n`); return; }
    const statusCounts: Record<string, number> = {};
    for (const p of projects) statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
    console.log(`    Statuses:    ${Object.entries(statusCounts).map(([s, c]) => `${s}: ${c}`).join(', ')}`);
    console.log();
    for (const project of projects) {
      const stats = await store.getProjectStats(project.id);
      const statusIcon = project.status === 'active' ? `${GREEN}●${RESET}` : project.status === 'completed' ? `${GREEN}✔${RESET}` : project.status === 'cancelled' ? `${RED}✘${RESET}` : `${GRAY}○${RESET}`;
      const activeSprints = sprints.filter((s: any) => s.projectId === project.id && s.status === 'active').length;
      console.log(`  ${statusIcon} ${BOLD}${project.name}${RESET}  ${GRAY}(${project.id})${RESET}`);
      if (project.description) console.log(`       ${project.description.length > 100 ? project.description.slice(0, 97) + '...' : project.description}`);
      console.log(`       Status: ${GREEN}${project.status}${RESET}  ·  Priority: ${project.priority}  ·  Tasks: ${stats.done}/${stats.total}  ·  Sprints: ${sprints.length} (${activeSprints} active)`);
      console.log();
    }
  } catch (err: any) { console.log(`  ${RED}Error: ${err.message}${RESET}\n`); }
}
