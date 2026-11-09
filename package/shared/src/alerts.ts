import type {
  AlertConfig,
  AlertSnapshot,
  AlertSnapshotRole,
  AlertSnapshotInterview,
  AlertSnapshotSelectedWithoutOffer,
  AlertSnapshotProject,
  AlertSnapshotJoiner,
  AlertSnapshotOverdueFollowUp,
  RaisedAlert,
} from './alerts.schemas'
import { DEFAULT_ALERT_CONFIG } from './alerts.schemas'

const MS_PER_HOUR = 60 * 60 * 1000
const MS_PER_DAY = 24 * MS_PER_HOUR

// ── Rule helpers ──────────────────────────────────────────────────────────────

function msSince(nowMs: number, isoDate: string): number {
  return nowMs - new Date(isoDate).getTime()
}

function msUntil(nowMs: number, isoDate: string): number {
  return new Date(isoDate).getTime() - nowMs
}

// ── Individual rule evaluators ────────────────────────────────────────────────

function evalRoleNoShortlist(
  roles: AlertSnapshotRole[],
  nowMs: number,
  cfg: AlertConfig,
): RaisedAlert[] {
  const results: RaisedAlert[] = []
  for (const role of roles) {
    if (role.status !== 'OPEN' && role.status !== 'IN_PROGRESS') continue
    if (role.shortlistedCount > 0) continue
    if (!role.hrOwnerId) continue
    const ageMs = msSince(nowMs, role.createdAt)
    if (ageMs <= cfg.noShortlistDays * MS_PER_DAY) continue
    results.push({
      type: 'ROLE_NO_SHORTLIST',
      userId: role.hrOwnerId,
      entityType: 'RoleReq',
      entityId: role.id,
      message: `Role "${role.title}" has been open for more than ${cfg.noShortlistDays} days with no candidates shortlisted.`,
    })
  }
  return results
}

function evalFeedbackPending24h(
  interviews: AlertSnapshotInterview[],
  nowMs: number,
): RaisedAlert[] {
  const results: RaisedAlert[] = []
  for (const iv of interviews) {
    if (iv.feedbackCount > 0) continue
    if (!iv.hrOwnerId) continue
    const elapsed = msSince(nowMs, iv.scheduledAt)
    if (elapsed <= 24 * MS_PER_HOUR) continue
    results.push({
      type: 'FEEDBACK_PENDING_24H',
      userId: iv.hrOwnerId,
      entityType: 'Interview',
      entityId: iv.id,
      message: `Interview (id: ${iv.id}) completed more than 24 hours ago but no feedback has been submitted.`,
    })
  }
  return results
}

function evalOfferNotSent(
  selected: AlertSnapshotSelectedWithoutOffer[],
): RaisedAlert[] {
  const results: RaisedAlert[] = []
  for (const s of selected) {
    if (!s.hrOwnerId) continue
    results.push({
      type: 'OFFER_NOT_SENT',
      userId: s.hrOwnerId,
      entityType: 'Application',
      entityId: s.applicationId,
      message: `Candidate selected for application ${s.applicationId} but no offer has been sent yet.`,
    })
  }
  return results
}

function evalProjectStartWithGaps(
  projects: AlertSnapshotProject[],
  nowMs: number,
  cfg: AlertConfig,
): RaisedAlert[] {
  const results: RaisedAlert[] = []
  for (const p of projects) {
    if (p.gap <= 0) continue
    if (!p.projectManagerId) continue
    const timeUntilStart = msUntil(nowMs, p.startDate)
    if (timeUntilStart < 0) continue // already started
    if (timeUntilStart > cfg.projectStartDays * MS_PER_DAY) continue
    results.push({
      type: 'PROJECT_START_WITH_GAPS',
      userId: p.projectManagerId,
      entityType: 'Project',
      entityId: p.id,
      message: `Project "${p.name}" starts in ${Math.ceil(timeUntilStart / MS_PER_DAY)} day(s) but has ${p.gap} unfilled position(s).`,
    })
  }
  return results
}

