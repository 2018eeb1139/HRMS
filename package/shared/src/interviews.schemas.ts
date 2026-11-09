import { z } from 'zod'

export const interviewStatusSchema = z.enum([
  'SCHEDULED',
  'COMPLETED',
  'RESCHEDULED',
  'CANCELLED',
  'CANDIDATE_NO_SHOW',
  'INTERVIEWER_NO_SHOW',
])
export type InterviewStatus = z.infer<typeof interviewStatusSchema>

export const scheduleInterviewSchema = z.object({
  applicationId: z.string().min(1),
  interviewerIds: z.array(z.string().min(1)).min(1),
  stageKey: z.string().optional(),
  scheduledAt: z.coerce.date(),
  durationMin: z.number().int().positive().default(60),
  meetingLink: z.string().optional(),
})
export type ScheduleInterview = z.infer<typeof scheduleInterviewSchema>

export const rescheduleSchema = z.object({
  scheduledAt: z.coerce.date(),
  durationMin: z.number().int().positive().optional(),
})
export type RescheduleInterview = z.infer<typeof rescheduleSchema>

export const setInterviewStatusSchema = z.object({
  status: interviewStatusSchema,
})
export type SetInterviewStatus = z.infer<typeof setInterviewStatusSchema>

export const suggestSlotsSchema = z.object({
  interviewerIds: z.array(z.string().min(1)).min(1),
  fromISO: z.string().min(1),
  toISO: z.string().min(1),
  durationMin: z.number().int().positive().optional(),
})
export type SuggestSlots = z.infer<typeof suggestSlotsSchema>
