import autocannon from 'autocannon';

import { ensureBuildExists, startServer, waitForReady } from './lib/utils.js';

const PORT = 4011;
const BASE = `http://127.0.0.1:${PORT}`;
const DURATION_S = 10;
const CONNECTIONS = 100;

ensureBuildExists();
const { stop } = startServer({ port: PORT, silent: true });

try {
  await waitForReady(`${BASE}/statistics`);

  console.log(
    `running load test: ${CONNECTIONS} connections, ${DURATION_S}s, POST ${BASE}/transactions\n`,
  );

  const result = await autocannon({
    url: `${BASE}/transactions`,
    method: 'POST',
    connections: CONNECTIONS,
    duration: DURATION_S,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ timestamp: new Date().toISOString(), amount: 10 }),
  });

  console.log(autocannon.printResult(result));

  const nonSuccess = result.non2xx + (result.errors ?? 0);
  if (nonSuccess > 0) {
    throw new Error(`load test saw ${nonSuccess} non-2xx or errored responses`);
  }
} catch (err) {
  console.error(`\nload test failed: ${err.message}`);
  process.exitCode = 1;
}

await stop();
