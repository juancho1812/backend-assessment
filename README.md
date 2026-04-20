# Transactions Service

In-memory HTTP service that records transactions in real time and exposes aggregated statistics over a 60-second sliding window.

## Quickstart

**Requirements:** Node >= 20, pnpm >= 10.

```bash
pnpm install
pnpm build
pnpm start            # http://localhost:3000

# alternatives
pnpm dev              # watch mode with tsx
pnpm test             # unit + integration
pnpm smoke            # sanity check against the production build
pnpm load             # autocannon load test (~20s)
pnpm check            # typecheck + lint + format:check + test
```

The `PORT` environment variable overrides the default port (`3000`).

## API

### `POST /transactions`

Records a transaction.

```json
{ "timestamp": "2026-04-19T12:34:56.789Z", "amount": 42.5 }
```

- `timestamp`: ISO 8601.
- `amount`: non-zero number. Positive values are charges, negative values are refunds.

| Status | Case                                                |
| ------ | --------------------------------------------------- |
| `201`  | Transaction accepted                                |
| `400`  | Invalid body (Zod validation)                       |
| `422`  | `timestamp` in the future or outside the 60s window |

### `GET /statistics`

Returns aggregates for the current sliding window (last 60s according to the system clock).

```json
{
  "chargeSum": 1234.5,
  "chargeCount": 42,
  "chargeAvg": 29.39,
  "refundSum": 250.0,
  "refundCount": 10,
  "refundAvg": 25.0
}
```

**Sign convention:** `refundSum` and `refundAvg` are reported as positive values. Internally, the absolute value of the negative amount is accumulated. This spares the client from having to reason about signs when consuming the aggregate.

When a count is `0`, the associated average is also `0`.

### Quick example

```bash
curl -X POST http://localhost:3000/transactions \
  -H 'content-type: application/json' \
  -d "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"amount\":50}"

curl http://localhost:3000/statistics
```

## Design decisions

### 1. Data structure: 60-bucket ring buffer

A fixed-size array of `60`, indexed by `second % 60`. Each slot is a `Bucket` that aggregates the transactions of the second it represents (`chargeSum`, `chargeCount`, `refundSum`, `refundCount`, plus the value of the second itself so we can detect stale slots).

- **Bounded memory.** The array never grows; 60 slots cover the whole window. Satisfies non-functional requirement #4.
- **Implicit expiration.** When a slot is reused after 60s, the previous bucket is overwritten. No timers or cleanup processes are needed.
- **Stale-slot detection.** Each bucket stores the second it corresponds to. In `add`, we compare `existing.second === txSec`; if they do not match, the slot is occupied by an old bucket and a fresh one is created. In `snapshot`, we filter by the range `[nowSec - 59, nowSec]`, ignoring any stale bucket that has not been overwritten yet.

### 2. Concurrency model: single-threaded + synchronous

Node.js runs JavaScript on a single thread atop the event loop. `aggregator.add` and `aggregator.snapshot` are fully synchronous: there is no `await` between reading state and mutating it. By construction, each invocation executes atomically relative to any other request.

**Conclusion:** no locks, mutexes, or lock-free structures are required. Introducing them here would be overhead without benefit. Satisfies non-functional requirement #1. Empirical evidence: [load test results](#load-test-results).

If this were scaled to worker threads or multiple processes in the future, the model would change: one aggregator per worker with fan-out on reads (`GET /statistics` queries every worker and merges their partial snapshots), or move the state into shared memory (`SharedArrayBuffer` + `Atomics`). Out of scope for this exercise.

### 3. Timestamp policy

| Case                                                   | Policy   | Status |
| ------------------------------------------------------ | -------- | ------ |
| `timestamp` inside the window                          | Accepted | `201`  |
| Future `timestamp` (`txSec > nowSec`)                  | Rejected | `422`  |
| `timestamp` outside the window (`txSec < nowSec - 59`) | Rejected | `422`  |

**Rationale:** explicit rejection communicates the problem to the client and avoids _silent drops_, which make production debugging harder. The alternative, accepting a future timestamp and holding it until it enters the window, introduces an unintuitive semantics and additional state. Rejecting is simpler and more auditable. Satisfies non-functional requirement #3.

An additional consideration: accepting future timestamps without losing the memory bound requires defining a maximum future window (analogous to the 60s past one). Without such a cap, the system would need an auxiliary store for future transactions whose size would grow with the number of POSTs, violating non-functional requirement #4.

### 4. Data expiration

There are no timers or periodic processes. Expiration happens by lazy overwrite when the ring buffer wraps around: when a new second `N` is written, the position `N % 60`, which previously held second `N - 60`, gets replaced. Stale buckets that are never overwritten (because their slot stops receiving transactions) are ignored by `snapshot` thanks to the range filter.

This guarantees bounded memory with zero asynchronous maintenance cost.

## Complexity

| Operation            | Complexity                             |
| -------------------- | -------------------------------------- |
| `POST /transactions` | `O(1)`                                 |
| `GET /statistics`    | `O(W)` with `W = 60` constant → `O(1)` |

`snapshot` iterates the 60 buckets and sums them. Since `W` is a fixed domain parameter (the window defined by the spec), the operation is constant-bounded and therefore formally `O(1)`.

### Alternative considered: running totals

Keep 4 aggregator-level running totals (`chargeSum`, `chargeCount`, `refundSum`, `refundCount`) and lazily expire stale buckets at the start of every `add`/`snapshot`. This would reduce `snapshot` to 4 memory reads in the common case.

