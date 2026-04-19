import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

export function ensureBuildExists() {
  if (!existsSync('dist/server.js')) {
    console.error('dist/server.js not found. Run `pnpm build` first.');
    process.exit(1);
  }
}

export function startServer({ port, silent = false }) {
  let closing = false;
  let exited = false;

  const child = spawn('node', ['dist/server.js'], {
    env: { ...process.env, NODE_ENV: 'production', PORT: String(port) },
    stdio: silent ? ['ignore', 'ignore', 'inherit'] : ['ignore', 'inherit', 'inherit'],
  });

  child.on('exit', (code) => {
    exited = true;
    if (!closing) {
      console.error(`\nserver exited unexpectedly with code ${code}`);
      process.exitCode = 1;
    }
  });

  function stop() {
    if (closing || exited) return Promise.resolve();
    closing = true;
    return new Promise((resolve) => {
      child.once('exit', () => resolve());
      child.kill();
    });
  }

  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());

  return { stop };
}

export async function waitForReady(url, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      lastError = new Error(`status ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await sleep(100);
  }
  throw new Error(`server not ready within ${timeoutMs}ms: ${lastError?.message ?? 'unknown'}`);
}
