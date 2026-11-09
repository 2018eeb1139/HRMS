import { PrismaClient } from '@prisma/client'
import { Worker, Queue } from 'bullmq'
import * as fs from 'fs/promises'
import * as path from 'path'
import { CvProcessor } from './cv-processor'
import { CvStructuredParser } from './cv-structured-parser'
import { extractText } from './extract-text'
import { GroqLlm } from './groq.llm'
import { AlertSweeper, LogNotifier } from './alert-sweep'

const STORAGE_DIR = process.env['STORAGE_DIR'] ?? './storage'
const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379'

const diskReader = {
  async get(key: string): Promise<Buffer> {
    const fullPath = path.join(STORAGE_DIR, key)
    return fs.readFile(fullPath)
  },
}

const prisma = new PrismaClient()
const cvParser = new CvStructuredParser(new GroqLlm())
const processor = new CvProcessor(
  prisma,
  diskReader,
  extractText,
  (text) => cvParser.parse(text),
)

// ── CV parse worker ───────────────────────────────────────────────────────────

const cvWorker = new Worker(
  'cv-parse',
  async (job) => {
    await processor.process(job.data.cvFileId as string)
  },
  { connection: { url: REDIS_URL } },
)

cvWorker.on('completed', (job) => {
  console.log(`[cv-parse] job ${job.id} completed (cvFileId=${job.data.cvFileId})`)
})

cvWorker.on('failed', (job, err) => {
  console.error(`[cv-parse] job ${job?.id} failed (cvFileId=${job?.data?.cvFileId}):`, err.message)
})

console.log('[cv-parse] worker started, waiting for jobs…')

// ── Alert sweep worker (repeats every 15 min) ─────────────────────────────────

const alertQueue = new Queue('alerts', { connection: { url: REDIS_URL } })

// Register the repeatable job (idempotent — BullMQ deduplicates by key)
alertQueue.add('sweep', {}, { repeat: { every: 900_000 } }).catch((err) => {
  console.error('[alerts] failed to register repeatable job:', err)
})

const sweeper = new AlertSweeper(prisma, new LogNotifier())

const alertWorker = new Worker(
  'alerts',
  async () => {
    await sweeper.sweep(new Date())
  },
  { connection: { url: REDIS_URL } },
)

alertWorker.on('completed', (job) => {
  console.log(`[alerts] sweep job ${job.id} completed`)
})

alertWorker.on('failed', (job, err) => {
  console.error(`[alerts] sweep job ${job?.id} failed:`, err.message)
})

console.log('[alerts] worker started, sweep every 15 min…')
