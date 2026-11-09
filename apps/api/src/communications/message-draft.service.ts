import { Inject, Injectable } from '@nestjs/common'
import { messageDraftSchema } from '@picode-hr/shared'
import type { MessageDraft, MessageDraftInput } from '@picode-hr/shared'
import { LLM } from '../ai/llm.port'
import type { LlmPort } from '../ai/llm.port'
import { AiCacheService } from '../ai/ai-cache.service'

const PROMPT_VERSION = '1'
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'

function stripFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
}

@Injectable()
export class MessageDraftService {
  constructor(
    @Inject(LLM) private readonly llm: LlmPort,
    private readonly cache: AiCacheService,
  ) {}

  async draft(input: MessageDraftInput): Promise<MessageDraft> {
    const model = DEFAULT_MODEL
    const inputHash = this.cache.hashInput(input)

    return this.cache.getOrCompute<MessageDraft>({
      type: 'message_draft',
      inputHash,
      model,
      promptVersion: PROMPT_VERSION,
      compute: async () => {
        const roleContext = input.roleTitle ? ` for the ${input.roleTitle} role` : ''
        const systemPrompt = `You are an HR recruiter writing a concise, professional ${input.kind} message to ${input.candidateName}${roleContext}. Return ONLY JSON {"subject": "<string>", "body": "<string>"} — no prose, no markdown, no code fences.`

        const userPrompt = [
          `Kind: ${input.kind}`,
          `Candidate: ${input.candidateName}`,
          input.roleTitle ? `Role: ${input.roleTitle}` : null,
          input.context ? `Context: ${input.context}` : null,
        ]
          .filter(Boolean)
          .join('\n')

        const raw = await this.llm.complete({
          system: systemPrompt,
          user: userPrompt,
          maxTokens: 512,
          model,
        })

        let parsed: unknown
        try {
          parsed = JSON.parse(stripFences(raw))
        } catch {
          throw new Error(`MessageDraftService: LLM returned non-JSON: ${raw.slice(0, 200)}`)
        }

        return messageDraftSchema.parse(parsed)
      },
    })
  }
}
