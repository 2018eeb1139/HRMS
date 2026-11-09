import { z } from 'zod'

// ── Role Builder ─────────────────────────────────────────────────────────────

export const roleBuilderInputSchema = z.object({
  title: z.string().min(1),
  seniority: z.string().optional(),
  mustHaves: z.string().optional(),
  context: z.string().optional(),
})
export type RoleBuilderInput = z.infer<typeof roleBuilderInputSchema>

export const roleDraftSchema = z.object({
  jobDescription: z.string(),
  responsibilities: z.array(z.string()),
  requiredSkills: z.array(z.string()),
  preferredSkills: z.array(z.string()),
  interviewCriteria: z.array(z.string()),
  screeningQuestions: z.array(z.string()),
})
export type RoleDraft = z.infer<typeof roleDraftSchema>

// ── Interview Guide ───────────────────────────────────────────────────────────

export const interviewGuideInputSchema = z.object({
  roleTitle: z.string().min(1),
  requiredSkills: z.array(z.string()),
  candidateGaps: z.array(z.string()).optional(),
  seniority: z.string().optional(),
})
export type InterviewGuideInput = z.infer<typeof interviewGuideInputSchema>

export const interviewGuideSchema = z.object({
  questions: z.array(
    z.object({
      area: z.string(),
      question: z.string(),
      whatToLookFor: z.string(),
    }),
  ),
})
export type InterviewGuide = z.infer<typeof interviewGuideSchema>

// ── Feedback Summarizer ───────────────────────────────────────────────────────

export const feedbackSummaryInputSchema = z.object({
  feedback: z.array(
    z.object({
      interviewer: z.string().optional(),
      recommendation: z.string(),
      strengths: z.string().optional(),
      concerns: z.string().optional(),
      notes: z.string().optional(),
    }),
  ),
})
export type FeedbackSummaryInput = z.infer<typeof feedbackSummaryInputSchema>

export const feedbackSummarySchema = z.object({
  overall: z.string(),
  commonStrengths: z.array(z.string()),
  commonConcerns: z.array(z.string()),
  conflictingViews: z.array(z.string()),
  decisionSupport: z.string(),
})
export type FeedbackSummary = z.infer<typeof feedbackSummarySchema>

// ── Hiring Risk Detector ──────────────────────────────────────────────────────

export const riskReportInputSchema = z.object({
  signals: z.array(
    z.object({
      kind: z.string(),
      detail: z.string(),
    }),
  ),
})
export type RiskReportInput = z.infer<typeof riskReportInputSchema>

const riskSeveritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH'])

export const riskReportSchema = z.object({
  risks: z.array(
    z.object({
      severity: riskSeveritySchema,
      area: z.string(),
      finding: z.string(),
      suggestedAction: z.string(),
    }),
  ),
})
export type RiskReport = z.infer<typeof riskReportSchema>
