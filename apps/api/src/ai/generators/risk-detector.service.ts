import { Inject, Injectable } from '@nestjs/common'
import { riskReportSchema } from '@picode-hr/shared'
import type { RiskReportInput, RiskReport } from '@picode-hr/shared'
import { LLM } from '../llm.port'
import type { LlmPort } from '../llm.port'
import { AiCacheService } from '../ai-cache.service'

const PROMPT_VERSION = '1'
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'

const SYSTEM_PROMPT = `You are an expert recruiter. Return ONLY valid JSON matching this exact shape — no prose, no markdown, no code fences:
{
  "risks": [
    {
      "severity": "<LOW|MEDIUM|HIGH>",
      "area": "<string>",
      "finding": "<string>",
      "suggestedAction": "<string>"
    }
  ]
}`

function stripFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
}

@Injectable()
export class RiskDetectorService {
  constructor(
    @Inject(LLM) private readonly llm: LlmPort,
    private readonly cache: AiCacheService,
  ) {}

  async detect(input: RiskReportInput): Promise<RiskReport> {
    const model = DEFAULT_MODEL
    const inputHash = this.cache.hashInput(input)

    return this.cache.getOrCompute<RiskReport>({
      type: 'risk_report',
      inputHash,
      model,
      promptVersion: PROMPT_VERSION,
      compute: async () => {
        const userPrompt = `Hiring signals to evaluate:\n${JSON.stringify(input.signals, null, 2)}`

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
          throw new Error(`RiskDetectorService: LLM returned non-JSON: ${raw.slice(0, 200)}`)
        }

        return riskReportSchema.parse(parsed)
      },
    })
  }
}
