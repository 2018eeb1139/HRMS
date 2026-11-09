import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type { FeedbackField, FeedbackRecommendation, SubmitFeedback } from '@picode-hr/shared'
import type { FeedbackSummaryInput } from '@picode-hr/shared'
import { PrismaService } from '../prisma/prisma.service'
import { FeedbackSummarizerService } from '../ai/generators/feedback-summarizer.service'

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Recommendations considered "positive" for conflict detection.
 * A conflicting application has at least one positive AND one negative recommendation.
 */
const POSITIVE_RECOMMENDATIONS = new Set<FeedbackRecommendation>(['STRONG_HIRE', 'HIRE'])
const NEGATIVE_RECOMMENDATIONS = new Set<FeedbackRecommendation>(['REJECT'])

/**
 * Delay threshold: an interview is "delayed" when it's COMPLETED but feedback
 * has not been submitted, and it has been more than DELAY_HOURS since the
 * scheduled interview time.
 */
const DELAY_HOURS = 24

@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly summarizer: FeedbackSummarizerService,
  ) {}

  // ── Submit ──────────────────────────────────────────────────────────────────

  async submit(input: SubmitFeedback, interviewerId: string) {
    const interview = await this.prisma.interview.findUnique({
      where: { id: input.interviewId },
    })
    if (!interview) {
      throw new NotFoundException(`Interview ${input.interviewId} not found`)
    }

    try {
      return await this.prisma.feedback.create({
        data: {
          interviewId: input.interviewId,
          interviewerId,
          templateId: input.templateId ?? null,
          scores: input.scores,
          strengths: input.strengths ?? null,
          concerns: input.concerns ?? null,
          notes: input.notes ?? null,
          recommendation: input.recommendation,
        },
      })
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException('Feedback already submitted for this interview')
      }
      throw err
    }
  }

  // ── List ────────────────────────────────────────────────────────────────────

  listForInterview(interviewId: string) {
    return this.prisma.feedback.findMany({
      where: { interviewId },
      orderBy: { submittedAt: 'asc' },
    })
  }

  async listForApplication(applicationId: string) {
    // Find all interviews for the application, then return their feedback.
    const interviews = await this.prisma.interview.findMany({
      where: { applicationId },
      select: { id: true },
    })
    const interviewIds = interviews.map((i) => i.id)
    if (interviewIds.length === 0) return []
    return this.prisma.feedback.findMany({
      where: { interviewId: { in: interviewIds } },
      orderBy: { submittedAt: 'asc' },
    })
  }

  // ── Weighted Average ────────────────────────────────────────────────────────

  /**
   * Computes a weighted average of rating-type scores across a set of feedback.
   *
   * Algorithm:
   *  1. For each Feedback record, iterate over the `scores` map.
   *  2. A score is included only if:
   *     a. Its value is a number (non-numeric scores are text fields — skipped).
   *     b. When a template is provided, the corresponding field has `type === 'rating'`.
   *        Without a template, all numeric scores are treated as ratings.
   *  3. Each included score is multiplied by the field weight (default 1 if not set).
   *  4. Final result = sum(score * weight) / sum(weight).
   *  5. Returns NaN when there are no qualifying scores (no template, empty inputs, etc.)
   *     — callers should guard with Number.isFinite().
   */
  weightedAverage(
    feedbackList: Array<{ scores: unknown }>,
    template?: { fields: unknown },
  ): number {
    // Build a lookup from field key → { weight, isRating }
    const fieldMap = new Map<string, { weight: number; isRating: boolean }>()

    if (template?.fields && Array.isArray(template.fields)) {
      for (const rawField of template.fields) {
        const field = rawField as FeedbackField
        fieldMap.set(field.key, {
          weight: field.weight ?? 1,
          isRating: field.type === 'rating',
        })
      }
    }

    const hasTemplate = fieldMap.size > 0
    let weightedSum = 0
    let totalWeight = 0

    for (const fb of feedbackList) {
      const scores = fb.scores as Record<string, unknown>
      if (!scores || typeof scores !== 'object') continue

      for (const [key, rawValue] of Object.entries(scores)) {
        if (typeof rawValue !== 'number') continue

        if (hasTemplate) {
          const fieldInfo = fieldMap.get(key)
          if (!fieldInfo?.isRating) continue
          weightedSum += rawValue * fieldInfo.weight
          totalWeight += fieldInfo.weight
        } else {
          // No template — treat all numeric entries as rating with weight 1
          weightedSum += rawValue
          totalWeight += 1
        }
      }
    }

    return totalWeight === 0 ? NaN : weightedSum / totalWeight
  }

  // ── Tracking ────────────────────────────────────────────────────────────────

  /**
   * Returns a tracking summary across interviews, optionally scoped to a role.
   *
   * Definitions:
   *  - submitted: total Feedback records found.
   *  - pending: COMPLETED interviews that have 0 feedback records.
   *    Assumption: any interviewer listed in `interviewerIds` is expected to
   *    submit feedback; we count the interview-level gap (not per-interviewer).
   *  - delayed: COMPLETED interviews with 0 feedback AND
   *    (now - scheduledAt) > DELAY_HOURS hours.
   *  - conflicting: applications where submitted feedback recommendations
   *    span both a positive set {STRONG_HIRE, HIRE} and a negative set {REJECT}.
   *    Returns the conflicting application IDs.
   */
  async tracking(roleId?: string): Promise<{
    submitted: number
    pending: number
    delayed: number
    conflicting: string[]
  }> {
    const now = new Date()
    const delayThresholdMs = DELAY_HOURS * 60 * 60 * 1000

    // Fetch COMPLETED interviews (optionally scoped to a role's applications)
    const interviewWhere = roleId
      ? { status: 'COMPLETED' as const, application: { roleId } }
      : { status: 'COMPLETED' as const }

    const interviews = await this.prisma.interview.findMany({
      where: interviewWhere,
      include: {
        feedback: { select: { id: true, recommendation: true } },
        application: { select: { id: true } },
      },
    })

    let submitted = 0
    let pending = 0
    let delayed = 0

    // Track per-application recommendations for conflict detection
    const appRecommendations = new Map<string, Set<FeedbackRecommendation>>()

    for (const interview of interviews) {
      const feedbackCount = interview.feedback.length
      submitted += feedbackCount

      if (feedbackCount === 0) {
        pending += 1
        const ageMs = now.getTime() - interview.scheduledAt.getTime()
        if (ageMs > delayThresholdMs) {
          delayed += 1
        }
      }

      // Collect recommendations for conflict analysis
      const appId = interview.application.id
      if (!appRecommendations.has(appId)) {
        appRecommendations.set(appId, new Set())
      }
      const recSet = appRecommendations.get(appId)!
      for (const fb of interview.feedback) {
        recSet.add(fb.recommendation as FeedbackRecommendation)
      }
    }

    // Find applications with conflicting recommendations
    const conflicting: string[] = []
    for (const [appId, recs] of appRecommendations) {
      const hasPositive = [...recs].some((r) => POSITIVE_RECOMMENDATIONS.has(r))
      const hasNegative = [...recs].some((r) => NEGATIVE_RECOMMENDATIONS.has(r))
      if (hasPositive && hasNegative) {
        conflicting.push(appId)
      }
    }

    return { submitted, pending, delayed, conflicting }
  }

  // ── AI Summary ──────────────────────────────────────────────────────────────

  async aiSummary(applicationId: string) {
    const feedbackList = await this.listForApplication(applicationId)

    const feedbackInput: FeedbackSummaryInput['feedback'] = feedbackList.map((fb) => ({
      interviewer: fb.interviewerId,
      recommendation: fb.recommendation,
      strengths: fb.strengths ?? undefined,
      concerns: fb.concerns ?? undefined,
      notes: fb.notes ?? undefined,
    }))

    return this.summarizer.summarize({ feedback: feedbackInput })
  }
}
