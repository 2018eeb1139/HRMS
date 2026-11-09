import { z } from 'zod'

export const offboardingSettlementStatusSchema = z.enum([
  'NOT_STARTED',
  'IN_PROGRESS',
  'COMPLETED',
])
export type OffboardingSettlementStatus = z.infer<
  typeof offboardingSettlementStatusSchema
>

export const createOffboardingSchema = z.object({
  lastWorkingDate: z.coerce.date(),
  assetsIssued: z.boolean(),
})
export type CreateOffboarding = z.infer<typeof createOffboardingSchema>

export const updateOffboardingSchema = z.object({
  knowledgeTransferCompleted: z.boolean().optional(),
  managerApprovalReceived: z.boolean().optional(),
  assetsReturned: z.boolean().optional(),
})
export type UpdateOffboarding = z.infer<typeof updateOffboardingSchema>
