import { z } from 'zod'

export const projectStatusSchema = z.enum(['PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'])
export type ProjectStatus = z.infer<typeof projectStatusSchema>

export const roleStatusSchema = z.enum([
  'DRAFT', 'PENDING_APPROVAL', 'OPEN', 'IN_PROGRESS', 'ON_HOLD', 'FILLED', 'CANCELLED', 'CLOSED',
])
export type RoleStatus = z.infer<typeof roleStatusSchema>

export const prioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
export type Priority = z.infer<typeof prioritySchema>

export const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  client: z.string().min(1).max(200).optional(),
  projectManagerId: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  status: projectStatusSchema.optional(),
})
export type CreateProject = z.infer<typeof createProjectSchema>

export const updateProjectSchema = createProjectSchema.partial()
export type UpdateProject = z.infer<typeof updateProjectSchema>

export const createRoleSchema = z.object({
  title: z.string().min(1).max(200),
  requiredCount: z.number().int().min(1),
  projectId: z.string().optional(),
  departmentId: z.string().optional(),
  seniorityId: z.string().optional(),
  location: z.string().optional(),
  employmentType: z.string().optional(),
  jobDescription: z.string().optional(),
  responsibilities: z.string().optional(),
  requiredSkills: z.array(z.string()).default([]),
  preferredSkills: z.array(z.string()).default([]),
  requiredYearsExperience: z.number().int().min(0).optional(),
  education: z.string().optional(),
  certifications: z.string().optional(),
  languages: z.array(z.string()).default([]),
  salaryRange: z.string().optional(),
  priority: prioritySchema.optional(),
  status: roleStatusSchema.optional(),
  hiringManagerId: z.string().optional(),
  hrOwnerId: z.string().optional(),
  targetJoiningDate: z.coerce.date().optional(),
  targetClosureDate: z.coerce.date().optional(),
})
export type CreateRole = z.infer<typeof createRoleSchema>

export const updateRoleSchema = createRoleSchema.partial()
export type UpdateRole = z.infer<typeof updateRoleSchema>

export const closeRoleSchema = z.object({
  reason: z.string().min(1),
  notes: z.string().optional(),
})
export type CloseRole = z.infer<typeof closeRoleSchema>
