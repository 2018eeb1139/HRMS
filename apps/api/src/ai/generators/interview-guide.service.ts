import { Inject, Injectable } from '@nestjs/common'
import { interviewGuideSchema } from '@picode-hr/shared'
import type { InterviewGuideInput, InterviewGuide } from '@picode-hr/shared'
import { LLM } from '../llm.port'
import type { LlmPort } from '../llm.port'
import { AiCacheService } from '../ai-cache.service'

const PROMPT_VERSION = '1'
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'

const SYSTEM_PROMPT = `You are an expert recruiter. Return ONLY valid JSON matching this exact shape — no prose, no markdown, no code fences:
{
  "questions": [
    { "area": "<string>", "question": "<string>", "whatToLookFor": "<string>" }
  ]
}`

function stripFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
}

@Injectable()
export class InterviewGuideService {
  constructor(
    @Inject(LLM) private readonly llm: LlmPort,
    private readonly cache: AiCacheService,
  ) {}

  async generate(input: InterviewGuideInput): Promise<InterviewGuide> {
    const model = DEFAULT_MODEL
    const inputHash = this.cache.hashInput(input)

    return this.cache.getOrCompute<InterviewGuide>({
      type: 'interview_guide',
      inputHash,
      model,
      promptVersion: PROMPT_VERSION,
      compute: async () => {
        const userPrompt = [
          `Role: ${input.roleTitle}`,
          input.seniority ? `Seniority: ${input.seniority}` : null,
          `Required skills: ${input.requiredSkills.join(', ')}`,
          input.candidateGaps?.length
            ? `Known candidate gaps: ${input.candidateGaps.join(', ')}`
            : null,
        ]
          .filter(Boolean)
          .join('\n')

        const raw = await this.llm.complete({
          system: SYSTEM_PROMPT,
          user: userPrompt,
          maxTokens: 1024,
          model,
        })

        let parsed: unknown
        try {
          parsed = JSON.parse(stripFences(raw))
        } catch {
          throw new Error(`InterviewGuideService: LLM returned non-JSON: ${raw.slice(0, 200)}`)
        }

        return interviewGuideSchema.parse(parsed)
      },
    })
  }
}
