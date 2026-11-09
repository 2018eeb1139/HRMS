/**
 * Shared TypeScript types for the candidate journey aggregate and campaign funnel.
 * These are type-only exports — no Zod runtime validators needed here since
 * the shapes are assembled server-side, not parsed from user input.
 */

// ── Journey ───────────────────────────────────────────────────────────────────

export interface JourneyInterviewer {
  id: string
  name: string
}

export interface JourneyFeedback {
  id: string
  interviewerId: string
  recommendation: string
  scores: unknown
  strengths: string | null
  concerns: string | null
  notes: string | null
  submittedAt: Date
}

export interface JourneyInterview {
  id: string
  applicationId: string
  stageKey: string | null
  scheduledAt: Date
  durationMin: number
  meetingLink: string | null
  status: string
  interviewers: JourneyInterviewer[]
  feedback: JourneyFeedback[]
}

export interface JourneyStage {
  id: string
  key: string
  label: string
  order: number
  isTerminal: boolean
}

export interface JourneyTransition {
  id: string
  fromStageId: string | null
  toStageId: string | null
  at: Date
  byUserId: string | null
}

export interface JourneyOffer {
  id: string
  applicationId: string
  offeredSalary: string | null
  offerDate: Date | null
  status: string
  expectedJoiningDate: Date | null
  confirmedJoiningDate: Date | null
  joiningRisk: string | null
  notes: string | null
}

export interface JourneyApplication {
  id: string
  candidateId: string
  roleId: string
  currentStageId: string | null
  matchScore: number | null
  screeningSummary: string | null
  hrRecommendation: string | null
  status: string
  rejectionReason: string | null
  createdAt: Date
}

export interface JourneyCandidate {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  location: string | null
  currentCompany: string | null
  currentRole: string | null
  yearsExperience: number | null
  skills: string[]
  linkedinUrl: string | null
  cvUrl: string | null
}

export interface JourneyRole {
  id: string
  title: string
  project: { id: string; name: string; client: string | null } | null
}

export interface CandidateJourney {
  application: JourneyApplication
  candidate: JourneyCandidate
  role: JourneyRole
  currentStage: JourneyStage | null
  transitions: JourneyTransition[]
  interviews: JourneyInterview[]
  offer: JourneyOffer | null
}

// ── Campaign Funnel ───────────────────────────────────────────────────────────

/**
 * Funnel milestones are derived from persisted campaign activity:
 *   peopleAdded    — all applications for the role
 *   cvReviewed     — candidate added to the campaign
 *   screened       — AI match score saved
 *   firstInterview — a TECH_INTERVIEW is completed
 *   secondInterview— an HM_INTERVIEW is completed
 *   selected       — both interview rounds completed with positive feedback
 *   offer          — an offer record exists
 *   joined         — application, stage, or offer is marked JOINED
 *   rejected       — status === REJECTED
 *   withdrawn      — status === WITHDRAWN
 */
export interface CampaignFunnel {
  roleId: string
  peopleAdded: number
  cvReviewed: number
  screened: number
  firstInterview: number
  secondInterview: number
  selected: number
  offer: number
  joined: number
  rejected: number
  withdrawn: number
}
