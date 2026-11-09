import { z } from 'zod'

// ── Recommendation enum ───────────────────────────────────────────────────────

export const feedbackRecommendationSchema = z.enum([
  'STRONG_HIRE',
  'HIRE',
  'HOLD',
  'REJECT',
  'CONSIDER_OTHER_ROLE',
])
export type FeedbackRecommendation = z.infer<typeof feedbackRecommendationSchema>

// ── Template field ────────────────────────────────────────────────────────────

export const feedbackFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['rating', 'text']),
  weight: z.number().positive().optional(),
  mandatory: z.boolean().optional(),
})
export type FeedbackField = z.infer<typeof feedbackFieldSchema>

// ── Create / update template ──────────────────────────────────────────────────

export const createTemplateSchema = z.object({
  name: z.string().min(1).max(120),
  roleType: z.string().optional(),
  seniority: z.string().optional(),
  stageKey: z.string().optional(),
  ratingScaleMax: z.number().int().min(2).max(10).optional(),
  fields: z.array(feedbackFieldSchema).min(1),
})
export type CreateTemplate = z.infer<typeof createTemplateSchema>

export const updateTemplateSchema = createTemplateSchema.partial().extend({
  // at least one field must be provided when updating
  fields: z.array(feedbackFieldSchema).min(1).optional(),
})
export type UpdateTemplate = z.infer<typeof updateTemplateSchema>

// ── Submit feedback ───────────────────────────────────────────────────────────

export const submitFeedbackSchema = z.object({
  interviewId: z.string().min(1),
  templateId: z.string().optional(),
  scores: z.record(z.union([z.number(), z.string()])),
  strengths: z.string().optional(),
  concerns: z.string().optional(),
  notes: z.string().optional(),
  recommendation: feedbackRecommendationSchema,
})
export type SubmitFeedback = z.infer<typeof submitFeedbackSchema>
