import { serializerCompiler, validatorCompiler } from '@fastify/type-provider-zod';
import Fastify from 'fastify';

import { createAggregator } from '@/core/aggregator.js';
import { systemClock } from '@/core/clock.js';
import { statisticsRoute } from '@/routes/statistics.js';
import { transactionsRoute } from '@/routes/transactions.js';

export type BuildAppOptions = {
  logger?: boolean;
};

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: options.logger ?? true });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const aggregator = createAggregator(systemClock);

  await app.register(transactionsRoute(aggregator));
  await app.register(statisticsRoute(aggregator));

  return app;
}