**Rejected** because:

- For `W = 60`, iterating the array takes nanoseconds (the 60 buckets fit comfortably in L1 cache).
- It introduces an additional invariant (the running totals must stay in sync with the live buckets at all times), widening the bug surface with off-by-one errors in the expiration path.
- The exercise asks for `O(1)` and the constant-bounded iteration already satisfies it.

If `W` grew significantly (e.g., a one-hour window: `W = 3600`) the analysis would flip and this alternative would be preferable.

## Assumptions

- **Single process.** No persistence; restarting the service clears all state.
- **Trusted clients.** No authentication or rate limiting. Internal use is assumed.
- **Approximately monotonic system clock.** Backward jumps (aggressive NTP correction, manual changes) could cause buckets previously considered stale to re-enter the window. This is not mitigated.
- **1-second granularity.** Transactions with timestamps inside the same second are aggregated into the same bucket. Finer precision would require a different structure.
- **Reasonably-sized amounts.** Overflow and floating-point drift are not validated; under extreme cardinality there could be precision loss. Out of scope.

## Project structure

```
src/
├── app.ts              # Fastify + Zod + routes composition
├── server.ts           # HTTP bootstrap
├── schemas.ts          # Zod schemas (request/response)
├── core/
│   ├── aggregator.ts   # ring buffer + aggregation logic
│   └── clock.ts        # clock abstraction (injectable in tests)
└── routes/
    ├── transactions.ts
    └── statistics.ts

test/
├── aggregator.test.ts  # unit tests over the core
└── api.test.ts         # integration tests via fastify.inject

scripts/
├── smoke.js            # sanity check against the production build
├── load.js             # autocannon load test
└── lib/utils.js        # shared helpers
```

## Testing strategy

Each layer verifies something different:

| Layer       | Tool                                           | What it proves                                                                                                                                                           |
| ----------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit        | Vitest (`test/aggregator.test.ts`)             | Core invariants with an injected `Clock`: window boundaries, future/stale rejection, correct aggregates, ring-buffer recycling.                                          |
| Integration | Vitest + `fastify.inject` (`test/api.test.ts`) | HTTP contract end-to-end without opening a socket: status codes, Zod validation, response serialization.                                                                 |
| Smoke       | Node + `fetch` (`scripts/smoke.js`)            | That the production build (`dist/server.js`) boots and responds. Covers `tsc-alias` / path-rewriting failures that source-level tests do not catch.                      |
| Load        | autocannon (`scripts/load.js`)                 | Evidence for non-functional requirement #2 (high write rate): write-only scenario + mixed scenario with varied timestamps (in-window, future, stale) and a POST/GET mix. |

Integration tests use `fastify.inject` instead of opening a real socket: it is faster and more deterministic. The smoke test compensates by validating that the compiled artifact actually works over real HTTP.

### Load test results

Results from a local run of `pnpm load`.

**Environment.** Intel i7-11800H (8C/16T), Node 24.14, Windows 11, client and server on the same host (`127.0.0.1`). 100 concurrent connections, 10s per scenario.

| Scenario                     | Throughput  | Latency p50 | Latency p99 | Latency max | Errors / timeouts / 5xx |
| ---------------------------- | ----------- | ----------- | ----------- | ----------- | ----------------------- |
| Write-only (POST)            | ~10,100 rps | 9 ms        | 18 ms       | 49 ms       | 0                       |
| Mixed (~90% POST + ~10% GET) | ~10,100 rps | 9 ms        | 16 ms       | 37 ms       | 0                       |

In the mixed scenario the timestamps are varied on purpose (offset in `[-5, +64]s`) to exercise the three paths: accepted, future, and stale. The `422` responses for future/stale timestamps are expected behaviour and account for the ~5% non-2xx share. Both scenarios complete with **0 `5xx`, 0 errors, and 0 timeouts**.

## Selected stack

| Dependency                                 | Why                                                                                                                        |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **Fastify**                                | Higher throughput than Express, ergonomic API, mature plugin system.                                                       |
| **Zod** + **`@fastify/type-provider-zod`** | Runtime validation and compile-time type inference from a single schema; integrates natively with Fastify's type provider. |
| **Vitest**                                 | Fast, ESM-native, Jest-compatible API without the configuration friction.                                                  |
| **tsx**                                    | Runs TypeScript without a prior transpile step in watch mode (`pnpm dev`).                                                 |
| **tsc-alias**                              | Rewrites path aliases (`@/`) in the `tsc` output; necessary because `tsc` does not resolve them on its own.                |
| **autocannon**                             | Lightweight, reproducible HTTP load tester for Node.                                                                       |

## Available scripts

| Command                             | Action                                                     |
| ----------------------------------- | ---------------------------------------------------------- |
| `pnpm dev`                          | Starts the server in watch mode with `tsx`.                |
| `pnpm build`                        | Compiles TypeScript to `dist/` and rewrites path aliases.  |
| `pnpm start`                        | Starts the production build.                               |
| `pnpm test`                         | Runs unit + integration tests.                             |
| `pnpm smoke`                        | Build + sanity check against the artifact.                 |
| `pnpm load`                         | Build + load test (autocannon).                            |
| `pnpm typecheck`                    | `tsc --noEmit`.                                            |
| `pnpm lint`                         | ESLint over `src/` and `test/`.                            |
| `pnpm format` / `pnpm format:check` | Prettier apply / verify.                                   |
| `pnpm check`                        | `typecheck + lint + format:check + test`. Intended for CI. |
