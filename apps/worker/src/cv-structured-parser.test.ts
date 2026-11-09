import { describe, it, expect } from 'vitest'
import { CvStructuredParser, type LlmPort } from './cv-structured-parser'

const makeFakeLlm = (response: string): LlmPort => ({
  complete: async () => response,
})

const VALID_CV_JSON = JSON.stringify({
  name: 'Jane Doe',
  email: 'jane@example.com',
  phone: '+44 7700 900000',
  location: 'London, UK',
  currentTitle: 'Senior Software Engineer',
  currentEmployer: 'Acme Corp',
  totalYearsExperience: 8,
  education: 'BSc Computer Science, UCL',
  skills: ['TypeScript', 'React', 'Node.js'],
  certifications: ['AWS Solutions Architect'],
  previousCompanies: ['StartupX', 'BigCo'],
  noticePeriod: '1 month',
  salaryDetails: '£80,000',
})

describe('CvStructuredParser', () => {
  describe('valid JSON response', () => {
    it('parses a bare JSON response into ParsedCv', async () => {
      const parser = new CvStructuredParser(makeFakeLlm(VALID_CV_JSON))
      const result = await parser.parse('some raw cv text')

      expect(result.name).toBe('Jane Doe')
      expect(result.email).toBe('jane@example.com')
      expect(result.currentTitle).toBe('Senior Software Engineer')
      expect(result.currentEmployer).toBe('Acme Corp')
      expect(result.totalYearsExperience).toBe(8)
      expect(result.skills).toEqual(['TypeScript', 'React', 'Node.js'])
      expect(result.certifications).toEqual(['AWS Solutions Architect'])
      expect(result.previousCompanies).toEqual(['StartupX', 'BigCo'])
    })

    it('parses a response wrapped in ```json fences', async () => {
      const fenced = `\`\`\`json\n${VALID_CV_JSON}\n\`\`\``
      const parser = new CvStructuredParser(makeFakeLlm(fenced))
      const result = await parser.parse('some raw cv text')

      expect(result.name).toBe('Jane Doe')
      expect(result.skills).toEqual(['TypeScript', 'React', 'Node.js'])
    })

    it('parses a response wrapped in plain ``` fences', async () => {
      const fenced = `\`\`\`\n${VALID_CV_JSON}\n\`\`\``
      const parser = new CvStructuredParser(makeFakeLlm(fenced))
      const result = await parser.parse('some raw cv text')

      expect(result.name).toBe('Jane Doe')
    })

    it('defaults array fields to [] when omitted from response', async () => {
      const minimal = JSON.stringify({ name: 'Bob Smith' })
      const parser = new CvStructuredParser(makeFakeLlm(minimal))
      const result = await parser.parse('short cv')

      expect(result.name).toBe('Bob Smith')
      expect(result.skills).toEqual([])
      expect(result.certifications).toEqual([])
      expect(result.previousCompanies).toEqual([])
    })
  })

  describe('invalid LLM response', () => {
    it('throws a clear error when LLM returns non-JSON garbage', async () => {
      const parser = new CvStructuredParser(makeFakeLlm('Sorry, I cannot process this.'))

      await expect(parser.parse('some text')).rejects.toThrow(/invalid JSON/i)
    })

    it('throws a clear error when LLM returns JSON failing schema validation', async () => {
      // email in wrong format fails parsedCvSchema
      const badJson = JSON.stringify({ email: 'not-an-email' })
      const parser = new CvStructuredParser(makeFakeLlm(badJson))

      await expect(parser.parse('some text')).rejects.toThrow(/schema validation/i)
    })
  })
})
