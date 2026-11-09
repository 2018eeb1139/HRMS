import { z } from 'zod'

/**
 * Structured CV extraction output — all fields optional except array fields
 * which default to []. Maps to the Candidate model fields that can be enriched.
 */
export const parsedCvSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  currentTitle: z.string().optional(),
  currentEmployer: z.string().optional(),
  totalYearsExperience: z.number().min(0).transform(Math.round).optional(),
  education: z.string().optional(),
  skills: z.array(z.string()).default([]),
  certifications: z.array(z.string()).default([]),
  previousCompanies: z.array(z.string()).default([]),
  noticePeriod: z.string().optional(),
  salaryDetails: z.string().optional(),
})

export type ParsedCv = z.infer<typeof parsedCvSchema>
