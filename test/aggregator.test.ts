import { beforeEach, describe, expect, it } from 'vitest';
import type { Aggregator } from '@/core/aggregator.js';
import { createAggregator } from '@/core/aggregator.js';
import type { Clock } from '@/core/clock.js';

const BASE_MS = 1_700_000_000_000;

const makeFakeClock = (initialMs: number) => {
  let current = initialMs;
  const clock: Clock = { nowMs: () => current };
  return {
    clock,
    advance: (deltaMs: number) => {
      current += deltaMs;
    },
  };
};

describe('createAggregator', () => {
  let fake: ReturnType<typeof makeFakeClock>;
  let agg: Aggregator;

  beforeEach(() => {
    fake = makeFakeClock(BASE_MS);
    agg = createAggregator(fake.clock);
  });

  describe('empty state', () => {
    it('returns zeros before any transaction is added', () => {
      expect(agg.snapshot()).toEqual({
        chargeSum: 0,
        chargeCount: 0,
        chargeAvg: 0,
        refundSum: 0,
        refundCount: 0,
        refundAvg: 0,
      });
    });
  });

  describe('basic accumulation', () => {
    it('records a single charge', () => {
      expect(agg.add({ timestamp: BASE_MS, amount: 100 })).toBe('accepted');
      expect(agg.snapshot()).toEqual({
        chargeSum: 100,
        chargeCount: 1,
        chargeAvg: 100,
        refundSum: 0,
        refundCount: 0,
        refundAvg: 0,
      });
    });

    it('records a single refund as a positive magnitude', () => {
      expect(agg.add({ timestamp: BASE_MS, amount: -40 })).toBe('accepted');
      expect(agg.snapshot()).toEqual({
        chargeSum: 0,
        chargeCount: 0,
        chargeAvg: 0,
        refundSum: 40,
        refundCount: 1,
        refundAvg: 40,
      });
    });

    it('aggregates charges and refunds independently', () => {
      agg.add({ timestamp: BASE_MS, amount: 100 });
      agg.add({ timestamp: BASE_MS, amount: 200 });
      agg.add({ timestamp: BASE_MS, amount: -30 });
      agg.add({ timestamp: BASE_MS, amount: -70 });

      expect(agg.snapshot()).toEqual({
        chargeSum: 300,
        chargeCount: 2,
        chargeAvg: 150,
        refundSum: 100,
        refundCount: 2,
        refundAvg: 50,
      });
    });
  });

  describe('window boundaries', () => {
    it('accepts a transaction exactly at t - 59s (inside window)', () => {
      expect(agg.add({ timestamp: BASE_MS - 59_000, amount: 10 })).toBe('accepted');
      expect(agg.snapshot().chargeSum).toBe(10);
    });

    it('rejects a transaction at t - 60s as stale (just outside)', () => {
      expect(agg.add({ timestamp: BASE_MS - 60_000, amount: 10 })).toBe('stale');
      expect(agg.snapshot().chargeSum).toBe(0);
    });

    it('rejects a future transaction', () => {
      expect(agg.add({ timestamp: BASE_MS + 1_000, amount: 10 })).toBe('future');
      expect(agg.snapshot().chargeSum).toBe(0);
    });
  });

  describe('sliding window over time', () => {
    it('resets a stale bucket when a new transaction lands on the same index', () => {
      agg.add({ timestamp: BASE_MS, amount: 100 });
      expect(agg.snapshot().chargeCount).toBe(1);

      // Advancing exactly 60s guarantees the new write targets the same ring-buffer
      fake.advance(60_000);
      agg.add({ timestamp: BASE_MS + 60_000, amount: 50 });

      expect(agg.snapshot()).toEqual({
        chargeSum: 50,
        chargeCount: 1,
        chargeAvg: 50,
        refundSum: 0,
        refundCount: 0,
        refundAvg: 0,
      });
    });

    it('tracks transactions at different seconds and expires each as its bucket leaves the window', () => {
      agg.add({ timestamp: BASE_MS, amount: 100 });
      fake.advance(30_000);
      agg.add({ timestamp: BASE_MS + 30_000, amount: 50 });

      expect(agg.snapshot()).toMatchObject({ chargeSum: 150, chargeCount: 2 });

      fake.advance(30_000);
      expect(agg.snapshot()).toMatchObject({ chargeSum: 50, chargeCount: 1 });

      fake.advance(30_000);
      expect(agg.snapshot()).toMatchObject({ chargeSum: 0, chargeCount: 0 });
    });
  });

  describe('high-volume burst', () => {
    it('aggregates 10,000 writes into the same second without drift', () => {
      const N = 10_000;
      for (let i = 0; i < N; i++) {
        agg.add({ timestamp: BASE_MS, amount: 1 });
      }
      expect(agg.snapshot()).toEqual({
        chargeSum: N,
        chargeCount: N,
        chargeAvg: 1,
        refundSum: 0,
        refundCount: 0,
        refundAvg: 0,
      });
    });
  });
});
