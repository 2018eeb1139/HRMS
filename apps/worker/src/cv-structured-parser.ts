import { parsedCvSchema, type ParsedCv } from '@picode-hr/shared'

export interface LlmPort {
  complete(args: {
    system?: string
    user: string
    maxTokens?: number
    model?: string
  }): Promise<string>
}

const SYSTEM_PROMPT = `You are a CV/resume parser. Extract structured information from the provided CV text.
Return ONLY a valid JSON object — no markdown, no fences, no explanation.
Use this exact shape (omit fields you cannot find; arrays may be empty):
{
  "name": string,
  "email": string,
  "phone": string,
  "location": string,
  "currentTitle": string,
  "currentEmployer": string,
  "totalYearsExperience": number,
  "education": string,
  "skills": string[],
  "certifications": string[],
  "previousCompanies": string[],
  "noticePeriod": string,
  "salaryDetails": string
}`

function stripFences(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()
}

export class CvStructuredParser {
  constructor(private readonly llm: LlmPort) {}

  async parse(rawText: string): Promise<ParsedCv> {
    const response = await this.llm.complete({
      system: SYSTEM_PROMPT,
      user: `Parse the following CV and return structured JSON:\n\n${rawText}`,
      maxTokens: 1024,
    })

    const cleaned = stripFences(response)

    let parsed: unknown
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      throw new Error(`CvStructuredParser: LLM returned invalid JSON: ${cleaned.slice(0, 200)}`)
    }

    const result = parsedCvSchema.safeParse(parsed)
    if (!result.success) {
      throw new Error(
        `CvStructuredParser: parsed JSON failed schema validation: ${result.error.message}`,
      )
    }

    return result.data
  }
}
