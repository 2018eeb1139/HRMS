import { z } from 'zod'

// ── Communication Type ────────────────────────────────────────────────────────

export const communicationTypeSchema = z.enum([
  'PHONE',
  'EMAIL',
  'WHATSAPP',
  'LINKEDIN',
  'INTERVIEW_DISCUSSION',
  'INTERNAL_NOTE',
  'OFFER_DISCUSSION',
  'FOLLOW_UP',
])
export type CommunicationType = z.infer<typeof communicationTypeSchema>

// ── Communication Log CRUD ────────────────────────────────────────────────────

export const createCommunicationSchema = z.object({
  candidateId: z.string().min(1),
  applicationId: z.string().min(1).optional(),
  type: communicationTypeSchema,
  summary: z.string().min(1),
  candidateResponse: z.string().optional(),
  nextAction: z.string().optional(),
  followUpDate: z.coerce.date().optional(),
  attachmentKey: z.string().optional(),
})
export type CreateCommunication = z.infer<typeof createCommunicationSchema>

export const updateCommunicationSchema = createCommunicationSchema.partial()
export type UpdateCommunication = z.infer<typeof updateCommunicationSchema>

// ── Message Draft ─────────────────────────────────────────────────────────────

export const messageDraftKindSchema = z.enum([
  'INTERVIEW_INVITE',
  'SCREENING_REQUEST',
  'MISSING_INFO',
  'REJECTION',
  'OFFER_FOLLOWUP',
  'STATUS_UPDATE',
  'INTERVIEW_REMINDER',
  'FOLLOW_UP',
])
export type MessageDraftKind = z.infer<typeof messageDraftKindSchema>

export const messageDraftInputSchema = z.object({
  kind: messageDraftKindSchema,
  candidateName: z.string().min(1),
  roleTitle: z.string().optional(),
  context: z.string().optional(),
})
export type MessageDraftInput = z.infer<typeof messageDraftInputSchema>

export const messageDraftSchema = z.object({
  subject: z.string(),
  body: z.string(),
})
export type MessageDraft = z.infer<typeof messageDraftSchema>
