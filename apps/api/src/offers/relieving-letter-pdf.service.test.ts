import { describe, expect, it } from 'vitest'
import pdfParse from 'pdf-parse'
import {
  RelievingLetterPdfService,
  type RelievingLetterInput,
} from './relieving-letter-pdf.service'

const input: RelievingLetterInput = {
  candidateName: 'Alice Employee',
  employeeId: 'Not assigned',
  designation: 'Software Engineer',
  department: 'Engineering',
  joiningDate: new Date('2024-06-01T00:00:00.000Z'),
  lastWorkingDate: new Date('2026-12-01T00:00:00.000Z'),
  hrName: 'HR Person',
  hrTitle: 'HR Manager',
}

describe('RelievingLetterPdfService', () => {
  it('renders the relieving and experience letter as a branded PDF with filled particulars', async () => {
    const pdf = await new RelievingLetterPdfService().render(input)
    const { text } = await pdfParse(pdf)
    const normalizedText = text.replace(/\s+/g, ' ')

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(text).toContain('PICODE SYSTEMS PRIVATE LTD')
    expect(text).toContain('RELIEVING CUM EXPERIENCE LETTER')
    expect(text).toContain('Alice Employee')
    expect(text).toContain('Not assigned')
    expect(text).toContain('Software Engineer')
    expect(text).toContain('Engineering')
    expect(text).toContain('Date of Joining')
    expect(text).toContain('Last Working Date')
    expect(text).toContain('Confidentiality & Non-Disclosure Obligation')
    expect(normalizedText).toContain('diligently fulfilled the responsibilities entrusted')
    expect(text).toContain('HR Person')
    expect(text).not.toContain('*****')
    expect(text).not.toContain('******')
  })
})
