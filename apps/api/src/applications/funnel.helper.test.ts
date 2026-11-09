import { describe, it, expect } from 'vitest'
import { computeFunnel } from './funnel.helper'

type FunnelApp = Parameters<typeof computeFunnel>[0][number]

const makeInterview = (
  stageKey: string,
  status = 'COMPLETED',
  recommendations: string[] = ['HIRE'],
) => ({
  stageKey,
  status,
  feedback: recommendations.map((recommendation) => ({ recommendation })),
})

const makeApp = (
  overrides: Partial<FunnelApp> = {},
): FunnelApp => ({
  status: 'ACTIVE',
  currentStage: { key: 'CV_RECEIVED', order: 0 },
  matchScore: null,
  interviews: [],
  offer: null,
  ...overrides,
})

describe('computeFunnel', () => {
  it('returns all zeros for an empty application list', () => {
    expect(computeFunnel([])).toEqual({
      peopleAdded: 0,
      cvReviewed: 0,
      screened: 0,
      firstInterview: 0,
      secondInterview: 0,
      selected: 0,
      offer: 0,
      joined: 0,
      rejected: 0,
      withdrawn: 0,
    })
  })

  it('counts campaign membership as both people added and CV reviewed', () => {
    const result = computeFunnel([makeApp()])
    expect(result.peopleAdded).toBe(1)
    expect(result.cvReviewed).toBe(1)
    expect(result.screened).toBe(0)
  })

  it('counts screening only after a match score has been saved', () => {
    const apps = [
      makeApp({ matchScore: null, currentStage: { key: 'HR_SCREEN', order: 4 } }),
      makeApp({ matchScore: 82 }),
    ]
    expect(computeFunnel(apps).screened).toBe(1)
  })

  it('counts each interview round only when an interview is completed', () => {
    const apps = [
      makeApp({
        currentStage: { key: 'HM_INTERVIEW', order: 6 },
        interviews: [
          makeInterview('TECH_INTERVIEW', 'SCHEDULED'),
          makeInterview('HM_INTERVIEW', 'SCHEDULED'),
        ],
      }),
      makeApp({
        interviews: [
          makeInterview('TECH_INTERVIEW'),
          makeInterview('HM_INTERVIEW'),
        ],
      }),
    ]
    const result = computeFunnel(apps)
    expect(result.firstInterview).toBe(1)
    expect(result.secondInterview).toBe(1)
  })

  it('counts selected only after both rounds complete with positive feedback', () => {
    const apps = [
      makeApp({
        interviews: [
          makeInterview('TECH_INTERVIEW'),
          makeInterview('HM_INTERVIEW'),
        ],
      }),
      makeApp({
        interviews: [
          makeInterview('TECH_INTERVIEW'),
          makeInterview('HM_INTERVIEW', 'SCHEDULED'),
        ],
      }),
      makeApp({
        interviews: [
          makeInterview('TECH_INTERVIEW', 'COMPLETED', ['HIRE', 'REJECT']),
          makeInterview('HM_INTERVIEW'),
        ],
      }),
      makeApp({
        interviews: [
          makeInterview('TECH_INTERVIEW'),
          makeInterview('HM_INTERVIEW', 'COMPLETED', ['STRONG_HIRE']),
        ],
      }),
    ]
    const result = computeFunnel(apps)
    expect(result.selected).toBe(2)
    expect(result.firstInterview).toBe(4)
    expect(result.secondInterview).toBe(3)
  })

  it('counts offers from the offer record, not from the current stage', () => {
    const apps = [
      makeApp({ currentStage: { key: 'OFFER', order: 9 } }),
      makeApp({ offer: { status: 'TO_BE_PREPARED' } }),
    ]
    expect(computeFunnel(apps).offer).toBe(1)
  })

  it('counts joined, rejected, and withdrawn from persisted application or offer state', () => {
    const apps = [
      makeApp({ status: 'HIRED' }),
      makeApp({ currentStage: { key: 'JOINED', order: 10 } }),
      makeApp({ offer: { status: 'JOINED' } }),
      makeApp({ status: 'REJECTED' }),
      makeApp({ status: 'WITHDRAWN' }),
    ]
    const result = computeFunnel(apps)
    expect(result.peopleAdded).toBe(5)
    expect(result.cvReviewed).toBe(5)
    expect(result.joined).toBe(3)
    expect(result.rejected).toBe(1)
    expect(result.withdrawn).toBe(1)
  })

  it('preserves previously reached milestones for rejected or withdrawn applicants', () => {
    const app = makeApp({
      status: 'REJECTED',
      matchScore: 75,
      interviews: [
        makeInterview('TECH_INTERVIEW'),
        makeInterview('HM_INTERVIEW'),
      ],
      offer: { status: 'REJECTED' },
    })
    const result = computeFunnel([app])
    expect(result.cvReviewed).toBe(1)
    expect(result.screened).toBe(1)
    expect(result.firstInterview).toBe(1)
    expect(result.secondInterview).toBe(1)
    expect(result.selected).toBe(1)
    expect(result.offer).toBe(1)
    expect(result.rejected).toBe(1)
  })
})
