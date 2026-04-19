import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '@/app.js';

describe('API', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /transactions', () => {
    it('returns 201 for a valid charge', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/transactions',
        payload: { timestamp: new Date().toISOString(), amount: 100 },
      });
      expect(res.statusCode).toBe(201);
    });

    it('returns 400 when amount is zero', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/transactions',
        payload: { timestamp: new Date().toISOString(), amount: 0 },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when timestamp is not ISO 8601', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/transactions',
        payload: { timestamp: 'not-a-date', amount: 10 },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when a required field is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/transactions',
        payload: { timestamp: new Date().toISOString() },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 422 when timestamp is in the future', async () => {
      const future = new Date(Date.now() + 120_000).toISOString();
      const res = await app.inject({
        method: 'POST',
        url: '/transactions',
        payload: { timestamp: future, amount: 10 },
      });
      expect(res.statusCode).toBe(422);
    });

    it('returns 422 when timestamp is older than the 60s window', async () => {
      const stale = new Date(Date.now() - 120_000).toISOString();
      const res = await app.inject({
        method: 'POST',
        url: '/transactions',
        payload: { timestamp: stale, amount: 10 },
      });
      expect(res.statusCode).toBe(422);
    });
  });

  describe('GET /statistics', () => {
    it('returns zeros when no transactions have been recorded', async () => {
      const res = await app.inject({ method: 'GET', url: '/statistics' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        chargeSum: 0,
        chargeCount: 0,
        chargeAvg: 0,
        refundSum: 0,
        refundCount: 0,
        refundAvg: 0,
      });
    });

    it('aggregates charges and refunds from prior POSTs', async () => {
      const now = new Date().toISOString();
      await app.inject({
        method: 'POST',
        url: '/transactions',
        payload: { timestamp: now, amount: 100 },
      });
      await app.inject({
        method: 'POST',
        url: '/transactions',
        payload: { timestamp: now, amount: 200 },
      });
      await app.inject({
        method: 'POST',
        url: '/transactions',
        payload: { timestamp: now, amount: -30 },
      });

      const res = await app.inject({ method: 'GET', url: '/statistics' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        chargeSum: 300,
        chargeCount: 2,
        chargeAvg: 150,
        refundSum: 30,
        refundCount: 1,
        refundAvg: 30,
      });
    });
  });
});
