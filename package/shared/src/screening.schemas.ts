import { z } from 'zod'

// ── Recommendation categories ────────────────────────────────────────────────

export const recommendationCategorySchema = z.enum([
  'STRONG_SHORTLIST',
  'SHORTLIST_MINOR_CONCERNS',
  'NEEDS_HR_CLARIFICATION',
  'NOT_SUITABLE',
  'BETTER_FIT_OTHER_ROLE',
])
export type RecommendationCategory = z.infer<typeof recommendationCategorySchema>

// ── ScreeningResult — exactly per spec §8 ────────────────────────────────────

const score0to100 = z.number().int().min(0).max(100)

export const screeningResultSchema = z.object({
  matchScore: score0to100,
  skillsMatch: score0to100,
  experienceMatch: score0to100,
  seniorityFit: score0to100,
  industryRelevance: score0to100,
  locationFit: score0to100,
  summary: z.string().min(1).max(500),
  matchedRequiredSkills: z.array(z.string()),
  missingRequiredSkills: z.array(z.string()),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  riskFlags: z.array(z.string()),
  suggestedHrQuestions: z.array(z.string()),
  suggestedInterviewerQuestions: z.array(z.string()),
  recommendationCategory: recommendationCategorySchema,
})

export type ScreeningResult = z.infer<typeof screeningResultSchema>

// ── ScreeningInput — candidate + role data needed by the scorer ──────────────

export const screeningInputSchema = z.object({
  candidate: z.object({
    skills: z.array(z.string()),
    yearsExperience: z.number().int().min(0).optional(),
    seniority: z.string().optional(),
    location: z.string().optional(),
  }),
  role: z.object({
    requiredSkills: z.array(z.string()),
    preferredSkills: z.array(z.string()).optional(),
    requiredYearsExperience: z.number().int().min(0).optional(),
    seniority: z.string().optional(),
    location: z.string().optional(),
  }),
})

export type ScreeningInput = z.infer<typeof screeningInputSchema>
