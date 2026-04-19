import { z } from 'zod';
import type { Statistics, Transaction } from '@/core/aggregator.js';

export const transactionSchema = z
  .object({
    timestamp: z.iso.datetime(),
    amount: z.number().refine((n) => n !== 0, { message: 'amount must not be zero' }),
  })
  .transform(
    (input): Transaction => ({
      timestamp: new Date(input.timestamp).getTime(),
      amount: input.amount,
    }),
  );

export const statisticsSchema = z.object({
  chargeSum: z.number(),
  chargeCount: z.number().int().nonnegative(),
  chargeAvg: z.number(),
  refundSum: z.number(),
  refundCount: z.number().int().nonnegative(),
  refundAvg: z.number(),
}) satisfies z.ZodType<Statistics>;
