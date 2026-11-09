export const ROLES = [
  'HR', 'HIRING_MANAGER', 'PROJECT_MANAGER', 'INTERVIEWER', 'LEADERSHIP', 'ADMIN',
] as const
export type Role = (typeof ROLES)[number]
export const isRole = (v: unknown): v is Role => ROLES.includes(v as Role)
