import { Inject, Injectable } from '@nestjs/common'
import { feedbackSummarySchema } from '@picode-hr/shared'
import type { FeedbackSummaryInput, FeedbackSummary } from '@picode-hr/shared'
import { LLM } from '../llm.port'
import type { LlmPort } from '../llm.port'
import { AiCacheService } from '../ai-cache.service'

const PROMPT_VERSION = '1'
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'

const SYSTEM_PROMPT = `You are an expert recruiter. Return ONLY valid JSON matching this exact shape — no prose, no markdown, no code fences:
{
  "overall": "<string>",
  "commonStrengths": ["<string>"],
  "commonConcerns": ["<string>"],
  "conflictingViews": ["<string>"],
  "decisionSupport": "<string>"
}`

function stripFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
}

@Injectable()
export class FeedbackSummarizerService {
  constructor(
    @Inject(LLM) private readonly llm: LlmPort,
    private readonly cache: AiCacheService,
  ) {}

  async summarize(input: FeedbackSummaryInput): Promise<FeedbackSummary> {
    const model = DEFAULT_MODEL
    const inputHash = this.cache.hashInput(input)

    return this.cache.getOrCompute<FeedbackSummary>({
      type: 'feedback_summary',
      inputHash,
      model,
      promptVersion: PROMPT_VERSION,
      compute: async () => {
        const userPrompt = `Interview feedback entries:\n${JSON.stringify(input.feedback, null, 2)}`

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
          throw new Error(
            `FeedbackSummarizerService: LLM returned non-JSON: ${raw.slice(0, 200)}`,
          )
        }

        return feedbackSummarySchema.parse(parsed)
      },
    })
  }
}
