import { Inject, Injectable } from '@nestjs/common'
import { screeningResultSchema } from '@picode-hr/shared'
import type { ScreeningInput, ScreeningResult } from '@picode-hr/shared'
import { LLM } from '../llm.port'
import type { LlmPort } from '../llm.port'
import { AiCacheService } from '../ai-cache.service'
import type { ScreeningService } from './screening.service'

const PROMPT_VERSION = '2'
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'

const SYSTEM_PROMPT = `You are an expert technical recruiter. Given a candidate profile and role requirements, evaluate fit and return ONLY a JSON object — no markdown, no commentary, no code fences.

The JSON must match this exact shape:
{
  "matchScore": <integer 0-100>,
  "skillsMatch": <integer 0-100>,
  "experienceMatch": <integer 0-100>,
  "seniorityFit": <integer 0-100>,
  "industryRelevance": <integer 0-100>,
  "locationFit": <integer 0-100>,
  "summary": <concise, evidence-based 1-2 sentence summary, maximum 500 characters>,
  "matchedRequiredSkills": [<required skills supported by the candidate profile>],
  "missingRequiredSkills": [<required skills not supported by the candidate profile>],
  "strengths": [<string>],
  "gaps": [<string>],
  "riskFlags": [<string>],
  "suggestedHrQuestions": [<string>],
  "suggestedInterviewerQuestions": [<string>],
  "recommendationCategory": <"STRONG_SHORTLIST"|"SHORTLIST_MINOR_CONCERNS"|"NEEDS_HR_CLARIFICATION"|"NOT_SUITABLE"|"BETTER_FIT_OTHER_ROLE">
}

matchScore = 0.5*skillsMatch + 0.3*experienceMatch + 0.2*seniorityFit (rounded).
skillsMatch is the percentage of required skills matched. matchedRequiredSkills and missingRequiredSkills must partition the role's requiredSkills; do not claim a skill without evidence in the candidate profile. Keep the summary concise and grounded only in the supplied information.
Output ONLY the JSON object.`

@Injectable()
export class ClaudeScreeningService implements ScreeningService {
  constructor(
    @Inject(LLM) private readonly llm: LlmPort,
    private readonly cache: AiCacheService,
  ) {}

  async score(input: ScreeningInput): Promise<ScreeningResult> {
    const model = DEFAULT_MODEL
    const inputHash = this.cache.hashInput(input)

    const result = await this.cache.getOrCompute<ScreeningResult>({
      type: 'screening',
      inputHash,
      model,
      promptVersion: PROMPT_VERSION,
      compute: async () => {
        const userPrompt = `Candidate:\n${JSON.stringify(input.candidate, null, 2)}\n\nRole requirements:\n${JSON.stringify(input.role, null, 2)}`

        const raw = await this.llm.complete({
          system: SYSTEM_PROMPT,
          user: userPrompt,
          maxTokens: 1024,
          model,
        })

        let parsed: unknown
        try {
          parsed = JSON.parse(raw)
        } catch {
          throw new Error(`ClaudeScreeningService: LLM returned non-JSON response: ${raw.slice(0, 200)}`)
        }

        return screeningResultSchema.parse(parsed)
      },
    })

    return result
  }
}
