import { z } from 'zod'

export const applicationStatusSchema = z.enum([
  'ACTIVE',
  'REJECTED',
  'WITHDRAWN',
  'HIRED',
  'ON_HOLD',
])
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>

export const createApplicationSchema = z.object({
  candidateId: z.string().min(1),
  roleId: z.string().min(1),
})
export type CreateApplication = z.infer<typeof createApplicationSchema>

export const moveStageSchema = z.object({
  toStageKey: z.string().min(1),
  byUserId: z.string().optional(),
})
export type MoveStage = z.infer<typeof moveStageSchema>

export const bulkMoveSchema = z.object({
  applicationIds: z.array(z.string().min(1)).min(1),
  toStageKey: z.string().min(1),
  byUserId: z.string().optional(),
})
export type BulkMove = z.infer<typeof bulkMoveSchema>

export const rejectApplicationSchema = z.object({
  reason: z.string().min(1),
  byUserId: z.string().optional(),
})
export type RejectApplication = z.infer<typeof rejectApplicationSchema>

// Pipeline stage config schema
export const createStageSchema = z.object({
  key: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  order: z.number().int().min(0),
  isTerminal: z.boolean().optional(),
})
export type CreateStage = z.infer<typeof createStageSchema>

export const updateStageSchema = createStageSchema.partial()
export type UpdateStage = z.infer<typeof updateStageSchema>
