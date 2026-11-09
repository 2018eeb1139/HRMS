import { Injectable } from '@nestjs/common'
import { screeningResultSchema } from '@picode-hr/shared'
import type { ScreeningInput, ScreeningResult, RecommendationCategory } from '@picode-hr/shared'
import type { ScreeningService } from './screening.service'

const LOW = (s: string) => s.toLowerCase()

@Injectable()
export class RuleBasedScreeningService implements ScreeningService {
  async score(input: ScreeningInput): Promise<ScreeningResult> {
    const { candidate, role } = input

    // ── Skills match ─────────────────────────────────────────────────────────
    const candidateSkillsLower = candidate.skills.map(LOW)
    const requiredLower = role.requiredSkills.map(LOW)
    const matchedRequiredSkills = role.requiredSkills.filter((s) =>
      candidateSkillsLower.includes(LOW(s)),
    )
    const missingRequiredSkills = role.requiredSkills.filter(
      (s) => !candidateSkillsLower.includes(LOW(s)),
    )
    const skillsMatch =
      requiredLower.length === 0
        ? 100
        : Math.round((100 * matchedRequiredSkills.length) / requiredLower.length)

    // ── Experience match ──────────────────────────────────────────────────────
    const reqYears = role.requiredYearsExperience
    const candYears = candidate.yearsExperience
    let experienceMatch: number
    if (reqYears === undefined || reqYears === null) {
      experienceMatch = 100
    } else if (candYears === undefined || candYears === null) {
      experienceMatch = 0
    } else if (candYears >= reqYears) {
      experienceMatch = 100
    } else {
      experienceMatch = Math.round((100 * candYears) / reqYears)
    }

    // ── Seniority fit ─────────────────────────────────────────────────────────
    let seniorityFit: number
    if (!role.seniority) {
      seniorityFit = 100
    } else if (candidate.seniority && LOW(candidate.seniority) === LOW(role.seniority)) {
      seniorityFit = 100
    } else {
      seniorityFit = 50
    }

    // ── Industry relevance (insufficient data at this stage — default 70) ────
    // pgvector embeddings + CV parsing (next task) will provide real industry signals.
    const industryRelevance = 70

    // ── Location fit ──────────────────────────────────────────────────────────
    let locationFit: number
    if (!role.location) {
      locationFit = 100
    } else if (candidate.location && LOW(candidate.location) === LOW(role.location)) {
      locationFit = 100
    } else {
      locationFit = 60
    }

    // ── Composite matchScore ──────────────────────────────────────────────────
    const matchScore = Math.round(
      0.5 * skillsMatch + 0.3 * experienceMatch + 0.2 * seniorityFit,
    )

    // ── Strengths / gaps / risk flags ─────────────────────────────────────────
    const strengths =
      matchedRequiredSkills.length > 0
        ? [`Matches required skills: ${matchedRequiredSkills.join(', ')}`]
        : []

    const gaps = missingRequiredSkills

    const riskFlags: string[] = []
    if (experienceMatch < 100 && reqYears !== undefined) {
      riskFlags.push(
        `Below required experience (${candYears ?? 0} of ${reqYears} years required)`,
      )
    }

    // ── Suggested questions ───────────────────────────────────────────────────
    const suggestedHrQuestions =
      gaps.length > 0
        ? [`Can you walk us through your experience (or lack thereof) with: ${gaps.join(', ')}?`]
        : ['What aspects of this role excite you the most?']

    const suggestedInterviewerQuestions =
      gaps.length > 0
        ? [`Please describe any exposure you have had to ${gaps[0]} and how you would approach learning it.`]
        : ['Describe a challenging technical problem you solved recently.']

    // ── Recommendation category ───────────────────────────────────────────────
    let recommendationCategory: RecommendationCategory
    if (matchScore >= 75) {
      recommendationCategory = 'STRONG_SHORTLIST'
    } else if (matchScore >= 60) {
      recommendationCategory = 'SHORTLIST_MINOR_CONCERNS'
    } else if (matchScore >= 40) {
      recommendationCategory = 'NEEDS_HR_CLARIFICATION'
    } else {
      recommendationCategory = 'NOT_SUITABLE'
    }

    const result: ScreeningResult = {
      matchScore,
      skillsMatch,
      experienceMatch,
      seniorityFit,
      industryRelevance,
      locationFit,
      summary:
        requiredLower.length === 0
          ? `Overall match is ${matchScore}%. No required skills were listed.`
          : `Overall match is ${matchScore}%. Matched ${matchedRequiredSkills.length} of ${role.requiredSkills.length} required skills; experience fit ${experienceMatch}% and seniority fit ${seniorityFit}%.`,
      matchedRequiredSkills,
      missingRequiredSkills,
      strengths,
      gaps,
      riskFlags,
      suggestedHrQuestions,
      suggestedInterviewerQuestions,
      recommendationCategory,
    }

    return screeningResultSchema.parse(result)
  }
}
