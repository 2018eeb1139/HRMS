import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
}))

vi.mock('groq-sdk', () => ({
  Groq: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: mocks.create } },
  })),
}))

import { GroqLlm } from './groq.llm'

describe('GroqLlm', () => {
  const originalApiKey = process.env['GROQ_API_KEY']
  const originalModel = process.env['GROQ_MODEL']

  beforeEach(() => {
    process.env['GROQ_API_KEY'] = 'test-key'
    delete process.env['GROQ_MODEL']
    mocks.create.mockReset()
    mocks.create.mockResolvedValue({
      choices: [{ message: { content: '{"skills":["TypeScript"]}' } }],
    })
  })

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env['GROQ_API_KEY']
    else process.env['GROQ_API_KEY'] = originalApiKey
    if (originalModel === undefined) delete process.env['GROQ_MODEL']
    else process.env['GROQ_MODEL'] = originalModel
  })

  it('sends CV parse prompts to Groq and returns the completion', async () => {
    const llm = new GroqLlm()
    const result = await llm.complete({
      system: 'Return JSON',
      user: 'Parse this resume',
      maxTokens: 512,
    })

    expect(result).toBe('{"skills":["TypeScript"]}')
    expect(mocks.create).toHaveBeenCalledWith({
      model: 'openai/gpt-oss-120b',
      max_completion_tokens: 512,
      stream: false,
      messages: [
        { role: 'system', content: 'Return JSON' },
        { role: 'user', content: 'Parse this resume' },
      ],
    })
  })

  it('uses the configured Groq model', async () => {
    process.env['GROQ_MODEL'] = 'configured-model'

    await new GroqLlm().complete({ user: 'Parse this resume' })

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'configured-model' }),
    )
  })

  it('fails clearly when GROQ_API_KEY is missing', async () => {
    delete process.env['GROQ_API_KEY']

    await expect(new GroqLlm().complete({ user: 'Parse this resume' }))
      .rejects.toThrow('GROQ_API_KEY is required for structured CV parsing')
  })

  it('fails clearly when Groq returns no text', async () => {
    mocks.create.mockResolvedValue({ choices: [{ message: { content: null } }] })

    await expect(new GroqLlm().complete({ user: 'Parse this resume' }))
      .rejects.toThrow('Groq returned an empty completion for structured CV parsing')
  })
})
