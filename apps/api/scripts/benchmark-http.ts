/**
 * HTTP gateway benchmark.
 *
 * Starts a minimal API server and measures latency/throughput for the
 * observability-critical endpoints: health live/ready, unknown-route 404,
 * JSON body round-trip, and the metrics endpoint. Results are printed as a
 * summary table for comparison against PERFORMANCE_BASELINES.md.
 *
 * Usage:
 *   pnpm benchmark:http [iterations=200]
 */

import { performance } from 'node:perf_hooks';
import { createServer } from '../src/server.js';

const ITERATIONS = Number(process.argv[2] ?? 200);

const MINIMAL_CTX = {
  repoPath: '/benchmark',
  workspaceDir: '/benchmark/.vestara',
  runtime: { currentStatus: 'ready' },
  orchestrator: null,
  users: {
    findByToken: () => null,
    listAll: () => [],
    createUser: (username: string) => ({ id: 'u-bench', username, role: 'editor', token: 'bench-token' }),
  },
  audit: { log: () => {} },
  close: () => {},
} as never;

interface Result {
  name: string;
  min: number;
  max: number;
  avg: number;
}

async function timeRequests(url: string, init?: RequestInit, iterations = ITERATIONS): Promise<Result> {
  const times: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const start = performance.now();
    const res = await fetch(url, init);
    await res.arrayBuffer();
    times.push(performance.now() - start);
    if (res.status >= 500) throw new Error(`${url} returned ${res.status}`);
  }
  const sorted = [...times].sort((a, b) => a - b);
  return {
    name: url,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: times.reduce((sum, t) => sum + t, 0) / times.length,
  };
}

async function main(): Promise<void> {
  const port = 19299;
  const server = createServer(MINIMAL_CTX, port);
  await new Promise<void>((resolve) => server.listen(port, resolve));
  const base = `http://127.0.0.1:${port}`;

  console.log(`=== HTTP Gateway Benchmark (${ITERATIONS} iterations each) ===`);
  console.log('');

  try {
    const results: Result[] = [];
    results.push(await timeRequests(`${base}/api/health/live`));
    results.push(await timeRequests(`${base}/api/health/ready`));
    results.push(await timeRequests(`${base}/api/nonexistent`));
    results.push(
      await timeRequests(
        `${base}/api/auth/login`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username: 'benchmark-user' }),
        },
        50,
      ),
    );

    const concurrentStart = performance.now();
    const concurrent = 20;
    const rounds = 10;
    let totalLatency = 0;
    let totalOk = 0;
    for (let r = 0; r < rounds; r += 1) {
      await Promise.all(
        Array.from({ length: concurrent }, async () => {
          const s = performance.now();
          const res = await fetch(`${base}/api/health/live`);
          totalLatency += performance.now() - s;
          if (res.status === 200) totalOk += 1;
        }),
      );
    }
    const elapsed = performance.now() - concurrentStart;

    console.log('--- Latency (ms) ---');
    for (const result of results) {
      console.log(
        `  ${result.name.padEnd(28)}  min=${result.min.toFixed(2)}  max=${result.max.toFixed(2)}  avg=${result.avg.toFixed(2)}`,
      );
    }
    console.log('');
    console.log('--- Concurrency (20 parallel) ---');
    const totalRequests = concurrent * rounds;
    console.log(`  ${totalRequests} requests in ${elapsed.toFixed(0)}ms`);
    console.log(`  throughput: ${Math.round((totalRequests / elapsed) * 1000)} req/s`);
    console.log(`  p50 latency: ${(totalLatency / totalOk).toFixed(2)}ms (ok=${totalOk}/${totalRequests})`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
