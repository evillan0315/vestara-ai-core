/**
 * Test fixture executor for the subprocess worker.
 *
 * Loaded by the forked subprocess worker via VESTARA_WORKER_EXECUTOR. Proves
 * the IPC executor contract: receive the request, return a result (or throw).
 */

module.exports = {
  execute: async (request) => {
    if (request.task?.summary?.includes('Boom')) {
      throw new Error('fixture failure');
    }
    if (request.kind === 'test') {
      return { status: 'failed', report: { fixture: true } };
    }
    if (request.kind === 'review') {
      return { decision: 'changes-requested', feedback: 'fixture feedback' };
    }
    return { status: 'completed', output: `fixture:${request.task?.summary ?? 'task'}`, agentId: 'remote-worker' };
  },
};
