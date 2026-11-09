import { Inject, Injectable } from '@nestjs/common'
import { screeningResultSchema } from '@picode-hr/shared'
import { z } from 'zod'
import type {
  RecommendationCategory,
  ScreeningInput,
  ScreeningResult,
} from '@picode-hr/shared'
import { GROQ_LLM } from '../llm.port'
import type { LlmPort } from '../llm.port'
import { AiCacheService } from '../ai-cache.service'
import type { ScreeningService } from './screening.service'

const PROMPT_VERSION = '2'
const DEFAULT_MODEL = process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b'
const llmScreeningResultSchema = screeningResultSchema.extend({
  recommendationCategory: z.string(),
})

const SYSTEM_PROMPT = `You are an expert technical recruiter. Evaluate fit using only the supplied candidate profile and role requirements. Return exactly one valid JSON object, with every key and value following this shape:
{"matchScore":0,"skillsMatch":0,"experienceMatch":0,"seniorityFit":0,"industryRelevance":0,"locationFit":0,"summary":"Concise evidence-based summary.","matchedRequiredSkills":[],"missingRequiredSkills":[],"strengths":[],"gaps":[],"riskFlags":[],"suggestedHrQuestions":[],"suggestedInterviewerQuestions":[],"recommendationCategory":"NEEDS_HR_CLARIFICATION"}

All score values are integers from 0 to 100. Keep summary under 300 characters and each text-array to at most 3 concise items. matchedRequiredSkills and missingRequiredSkills must partition the role's requiredSkills. Assess skills semantically, but do not claim skills without evidence in the candidate profile. Be conservative when information is missing.`

function categoryForScore(score: number): RecommendationCategory {
  if (score >= 75) return 'STRONG_SHORTLIST'
  if (score >= 60) return 'SHORTLIST_MINOR_CONCERNS'
  if (score >= 40) return 'NEEDS_HR_CLARIFICATION'
  return 'NOT_SUITABLE'
}

@Injectable()
export class GroqScreeningService implements ScreeningService {
  constructor(
    @Inject(GROQ_LLM) private readonly llm: LlmPort,
    private readonly cache: AiCacheService,
  ) {}

  async score(input: ScreeningInput): Promise<ScreeningResult> {
    const model = DEFAULT_MODEL
    const inputHash = this.cache.hashInput(input)

    return this.cache.getOrCompute<ScreeningResult>({
      type: 'screening',
      inputHash,
      model,
      promptVersion: PROMPT_VERSION,
      compute: async () => {
        const userPrompt =
          `Candidate:\n${JSON.stringify(input.candidate, null, 2)}\n\n` +
          `Role requirements:\n${JSON.stringify(input.role, null, 2)}`
        const raw = await this.llm.complete({
          system: SYSTEM_PROMPT,
          user: userPrompt,
          maxTokens: 2048,
          model,
          jsonMode: true,
        })

        let parsed: unknown
        try {
          const json = raw.trim().replace(/^```(?:json)?\s*|\s*```$/gi, '')
          parsed = JSON.parse(json)
        } catch {
          throw new Error(
            'GroqScreeningService: Groq returned incomplete or invalid JSON. Please retry screening.',
          )
        }

        const result = llmScreeningResultSchema.parse(parsed)
        const requiredSkills = input.role.requiredSkills
        const requiredByLowercase = new Map(
          requiredSkills.map((skill) => [skill.toLowerCase(), skill]),
        )
        const matchedSet = new Set(
          result.matchedRequiredSkills
            .map((skill) => requiredByLowercase.get(skill.toLowerCase()))
            .filter((skill): skill is string => skill !== undefined),
        )
        const matchedRequiredSkills = requiredSkills.filter((skill) =>
          matchedSet.has(skill),
        )
        const missingRequiredSkills = requiredSkills.filter(
          (skill) => !matchedSet.has(skill),
        )
        const skillsMatch =
          requiredSkills.length === 0
            ? 100
            : Math.round((100 * matchedRequiredSkills.length) / requiredSkills.length)
        const matchScore = Math.round(
          0.5 * skillsMatch +
            0.3 * result.experienceMatch +
            0.2 * result.seniorityFit,
        )

        return screeningResultSchema.parse({
          ...result,
          matchScore,
          skillsMatch,
          matchedRequiredSkills,
          missingRequiredSkills,
          recommendationCategory: categoryForScore(matchScore),
        })
      },
    })
  }
}
