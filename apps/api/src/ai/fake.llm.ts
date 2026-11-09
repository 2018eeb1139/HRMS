import type { LlmPort } from './llm.port'

type ResponseFn = (args: { system?: string; user: string }) => string

export class FakeLlm implements LlmPort {
  private readonly response: ResponseFn

  constructor(response: string | ResponseFn) {
    this.response = typeof response === 'string' ? () => response : response
  }

  async complete(args: { system?: string; user: string }): Promise<string> {
    return this.response(args)
  }
}
