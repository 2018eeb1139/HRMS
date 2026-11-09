import Anthropic from '@anthropic-ai/sdk'
import type { LlmPort } from './cv-structured-parser'

export class ClaudeLlm implements LlmPort {
  private client: Anthropic | null = null

  private getClient(): Anthropic {
    if (!this.client) {
      const apiKey = process.env['ANTHROPIC_API_KEY']
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is required for structured CV parsing')
      }
      this.client = new Anthropic({ apiKey })
    }
    return this.client
  }

  async complete(args: {
    system?: string
    user: string
    maxTokens?: number
    model?: string
  }): Promise<string> {
    const model = args.model ?? process.env['ANTHROPIC_MODEL'] ?? 'claude-sonnet-4-6'
    const maxTokens = args.maxTokens ?? 1024

    const response = await this.getClient().messages.create({
      model,
      max_tokens: maxTokens,
      ...(args.system && { system: args.system }),
      messages: [{ role: 'user', content: args.user }],
    })

    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
  }
}
