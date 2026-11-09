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
  const originalApiKey = process.env.GROQ_API_KEY

  beforeEach(() => {
    process.env.GROQ_API_KEY = 'test-key'
    mocks.create.mockReset()
    mocks.create.mockResolvedValue({
      choices: [{ message: { content: '{"summary":"Valid"}' } }],
    })
  })

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.GROQ_API_KEY
    else process.env.GROQ_API_KEY = originalApiKey
  })

  it('requests JSON mode when requested by the caller', async () => {
    const llm = new GroqLlm()

    await llm.complete({
      user: 'Return a JSON object',
      jsonMode: true,
    })

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: 'Return a JSON object' }],
      }),
    )
  })

  it('does not request JSON mode for other Groq callers', async () => {
    const llm = new GroqLlm()

    await llm.complete({ user: 'Write a role draft' })

    expect(mocks.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ response_format: expect.anything() }),
    )
  })
})
