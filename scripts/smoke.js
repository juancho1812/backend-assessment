import { ensureBuildExists, startServer, waitForReady } from './lib/utils.js';

const PORT = 4010;
const BASE = `http://127.0.0.1:${PORT}`;

ensureBuildExists();
const { stop } = startServer({ port: PORT });

try {
  await waitForReady(`${BASE}/statistics`);

  {
    const res = await fetch(`${BASE}/transactions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ timestamp: new Date().toISOString(), amount: 123 }),
    });
    if (res.status !== 201) {
      throw new Error(`POST /transactions: expected 201, got ${res.status}`);
    }
    console.log('✓ POST /transactions returns 201');
  }

  {
    const res = await fetch(`${BASE}/statistics`);
    const body = await res.json();
    if (body.chargeSum !== 123 || body.chargeCount !== 1) {
      throw new Error(`GET /statistics did not reflect prior write: got ${JSON.stringify(body)}`);
    }
    console.log('✓ GET /statistics reflects the prior write');
  }

  console.log('\nproduction build smoke test passed');
} catch (err) {
  console.error(`\nsmoke test failed: ${err.message}`);
  process.exitCode = 1;
}

await stop();
