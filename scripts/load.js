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

  await runWriteOnly();
  await runMixed();
} catch (err) {
  console.error(`\nload test failed: ${err.message}`);
  process.exitCode = 1;
}

await stop();

async function runWriteOnly() {
  console.log(
    `\n[1/2] write-only: ${CONNECTIONS} conns, ${DURATION_S}s, POST ${BASE}/transactions\n`,
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
    throw new Error(`write-only: ${nonSuccess} non-2xx or errored responses`);
  }
}

async function runMixed() {
  console.log(
    `\n[2/2] mixed: ${CONNECTIONS} conns, ${DURATION_S}s, ~90% POST (varied timestamps) + ~10% GET\n`,
  );

  const result = await autocannon({
    url: BASE,
    connections: CONNECTIONS,
    duration: DURATION_S,
    requests: [
      {
        method: 'POST',
        path: '/transactions',
        headers: { 'content-type': 'application/json' },
        setupRequest: (req) => {
          // offset in [-5, +64]s: mixes in-window, future, and stale
          const offset = Math.floor(Math.random() * 70) - 5;
          const ts = new Date(Date.now() - offset * 1000).toISOString();
          const amount =
            (Math.random() < 0.8 ? 1 : -1) * Math.max(1, Math.round(Math.random() * 100));
          req.body = JSON.stringify({ timestamp: ts, amount });
          return req;
        },
      },
      {
        method: 'POST',
        path: '/transactions',
        headers: { 'content-type': 'application/json' },
        setupRequest: (req) => {
          const ts = new Date().toISOString();
          const amount = (Math.random() < 0.8 ? 1 : -1) * 10;
          req.body = JSON.stringify({ timestamp: ts, amount });
          return req;
        },
      },
      { method: 'GET', path: '/statistics' },
    ],
  });

  console.log(autocannon.printResult(result));

  const serverErrors = (result['5xx'] ?? 0) + (result.errors ?? 0) + (result.timeouts ?? 0);
  if (serverErrors > 0) {
    throw new Error(`mixed: ${serverErrors} server errors or timeouts`);
  }
}
