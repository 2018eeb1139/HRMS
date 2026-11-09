import { describe, expect, it } from 'vitest'
import pdfParse from 'pdf-parse'
import mammoth from 'mammoth'
import { resolve } from 'node:path'
import {
  fillOfferTemplate,
  calculateCompensation,
  OfferLetterPdfService,
  type OfferLetterInput,
} from './offer-letter-pdf.service'

const TEMPLATE_PATH = resolve(
  __dirname,
  '../../assets/employment-agreement-template.docx',
)

const input: OfferLetterInput = {
  candidateName: 'Alice Smith',
  candidateEmail: 'alice@example.com',
  candidatePhone: '+91 98765 43210',
  candidateAddress: '12 Example Street, Bengaluru, Karnataka',
  roleTitle: 'Senior Backend Engineer',
  annualCtc: '1200000',
  offerDate: new Date('2026-11-02T00:00:00.000Z'),
  joiningDate: new Date('2026-12-01T00:00:00.000Z'),
  noticePeriod: '30 days',
}

describe('OfferLetterPdfService', () => {
  it('calculates the annual and monthly compensation components from CTC', () => {
    const components = calculateCompensation(1_200_000)
    const byName = new Map(components.map((component) => [component.name, component]))

    expect(byName.get('Annual Gross')?.annual).toBeCloseTo(1_090_909.09, 2)
    expect(byName.get('Annual Bonus (10%)')?.annual).toBeCloseTo(109_090.91, 2)
    expect(byName.get('Basic Allowance')?.monthly).toBeCloseTo(45_454.55, 2)
    expect(byName.get('HRA Allowance')?.monthly).toBeCloseTo(22_727.27, 2)
    expect(byName.get('Conveyance Allowance')?.monthly).toBe(3342)
    expect(byName.get('Medical Allowance')?.monthly).toBe(2611)
    expect(byName.get('Special Allowance')?.monthly).toBeCloseTo(16_774.27, 2)
    expect(byName.get('Monthly Gross')?.annual).toBeCloseTo(1_090_909.09, 2)
    expect(byName.get('Professional Tax (deduction)')).toMatchObject({
      monthly: -200,
      annual: -2400,
    })
  })

  it('fills all personal and employment placeholders in the DOCX template', async () => {
    const { value: template } = await mammoth.extractRawText({
      path: TEMPLATE_PATH,
    })
    const filled = fillOfferTemplate(template, input)

    expect(filled).toContain('Alice Smith')
    expect(filled).toContain('alice@example.com')
    expect(filled).toContain('+91 98765 43210')
    expect(filled).toContain('12 Example Street, Bengaluru, Karnataka')
    expect(filled).toContain('Senior Backend Engineer')
    expect(filled).toContain('Your Notice period would be of 30 days')
    expect(filled).not.toMatch(/\*{3,}/)
    expect(filled).not.toContain('[DOR + 1 Year]')
  })

  it('renders the complete employment agreement as a branded PDF', async () => {
    const service = new OfferLetterPdfService()
    const pdf = await service.render(input)
    const { text } = await pdfParse(pdf)

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pdf.length).toBeGreaterThan(10000)
    expect(text).toContain('Alice Smith')
    expect(text).toContain('alice@example.com')
    expect(text).toContain('Senior Backend Engineer')
    expect(text).toContain('1.1 The Employer agrees to employ')
    expect(text).toContain('INR 12,00,000')
    expect(text).toContain('INR 1,00,000')
    expect(text).toContain('Annual Bonus (10%)')
    expect(text).toContain('Annual Gross')
    expect(text).toContain('Basic Allowance')
    expect(text).toContain('Special Allowance')
    expect(text).toContain('Professional Tax (deduction)')
    expect(text).not.toContain('*****')
    expect(text).not.toContain('™')
    expect(text).not.toContain('\u0000')
    expect(text).not.toMatch(/[†×Æ]/)
    expect(text.match(/PICODE SYSTEMS PRIVATE LTD/g)?.length).toBeGreaterThan(1)
  })
})
