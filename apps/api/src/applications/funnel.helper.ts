import type { CampaignFunnel } from '@picode-hr/shared'

/**
 * Minimal application shape needed by computeFunnel.
 * The service passes the application plus the persisted screening, interview,
 * feedback, and offer data used to determine each funnel milestone.
 */
export interface FunnelApp {
  status: string
  currentStage: { key: string; order: number } | null
  matchScore: number | null
  interviews: Array<{
    stageKey: string | null
    status: string
    feedback: Array<{ recommendation: string }>
  }>
  offer: { status: string } | null
}

const POSITIVE_RECOMMENDATIONS = new Set(['HIRE', 'STRONG_HIRE'])

function isRoundCleared(app: FunnelApp, stageKey: string): boolean {
  const interviews = app.interviews.filter(
    (interview) => interview.stageKey === stageKey,
  )

  return (
    interviews.length > 0 &&
    interviews.every(
      (interview) =>
        interview.status === 'COMPLETED' &&
        interview.feedback.length > 0 &&
        interview.feedback.every((feedback) =>
          POSITIVE_RECOMMENDATIONS.has(feedback.recommendation),
        ),
    )
  )
}

/**
 * Pure function — no side effects, easily unit-tested.
 * Accepts applications with persisted screening, interview, feedback, and offer state.
 * Returns a CampaignFunnel (without roleId — caller adds it).
 */
export function computeFunnel(apps: FunnelApp[]): Omit<CampaignFunnel, 'roleId'> {
  let cvReviewed = 0
  let screened = 0
  let firstInterview = 0
  let secondInterview = 0
  let selected = 0
  let offer = 0
  let joined = 0
  let rejected = 0
  let withdrawn = 0

  for (const app of apps) {
    if (app.status === 'REJECTED') rejected++
    if (app.status === 'WITHDRAWN') withdrawn++

    // Adding a person to the campaign is the CV-reviewed funnel entry point.
    cvReviewed++
    if (app.matchScore !== null) screened++
    if (
      app.interviews.some(
        (interview) =>
          interview.stageKey === 'TECH_INTERVIEW' &&
          interview.status === 'COMPLETED',
      )
    ) firstInterview++
    if (
      app.interviews.some(
        (interview) =>
          interview.stageKey === 'HM_INTERVIEW' &&
          interview.status === 'COMPLETED',
      )
    ) secondInterview++
    if (
      isRoundCleared(app, 'TECH_INTERVIEW') &&
      isRoundCleared(app, 'HM_INTERVIEW')
    ) selected++
    if (app.offer) offer++
    if (
      app.status === 'HIRED' ||
      app.currentStage?.key === 'JOINED' ||
      app.offer?.status === 'JOINED'
    ) joined++
  }

  return {
    peopleAdded: apps.length,
    cvReviewed,
    screened,
    firstInterview,
    secondInterview,
    selected,
    offer,
    joined,
    rejected,
    withdrawn,
  }
}
