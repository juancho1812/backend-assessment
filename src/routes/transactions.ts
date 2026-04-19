import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';

import type { Aggregator } from '@/core/aggregator.js';
import { transactionSchema } from '@/schemas.js';

export function transactionsRoute(aggregator: Aggregator): FastifyPluginAsyncZod {
  return (app) => {
    app.post('/transactions', { schema: { body: transactionSchema } }, (req, reply) => {
      const outcome = aggregator.add(req.body);

      switch (outcome) {
        case 'accepted':
          return reply.code(201).send();
        case 'future':
          return reply.code(422).send({ error: 'timestamp is in the future' });
        case 'stale':
          return reply.code(422).send({ error: 'timestamp is outside the 60s window' });
      }
    });
    return Promise.resolve();
  };
}
