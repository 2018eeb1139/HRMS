import { describe, it, expect, vi } from 'vitest'
import { AiCacheService } from './ai-cache.service'

const makeAiResult = (output: unknown) => ({
  id: 'result1',
  type: 'screening',
  inputHash: 'abc123',
  model: 'claude-sonnet-4-6',
  promptVersion: '1',
  output,
  createdAt: new Date(),
})

describe('AiCacheService', () => {
  describe('hashInput', () => {
    it('returns a 64-char hex string', () => {
      const svc = new AiCacheService({ aiResult: {} } as never)
      const hash = svc.hashInput({ foo: 'bar' })
      expect(hash).toHaveLength(64)
      expect(hash).toMatch(/^[0-9a-f]+$/)
    })

    it('returns the same hash for equal objects', () => {
      const svc = new AiCacheService({ aiResult: {} } as never)
      expect(svc.hashInput({ a: 1, b: 2 })).toBe(svc.hashInput({ a: 1, b: 2 }))
    })

    it('returns different hashes for different objects', () => {
      const svc = new AiCacheService({ aiResult: {} } as never)
      expect(svc.hashInput({ a: 1 })).not.toBe(svc.hashInput({ a: 2 }))
    })
  })

  describe('getOrCompute', () => {
    it('returns stored output on cache HIT without calling compute', async () => {
      const stored = { matchScore: 80 }
      const prisma = {
        aiResult: {
          findUnique: vi.fn().mockResolvedValue(makeAiResult(stored)),
          upsert: vi.fn(),
        },
      }
      const svc = new AiCacheService(prisma as never)
      const compute = vi.fn()
      const result = await svc.getOrCompute({
        type: 'screening',
        inputHash: 'abc123',
        model: 'claude-sonnet-4-6',
        promptVersion: '1',
        compute,
      })
      expect(result).toEqual(stored)
      expect(compute).not.toHaveBeenCalled()
      expect(prisma.aiResult.upsert).not.toHaveBeenCalled()
    })

    it('calls compute and upserts the row on cache MISS', async () => {
      const computed = { matchScore: 72 }
      const prisma = {
        aiResult: {
          findUnique: vi.fn().mockResolvedValue(null),
          upsert: vi.fn().mockResolvedValue(makeAiResult(computed)),
        },
      }
      const svc = new AiCacheService(prisma as never)
      const compute = vi.fn().mockResolvedValue(computed)
      const result = await svc.getOrCompute({
        type: 'screening',
        inputHash: 'abc123',
        model: 'claude-sonnet-4-6',
        promptVersion: '1',
        compute,
      })
      expect(result).toEqual(computed)
      expect(compute).toHaveBeenCalledOnce()
      expect(prisma.aiResult.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type_inputHash_model_promptVersion: {
              type: 'screening',
              inputHash: 'abc123',
              model: 'claude-sonnet-4-6',
              promptVersion: '1',
            },
          }),
          create: expect.objectContaining({ output: computed }),
          update: expect.objectContaining({ output: computed }),
        }),
      )
    })

    it('returns the computed value on cache MISS', async () => {
      const computed = { matchScore: 55 }
      const prisma = {
        aiResult: {
          findUnique: vi.fn().mockResolvedValue(null),
          upsert: vi.fn().mockResolvedValue(makeAiResult(computed)),
        },
      }
      const svc = new AiCacheService(prisma as never)
      const result = await svc.getOrCompute({
        type: 'test',
        inputHash: 'xyz',
        model: 'm1',
        promptVersion: '2',
        compute: () => Promise.resolve(computed),
      })
      expect(result).toEqual(computed)
    })
  })
})
