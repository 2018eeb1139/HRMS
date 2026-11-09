/**
 * Pure aggregation helpers for the Dashboards module.
 *
 * All functions are pure (no Prisma, no side-effects) so they can be
 * unit-tested directly with fabricated inputs and called from the service
 * with pre-fetched data.
 *
 * Heuristics used (explicitly documented per function):
 *  - roleRisk        — gap + targetClosureDate proximity
 *  - headcountTotals — excludes CANCELLED / CLOSED roles
 *  - gapAnalysis     — six gap types; matchScore threshold 75; timeline 14d
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH'

export interface RoleForRisk {
  requiredCount: number
  filledCount: number
  targetClosureDate?: Date | null
}

export interface RoleForHeadcount {
  requiredCount: number
  filledCount: number
  status: string
}

export interface HeadcountTotals {
  openRoles: number
  requiredPositions: number
  filledPositions: number
  gap: number
}

// ── Gap Analysis Input Types ──────────────────────────────────────────────────

export interface GapRole {
  id: string
  requiredCount: number
  filledCount: number
  status: string
  targetJoiningDate?: Date | null
  targetClosureDate?: Date | null
  project?: { startDate?: Date | null } | null
  applications: GapApplication[]
}

export interface GapApplication {
  id: string
  roleId: string
  matchScore?: number | null
  currentStage?: { key: string; order: number } | null
  status: string
  offer?: GapOffer | null
  interviews: GapInterview[]
}

export interface GapOffer {
  status: string
}

export interface GapInterview {
  id: string
  status: string
  feedback: Array<{ id: string }>
}

// ── Gap Analysis Output Types ─────────────────────────────────────────────────

export interface RoleGapItem { roleId: string; reason: string }
export interface SkillGapItem { roleId: string; reason: string }
export interface TimelineGapItem { roleId: string; reason: string }
export interface PipelineGapItem { roleId: string; reason: string }
export interface OfferGapItem { applicationId: string; reason: string }
export interface FeedbackGapItem { interviewId: string; reason: string }

export interface GapAnalysisResult {
  roleGaps: RoleGapItem[]
  skillGaps: SkillGapItem[]
  timelineGaps: TimelineGapItem[]
  pipelineGaps: PipelineGapItem[]
  offerGaps: OfferGapItem[]
  feedbackGaps: FeedbackGapItem[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const EXCLUDED_STATUSES = new Set(['CANCELLED', 'CLOSED'])
const ACTIVE_ROLE_STATUSES = new Set(['OPEN', 'IN_PROGRESS'])
const HIGH_RISK_CLOSURE_DAYS = 7
const TIMELINE_WARNING_DAYS = 14
const AI_STRONG_MATCH_THRESHOLD = 75

/** Offer statuses that indicate an offer is actively progressing */
const ACTIVE_OFFER_STATUSES = new Set(['SENT', 'UNDER_NEGOTIATION', 'ACCEPTED', 'JOINED'])

/** Pipeline stage keys that are "past shortlisted" for pipeline gap counting */
const SHORTLISTED_ORDER_THRESHOLD = 2  // stages with order >= 2 are considered in-pipeline

// ── roleRisk ──────────────────────────────────────────────────────────────────

/**
 * Computes the staffing risk level for a single role.
 *
 * Heuristic:
 *  - gap = requiredCount - filledCount
 *  - If gap <= 0:            LOW  (fully staffed)
 *  - If gap > 0 AND targetClosureDate is in the past or within 7 days: HIGH
 *  - If gap > 0:             MEDIUM  (understaffed but time remaining)
 *
 * @param role - role with counts and optional closure date
 * @param now  - current timestamp (injected so tests are deterministic)
 */
export function roleRisk(role: RoleForRisk, now: Date): RiskLevel {
  const gap = role.requiredCount - role.filledCount
  if (gap <= 0) return 'LOW'

  if (role.targetClosureDate) {
    const msUntilClosure = role.targetClosureDate.getTime() - now.getTime()
    const daysUntilClosure = msUntilClosure / (1000 * 60 * 60 * 24)
    if (daysUntilClosure <= HIGH_RISK_CLOSURE_DAYS) return 'HIGH'
  }

  return 'MEDIUM'
}

// ── headcountTotals ───────────────────────────────────────────────────────────

/**
 * Aggregates headcount across a set of roles.
 *
 * Heuristic: CANCELLED and CLOSED roles are excluded (they are no longer
 * open requisitions). All other statuses (DRAFT, PENDING_APPROVAL, OPEN,
 * IN_PROGRESS, ON_HOLD, FILLED) are counted.
 *
 * openRoles = count of non-excluded roles with gap > 0
 */
export function headcountTotals(roles: RoleForHeadcount[]): HeadcountTotals {
  const active = roles.filter((r) => !EXCLUDED_STATUSES.has(r.status))
  const requiredPositions = active.reduce((sum, r) => sum + r.requiredCount, 0)
  const filledPositions = active.reduce((sum, r) => sum + r.filledCount, 0)
  const gap = requiredPositions - filledPositions
  const openRoles = active.filter((r) => r.requiredCount - r.filledCount > 0).length
  return { openRoles, requiredPositions, filledPositions, gap }
}

// ── gapAnalysis ───────────────────────────────────────────────────────────────

