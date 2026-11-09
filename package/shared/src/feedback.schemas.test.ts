import { describe, it, expect } from 'vitest'
import {
  feedbackRecommendationSchema,
  createTemplateSchema,
  submitFeedbackSchema,
} from './feedback.schemas'

describe('feedbackRecommendationSchema', () => {
  it('accepts valid recommendation values', () => {
    for (const val of ['STRONG_HIRE', 'HIRE', 'HOLD', 'REJECT', 'CONSIDER_OTHER_ROLE']) {
      expect(feedbackRecommendationSchema.parse(val)).toBe(val)
    }
  })

  it('rejects an invalid recommendation value', () => {
    expect(() => feedbackRecommendationSchema.parse('MAYBE')).toThrow()
    expect(() => feedbackRecommendationSchema.parse('')).toThrow()
    expect(() => feedbackRecommendationSchema.parse(null)).toThrow()
  })
})

describe('createTemplateSchema', () => {
  it('accepts a valid template with one field', () => {
    const input = {
      name: 'Technical Screen',
      fields: [{ key: 'coding', label: 'Coding Skills', type: 'rating' as const, weight: 2 }],
    }
    expect(() => createTemplateSchema.parse(input)).not.toThrow()
  })

  it('rejects a template with zero fields', () => {
    expect(() =>
      createTemplateSchema.parse({ name: 'Empty Template', fields: [] }),
    ).toThrow()
  })

  it('requires name to be non-empty', () => {
    expect(() =>
      createTemplateSchema.parse({
        name: '',
        fields: [{ key: 'k', label: 'L', type: 'text' }],
      }),
    ).toThrow()
  })

  it('accepts optional metadata fields', () => {
    const result = createTemplateSchema.parse({
      name: 'Senior Backend',
      roleType: 'Engineering',
      seniority: 'Senior',
      stageKey: 'TECHNICAL',
      ratingScaleMax: 5,
      fields: [{ key: 'problem_solving', label: 'Problem Solving', type: 'rating', mandatory: true }],
    })
    expect(result.seniority).toBe('Senior')
    expect(result.ratingScaleMax).toBe(5)
  })
})

describe('submitFeedbackSchema', () => {
  it('accepts a valid feedback submission', () => {
    const result = submitFeedbackSchema.parse({
      interviewId: 'interview-1',
      scores: { coding: 4, communication: 3 },
      recommendation: 'HIRE',
    })
    expect(result.recommendation).toBe('HIRE')
  })

  it('rejects a bad recommendation value', () => {
    expect(() =>
      submitFeedbackSchema.parse({
        interviewId: 'interview-1',
        scores: {},
        recommendation: 'MAYBE_HIRE',
      }),
    ).toThrow()
  })

  it('accepts mixed numeric and string scores', () => {
    const result = submitFeedbackSchema.parse({
      interviewId: 'interview-1',
      scores: { coding: 4, openEndedNotes: 'Great candidate' },
      recommendation: 'STRONG_HIRE',
      strengths: 'Problem solving',
      concerns: 'Communication style',
      notes: 'Overall positive',
    })
    expect(result.scores['coding']).toBe(4)
    expect(result.scores['openEndedNotes']).toBe('Great candidate')
  })
})
