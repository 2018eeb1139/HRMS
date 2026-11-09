import { z } from 'zod'

// ── Enums ─────────────────────────────────────────────────────────────────────

export const offerStatusSchema = z.enum([
  'TO_BE_PREPARED',
  'SENT',
  'UNDER_NEGOTIATION',
  'ACCEPTED',
  'REJECTED',
  'JOINED',
])
export type OfferStatus = z.infer<typeof offerStatusSchema>

export const joiningRiskSchema = z.enum(['LOW', 'MEDIUM', 'HIGH'])
export type JoiningRisk = z.infer<typeof joiningRiskSchema>

const offeredSalarySchema = z
  .union([z.string(), z.number().finite().transform(String)])
  .optional()

// ── Create ────────────────────────────────────────────────────────────────────

export const createOfferSchema = z.object({
  applicationId: z.string().min(1),
  offeredSalary: z.union([
    z.string().trim().min(1),
    z.number().finite().positive().transform(String),
  ]),
  offerDate: z.coerce.date().optional(),
  expectedJoiningDate: z.coerce.date(),
  noticePeriod: z.string().trim().min(1),
  documentsPending: z.array(z.string()).optional(),
  notes: z.string().optional(),
})
export type CreateOffer = z.infer<typeof createOfferSchema>

// ── Update ────────────────────────────────────────────────────────────────────

export const updateOfferSchema = z.object({
  offeredSalary: offeredSalarySchema,
  offerDate: z.coerce.date().optional(),
  expectedJoiningDate: z.coerce.date().optional(),
  confirmedJoiningDate: z.coerce.date().optional(),
  noticePeriod: z.string().optional(),
  documentsPending: z.array(z.string()).optional(),
  joiningRisk: joiningRiskSchema.optional(),
  notes: z.string().optional(),
})
export type UpdateOffer = z.infer<typeof updateOfferSchema>

// ── Set Status ────────────────────────────────────────────────────────────────

export const setOfferStatusSchema = z.object({
  status: offerStatusSchema,
})
export type SetOfferStatus = z.infer<typeof setOfferStatusSchema>