/**
 * Computes the six gap types from pre-fetched data.
 *
 * Pass already-fetched role/application/interview/offer data; no DB calls here.
 *
 * Heuristics per gap type:
 *
 * 1. roleGap (unfilled seats):
 *    Roles with (requiredCount - filledCount) > 0 AND status OPEN or IN_PROGRESS.
 *
 * 2. skillGap (best matches missing):
 *    Among active roles that have at least one application but NONE with
 *    matchScore >= 75. Threshold is AI_STRONG_MATCH_THRESHOLD (configurable const).
 *    Rationale: if the best screened candidates still score < 75, the talent
 *    pool for this role's skill profile is weak.
 *
 * 3. timelineGap (joining timeline at risk):
 *    Roles with remaining headcount (required - filled > 0) AND
 *    (targetJoiningDate or project.startDate) within 14 days AND
 *    confirmedJoiners (offers with ACCEPTED or JOINED) < remaining.
 *
 * 4. pipelineGap (too few candidates in flight):
 *    Roles with remaining > 0 AND count of ACTIVE applications < remaining.
 *    "Active application" = status ACTIVE (not REJECTED/WITHDRAWN/HIRED).
 *
 * 5. offerGap (offer not progressed):
 *    Applications whose currentStage key is SELECTED or is at offer-stage
 *    (key contains "OFFER") but have no Offer record in an active status
 *    (SENT, UNDER_NEGOTIATION, ACCEPTED, JOINED).
 *    Heuristic: stage key "SELECTED" or "OFFER" prefix catches both patterns.
 *
 * 6. feedbackGap (completed interviews with no feedback):
 *    Interviews with status COMPLETED and zero Feedback records attached.
 */
export function gapAnalysis(roles: GapRole[], now: Date): GapAnalysisResult {
  const roleGaps: RoleGapItem[] = []
  const skillGaps: SkillGapItem[] = []
  const timelineGaps: TimelineGapItem[] = []
  const pipelineGaps: PipelineGapItem[] = []
  const offerGaps: OfferGapItem[] = []
  const feedbackGaps: FeedbackGapItem[] = []

  const MS_PER_DAY = 1000 * 60 * 60 * 24

  for (const role of roles) {
    const remaining = role.requiredCount - role.filledCount

    // ── 1. roleGap ──────────────────────────────────────────────────────────
    if (remaining > 0 && ACTIVE_ROLE_STATUSES.has(role.status)) {
      roleGaps.push({
        roleId: role.id,
        reason: `${remaining} unfilled seat(s) — status ${role.status}`,
      })
    }

    // ── 2. skillGap ─────────────────────────────────────────────────────────
    const appsWithScores = role.applications.filter((a) => a.matchScore != null)
    if (
      ACTIVE_ROLE_STATUSES.has(role.status) &&
      role.applications.length > 0 &&
      appsWithScores.length > 0 &&
      !appsWithScores.some((a) => (a.matchScore ?? 0) >= AI_STRONG_MATCH_THRESHOLD)
    ) {
      skillGaps.push({
        roleId: role.id,
        reason: `Has ${appsWithScores.length} screened application(s) but none scored >= ${AI_STRONG_MATCH_THRESHOLD}`,
      })
    }

    // ── 3. timelineGap ──────────────────────────────────────────────────────
    if (remaining > 0) {
      const deadline = role.targetJoiningDate ?? role.project?.startDate ?? null
      if (deadline) {
        const daysUntil = (deadline.getTime() - now.getTime()) / MS_PER_DAY
        if (daysUntil <= TIMELINE_WARNING_DAYS) {
          // Count confirmed joiners: applications with offer in ACCEPTED or JOINED
          const confirmedJoiners = role.applications.filter(
            (a) => a.offer && (a.offer.status === 'ACCEPTED' || a.offer.status === 'JOINED'),
          ).length
          if (confirmedJoiners < remaining) {
            timelineGaps.push({
              roleId: role.id,
              reason: `Deadline in ${Math.round(daysUntil)} day(s); ${confirmedJoiners} confirmed of ${remaining} needed`,
            })
          }
        }
      }
    }

    // ── 4. pipelineGap ──────────────────────────────────────────────────────
    if (remaining > 0 && ACTIVE_ROLE_STATUSES.has(role.status)) {
      const activeApps = role.applications.filter((a) => a.status === 'ACTIVE')
      if (activeApps.length < remaining) {
        pipelineGaps.push({
          roleId: role.id,
          reason: `Only ${activeApps.length} active candidate(s) for ${remaining} remaining seat(s)`,
        })
      }
    }

    // ── 5. offerGap ─────────────────────────────────────────────────────────
    for (const app of role.applications) {
      const stageKey = app.currentStage?.key ?? ''
      const isAtOfferStage =
        stageKey === 'SELECTED' ||
        stageKey.toUpperCase().includes('OFFER') ||
        stageKey.toUpperCase().includes('SELECT')
      if (isAtOfferStage) {
        const hasActiveOffer = app.offer && ACTIVE_OFFER_STATUSES.has(app.offer.status)
        if (!hasActiveOffer) {
          offerGaps.push({
            applicationId: app.id,
            reason: `Application at stage "${stageKey}" but no active offer (TO_BE_PREPARED or missing)`,
          })
        }
      }
    }

    // ── 6. feedbackGap ──────────────────────────────────────────────────────
    for (const app of role.applications) {
      for (const interview of app.interviews) {
        if (interview.status === 'COMPLETED' && interview.feedback.length === 0) {
          feedbackGaps.push({
            interviewId: interview.id,
            reason: `Completed interview has no feedback submitted`,
          })
        }
      }
    }
  }

  return { roleGaps, skillGaps, timelineGaps, pipelineGaps, offerGaps, feedbackGaps }
}
