import { Global, Module } from '@nestjs/common'
import { Queue } from 'bullmq'

export const CV_PARSE_QUEUE = Symbol('CV_PARSE_QUEUE')

// The consumer/worker for this queue is in apps/worker — a separate NestJS standalone app (next task).
@Global()
@Module({
  providers: [
    {
      provide: CV_PARSE_QUEUE,
      useFactory: () =>
        new Queue('cv-parse', {
          connection: { url: process.env['REDIS_URL'] ?? 'redis://localhost:6379' },
        }),
    },
  ],
  exports: [CV_PARSE_QUEUE],
})
export class QueueModule {}
