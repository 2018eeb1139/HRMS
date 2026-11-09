import { z } from 'zod'

// ── Alert types ───────────────────────────────────────────────────────────────

export const ALERT_TYPES = [
  'ROLE_NO_SHORTLIST',
  'FEEDBACK_PENDING_24H',
  'OFFER_NOT_SENT',
  'PROJECT_START_WITH_GAPS',
  'JOINING_DOCS_PENDING',
  'ROLE_FULFILLED',
  'HIGH_PRIORITY_ROLE_DELAYED',
  'CANDIDATE_UNRESPONSIVE',
] as const

export type AlertType = (typeof ALERT_TYPES)[number]

export const alertTypeSchema = z.enum(ALERT_TYPES)

// ── AlertConfig ───────────────────────────────────────────────────────────────

export interface AlertConfig {
  /** Days a role can be OPEN/IN_PROGRESS with 0 shortlists before alerting (default: 7) */
  noShortlistDays: number
  /** Days before project start to alert when gaps exist (default: 14) */
  projectStartDays: number
  /** Days before joiner's joining date to alert when docs are pending (default: 7) */
  joiningDocsDays: number
}

export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  noShortlistDays: 7,
  projectStartDays: 14,
  joiningDocsDays: 7,
}

// ── AlertSnapshot ─────────────────────────────────────────────────────────────

export interface AlertSnapshotRole {
  id: string
  title: string
  status: string
  priority: string
  requiredCount: number
  filledCount: number
  hrOwnerId?: string | null
  targetClosureDate?: string | null
  createdAt: string
  shortlistedCount: number
  activeApplicationCount: number
}

export interface AlertSnapshotInterview {
  id: string
  applicationId: string
  scheduledAt: string
  hrOwnerId?: string | null
  interviewerIds: string[]
  feedbackCount: number
}

export interface AlertSnapshotSelectedWithoutOffer {
  applicationId: string
  hrOwnerId?: string | null
}

export interface AlertSnapshotProject {
  id: string
  name: string
  startDate: string
  projectManagerId?: string | null
  gap: number
}

export interface AlertSnapshotJoiner {
  offerId: string
  hrOwnerId?: string | null
  joiningDate: string
  documentsPending: string[]
}

export interface AlertSnapshotOverdueFollowUp {
  communicationId: string
  ownerId: string
}

export interface AlertSnapshot {
  /** ISO string of evaluation time — passed in so the engine is pure / testable */
  now: string
  roles: AlertSnapshotRole[]
  completedInterviews: AlertSnapshotInterview[]
  selectedWithoutOffer: AlertSnapshotSelectedWithoutOffer[]
  projectsStartingSoon: AlertSnapshotProject[]
  joiners: AlertSnapshotJoiner[]
  overdueFollowUps: AlertSnapshotOverdueFollowUp[]
}

// ── RaisedAlert ───────────────────────────────────────────────────────────────

export interface RaisedAlert {
  type: AlertType
  userId: string
  entityType?: string
  entityId?: string
  message: string
}

// ── Update AlertRule schema (for API) ─────────────────────────────────────────

export const updateAlertRuleSchema = z.object({
  enabled: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
})
export type UpdateAlertRule = z.infer<typeof updateAlertRuleSchema>
