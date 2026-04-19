import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';

import type { Aggregator } from '@/core/aggregator.js';
import { statisticsSchema } from '@/schemas.js';

export function statisticsRoute(aggregator: Aggregator): FastifyPluginAsyncZod {
  return (app) => {
    app.get('/statistics', { schema: { response: { 200: statisticsSchema } } }, () => {
      return aggregator.snapshot();
    });
    return Promise.resolve();
  };
}
