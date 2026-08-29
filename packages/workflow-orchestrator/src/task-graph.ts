/**
 * Task graph scheduling — topological ordering of tasks into parallel waves
 * from their `dependencies` (the DAG emitted by the planner, PCS-025 §12).
 */

export interface GraphTask {
  readonly id: string;
  readonly dependencies: readonly string[];
}

/** Full topological sort into parallel waves; cycle-safe (last wave = remainder). */
export function computeWaves(tasks: readonly GraphTask[]): string[][] {
  const remaining = new Set(tasks.map((task) => task.id));
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const waves: string[][] = [];
  let guard = 0;

  while (remaining.size > 0 && guard < tasks.length * 2 + 1) {
    guard++;
    const wave = [...remaining].filter((id) =>
      (byId.get(id)?.dependencies ?? []).every((dependency) => !remaining.has(dependency)),
    );
    if (wave.length === 0) {
      waves.push([...remaining]);
      break;
    }
    waves.push(wave);
    for (const id of wave) remaining.delete(id);
  }
  return waves;
}

/** Tasks whose dependencies are all in `completed` (or unknown) — ready to run. */
export function readyTasks(tasks: readonly GraphTask[], completed: ReadonlySet<string>): GraphTask[] {
  return tasks.filter((task) => task.dependencies.every((dependency) => completed.has(dependency)));
}

export function detectCycles(tasks: readonly GraphTask[]): string[][] {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];

  const visit = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      const index = stack.indexOf(id);
      if (index >= 0) cycles.push([...stack.slice(index), id]);
      return;
    }
    visiting.add(id);
    stack.push(id);
    const task = tasks.find((candidate) => candidate.id === id);
    for (const dependency of task?.dependencies ?? []) visit(dependency);
    stack.pop();
    visiting.delete(id);
    visited.add(id);
  };

  for (const task of tasks) visit(task.id);
  return cycles;
}
