import { z } from 'zod'

export const candidateSourceSchema = z.enum([
  'HR_UPLOAD',
  'REFERRAL',
  'LINKEDIN',
  'JOB_PORTAL',
  'AGENCY',
  'DIRECT',
  'TALENT_POOL',
  'INTERNAL',
])
export type CandidateSource = z.infer<typeof candidateSourceSchema>

export function normalizeCandidatePhone(
  phone: string | null | undefined,
): string | null {
  const normalized = phone?.replace(/\D/g, '') ?? ''
  return normalized || null
}

export const cvStatusSchema = z.enum(['UPLOADED', 'PARSING', 'PARSED', 'FAILED'])
export type CvStatus = z.infer<typeof cvStatusSchema>

export const createCandidateSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional(),
  phone: z
    .string()
    .refine(
      (phone) => !phone.trim() || /\d/.test(phone),
      'Phone number must contain at least one digit',
    )
    .optional(),
  address: z.string().optional(),
  location: z.string().optional(),
  currentCompany: z.string().optional(),
  currentRole: z.string().optional(),
  yearsExperience: z.number().int().min(0).optional(),
  skills: z.array(z.string()).default([]),
  education: z.string().optional(),
  certifications: z.array(z.string()).default([]),
  noticePeriod: z.string().optional(),
  expectedSalary: z.string().optional(),
  currentSalary: z.string().optional(),
  linkedinUrl: z.string().url().optional(),
  portfolioUrl: z.string().url().optional(),
  cvUrl: z.string().url().optional(),
  source: candidateSourceSchema.optional(),
  tags: z.array(z.string()).default([]),
})
export type CreateCandidate = z.infer<typeof createCandidateSchema>

export const updateCandidateSchema = createCandidateSchema.partial()
export type UpdateCandidate = z.infer<typeof updateCandidateSchema>
