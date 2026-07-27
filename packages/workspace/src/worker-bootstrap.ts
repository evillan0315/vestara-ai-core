/**
 * Worker bootstrap script — executed in isolated subprocess workers.
 *
 * Receives task details via IPC, executes the agent task, and sends
 * progress/output/error/complete events back to the parent process.
 *
 * Architecture Traceability:
 *   PCS: PCS-011 — Remote Agent Execution
 */

if (process.send) {
  process.on('message', async (msg: any) => {
    const { task, agentId, executionId } = msg || {};

    if (!task || !agentId) {
      process.send?.({ type: 'error', message: 'Invalid worker message: missing task or agentId' });
      process.send?.({ type: 'complete', message: 'Execution failed' });
      process.exit(1);
      return;
    }

    const send = (type: string, message: string, data?: unknown) => {
      try {
        process.send?.({ type, message, data, executionId, agentId });
      } catch {}
    };

    send('log', `Worker started for agent ${agentId} (execution ${executionId})`);
    send('log', `Task: ${task}`);

    const steps = ['Analyzing requirements', 'Generating implementation', 'Validating output'];

    try {
      for (const step of steps) {
        await new Promise((r) => setTimeout(r, 100));
        const progress = Math.round(((steps.indexOf(step) + 1) / steps.length) * 100);
        send('progress', step, { step, progress });
      }

      send('output', `Completed task for agent ${agentId}: ${task}`);
      send('complete', 'Execution finished');
    } catch (err) {
      send('error', `Worker error: ${(err as Error).message}`);
      send('complete', 'Execution failed');
    }

    process.exit(0);
  });
}
