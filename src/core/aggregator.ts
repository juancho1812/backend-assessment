import type { Clock } from '@/core/clock.js';

export type Transaction = { timestamp: number; amount: number };

export type Statistics = {
  chargeSum: number;
  chargeCount: number;
  chargeAvg: number;
  refundSum: number;
  refundCount: number;
  refundAvg: number;
};

export type AddOutcome = 'accepted' | 'future' | 'stale';

export type Aggregator = {
  add(tx: Transaction): AddOutcome;
  snapshot(): Statistics;
};

type Bucket = {
  second: number;
  chargeSum: number;
  chargeCount: number;
  refundSum: number;
  refundCount: number;
};

const WINDOW_SECONDS = 60;

const emptyBucket = (second: number): Bucket => {
  return {
    second,
    chargeSum: 0,
    chargeCount: 0,
    refundSum: 0,
    refundCount: 0,
  };
};

export const createAggregator = (clock: Clock): Aggregator => {
  const buckets = new Array<Bucket | undefined>(WINDOW_SECONDS);

  const add = (tx: Transaction): AddOutcome => {
    const nowSec = Math.floor(clock.nowMs() / 1000);
    const txSec = Math.floor(tx.timestamp / 1000);

    if (txSec > nowSec) return 'future';
    if (txSec < nowSec - WINDOW_SECONDS + 1) return 'stale';

    const index = txSec % WINDOW_SECONDS;
    const existing = buckets[index];
    const bucket = existing && existing.second === txSec ? existing : emptyBucket(txSec);

    if (tx.amount > 0) {
      bucket.chargeSum += tx.amount;
      bucket.chargeCount += 1;
    } else {
      bucket.refundSum += -tx.amount;
      bucket.refundCount += 1;
    }

    buckets[index] = bucket;
    return 'accepted';
  };

  const snapshot = (): Statistics => {
    const nowSec = Math.floor(clock.nowMs() / 1000);
    const minSec = nowSec - WINDOW_SECONDS + 1;

    let chargeSum = 0;
    let chargeCount = 0;
    let refundSum = 0;
    let refundCount = 0;

    for (const bucket of buckets) {
      if (!bucket) continue;
      if (bucket.second < minSec || bucket.second > nowSec) continue;
      chargeSum += bucket.chargeSum;
      chargeCount += bucket.chargeCount;
      refundSum += bucket.refundSum;
      refundCount += bucket.refundCount;
    }

    return {
      chargeSum,
      chargeCount,
      chargeAvg: chargeCount === 0 ? 0 : chargeSum / chargeCount,
      refundSum,
      refundCount,
      refundAvg: refundCount === 0 ? 0 : refundSum / refundCount,
    };
  };

  return { add, snapshot };
};
