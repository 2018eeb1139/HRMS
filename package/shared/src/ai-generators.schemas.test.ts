import { describe, it, expect } from 'vitest'
import {
  roleDraftSchema,
  interviewGuideSchema,
  feedbackSummarySchema,
  riskReportSchema,
} from './ai-generators.schemas'

describe('roleDraftSchema', () => {
  it('accepts a valid role draft', () => {
    const valid = {
      jobDescription: 'We are looking for a senior engineer...',
      responsibilities: ['Design systems', 'Mentor juniors'],
      requiredSkills: ['TypeScript', 'NestJS'],
      preferredSkills: ['GraphQL'],
      interviewCriteria: ['System design', 'Coding'],
      screeningQuestions: ['Why Picode?'],
    }
    expect(() => roleDraftSchema.parse(valid)).not.toThrow()
  })

  it('rejects when jobDescription is missing', () => {
    const bad = {
      responsibilities: [],
      requiredSkills: [],
      preferredSkills: [],
      interviewCriteria: [],
      screeningQuestions: [],
    }
    expect(() => roleDraftSchema.parse(bad)).toThrow()
  })
})

describe('interviewGuideSchema', () => {
  it('accepts a valid interview guide', () => {
    const valid = {
      questions: [
        { area: 'Technical', question: 'Explain closures.', whatToLookFor: 'Clear explanation' },
      ],
    }
    expect(() => interviewGuideSchema.parse(valid)).not.toThrow()
  })

  it('rejects a question missing whatToLookFor', () => {
    const bad = {
      questions: [{ area: 'Technical', question: 'Explain closures.' }],
    }
    expect(() => interviewGuideSchema.parse(bad)).toThrow()
  })
})

describe('feedbackSummarySchema', () => {
  it('accepts a valid feedback summary', () => {
    const valid = {
      overall: 'Strong candidate with minor concerns.',
      commonStrengths: ['Communication'],
      commonConcerns: ['Limited backend experience'],
      conflictingViews: [],
      decisionSupport: 'Recommend advancing to final round.',
    }
    expect(() => feedbackSummarySchema.parse(valid)).not.toThrow()
  })

  it('rejects when decisionSupport is missing', () => {
    const bad = {
      overall: 'Good',
      commonStrengths: [],
      commonConcerns: [],
      conflictingViews: [],
    }
    expect(() => feedbackSummarySchema.parse(bad)).toThrow()
  })
})

describe('riskReportSchema', () => {
  it('accepts a valid risk report', () => {
    const valid = {
      risks: [
        {
          severity: 'HIGH',
          area: 'Retention',
          finding: 'Candidate has switched jobs 3 times in 2 years.',
          suggestedAction: 'Probe motivations in final round.',
        },
      ],
    }
    expect(() => riskReportSchema.parse(valid)).not.toThrow()
  })

  it('rejects an invalid severity value', () => {
    const bad = {
      risks: [
        {
          severity: 'CRITICAL',
          area: 'Retention',
          finding: 'Some finding',
          suggestedAction: 'Some action',
        },
      ],
    }
    expect(() => riskReportSchema.parse(bad)).toThrow()
  })

  it('accepts all valid severity levels: LOW, MEDIUM, HIGH', () => {
    for (const severity of ['LOW', 'MEDIUM', 'HIGH'] as const) {
      const valid = {
        risks: [{ severity, area: 'Test', finding: 'Finding', suggestedAction: 'Action' }],
      }
      expect(() => riskReportSchema.parse(valid)).not.toThrow()
    }
  })
})
