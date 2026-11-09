import { Groq } from 'groq-sdk'
import type { LlmPort } from './cv-structured-parser'

export class GroqLlm implements LlmPort {
  private client: Groq | null = null

  private getClient(): Groq {
    if (!this.client) {
      const apiKey = process.env['GROQ_API_KEY']
      if (!apiKey) {
        throw new Error('GROQ_API_KEY is required for structured CV parsing')
      }
      this.client = new Groq({ apiKey })
    }
    return this.client
  }

  async complete(args: {
    system?: string
    user: string
    maxTokens?: number
    model?: string
  }): Promise<string> {
    const response = await this.getClient().chat.completions.create({
      model: args.model ?? process.env['GROQ_MODEL'] ?? 'openai/gpt-oss-120b',
      max_completion_tokens: args.maxTokens ?? 1024,
      stream: false,
      messages: [
        ...(args.system
          ? [{ role: 'system' as const, content: args.system }]
          : []),
        { role: 'user', content: args.user },
      ],
    })

    const content = response.choices[0]?.message.content
    if (typeof content !== 'string') {
      throw new Error('Groq returned an empty completion for structured CV parsing')
    }
    return content
  }
}
