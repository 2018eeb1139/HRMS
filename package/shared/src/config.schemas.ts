import { z } from 'zod'
import { ROLES } from './roles'

export const createDepartmentSchema = z.object({ name: z.string().min(1).max(120) })
export type CreateDepartment = z.infer<typeof createDepartmentSchema>

export const createSkillSchema = z.object({ name: z.string().min(1).max(120) })
export type CreateSkill = z.infer<typeof createSkillSchema>

export const createSenioritySchema = z.object({
  name: z.string().min(1).max(120),
  rank: z.number().int().min(0),
})
export type CreateSeniority = z.infer<typeof createSenioritySchema>

export const headcountCountsOnSchema = z.enum(['OFFER_ACCEPTED', 'JOINED'])
export const updateOrgSettingSchema = z.object({ headcountCountsOn: headcountCountsOnSchema })
export type UpdateOrgSetting = z.infer<typeof updateOrgSettingSchema>

export const inviteUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(160),
  role: z.enum(ROLES),
})
export type InviteUser = z.infer<typeof inviteUserSchema>