function evalJoiningDocsPending(
  joiners: AlertSnapshotJoiner[],
  nowMs: number,
  cfg: AlertConfig,
): RaisedAlert[] {
  const results: RaisedAlert[] = []
  for (const j of joiners) {
    if (j.documentsPending.length === 0) continue
    if (!j.hrOwnerId) continue
    const timeUntilJoining = msUntil(nowMs, j.joiningDate)
    if (timeUntilJoining < 0) continue // already joined
    if (timeUntilJoining > cfg.joiningDocsDays * MS_PER_DAY) continue
    results.push({
      type: 'JOINING_DOCS_PENDING',
      userId: j.hrOwnerId,
      entityType: 'Offer',
      entityId: j.offerId,
      message: `Offer ${j.offerId}: joiner is due in ${Math.ceil(timeUntilJoining / MS_PER_DAY)} day(s) but ${j.documentsPending.length} document(s) are still pending: ${j.documentsPending.join(', ')}.`,
    })
  }
  return results
}

function evalRoleFulfilled(roles: AlertSnapshotRole[]): RaisedAlert[] {
  const results: RaisedAlert[] = []
  for (const role of roles) {
    if (role.status === 'CLOSED' || role.status === 'CANCELLED') continue
    if (role.filledCount < role.requiredCount) continue
    if (!role.hrOwnerId) continue
    results.push({
      type: 'ROLE_FULFILLED',
      userId: role.hrOwnerId,
      entityType: 'RoleReq',
      entityId: role.id,
      message: `Role "${role.title}" has reached its required headcount (${role.filledCount}/${role.requiredCount}). Consider closing this role.`,
    })
  }
  return results
}

function evalHighPriorityRoleDelayed(
  roles: AlertSnapshotRole[],
  nowMs: number,
): RaisedAlert[] {
  const results: RaisedAlert[] = []
  for (const role of roles) {
    if (role.priority !== 'HIGH' && role.priority !== 'CRITICAL') continue
    if (!role.targetClosureDate) continue
    if (!role.hrOwnerId) continue
    const remaining = role.requiredCount - role.filledCount
    if (remaining <= 0) continue
    const isOverdue = nowMs > new Date(role.targetClosureDate).getTime()
    if (!isOverdue) continue
    results.push({
      type: 'HIGH_PRIORITY_ROLE_DELAYED',
      userId: role.hrOwnerId,
      entityType: 'RoleReq',
      entityId: role.id,
      message: `High-priority role "${role.title}" is past its target closure date with ${remaining} position(s) still unfilled.`,
    })
  }
  return results
}

function evalCandidateUnresponsive(
  followUps: AlertSnapshotOverdueFollowUp[],
): RaisedAlert[] {
  return followUps.map((f) => ({
    type: 'CANDIDATE_UNRESPONSIVE' as const,
    userId: f.ownerId,
    entityType: 'CommunicationLog',
    entityId: f.communicationId,
    message: `Follow-up (id: ${f.communicationId}) is overdue — candidate has not responded.`,
  }))
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Pure rule engine — no I/O, no `new Date()`.
 * Pass `now` as an ISO string so tests can pin time deterministically.
 */
export function evaluateAlerts(
  snapshot: AlertSnapshot,
  cfg?: Partial<AlertConfig>,
): RaisedAlert[] {
  const config: AlertConfig = { ...DEFAULT_ALERT_CONFIG, ...cfg }
  const nowMs = new Date(snapshot.now).getTime()

  return [
    ...evalRoleNoShortlist(snapshot.roles, nowMs, config),
    ...evalFeedbackPending24h(snapshot.completedInterviews, nowMs),
    ...evalOfferNotSent(snapshot.selectedWithoutOffer),
    ...evalProjectStartWithGaps(snapshot.projectsStartingSoon, nowMs, config),
    ...evalJoiningDocsPending(snapshot.joiners, nowMs, config),
    ...evalRoleFulfilled(snapshot.roles),
    ...evalHighPriorityRoleDelayed(snapshot.roles, nowMs),
    ...evalCandidateUnresponsive(snapshot.overdueFollowUps),
  ]
}
