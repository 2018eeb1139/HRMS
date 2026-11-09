import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { resolve } from 'node:path'
import PDFDocument from 'pdfkit'
import mammoth from 'mammoth'

const COMPANY_LOGO_PATH = resolve(__dirname, '../../assets/picodesolutions_logo.jpg')
const OFFER_TEMPLATE_PATH = resolve(__dirname, '../../assets/employment-agreement-template.docx')
const BODY_FONT_PATH = resolve(
  __dirname,
  '../../node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf',
)
const BOLD_FONT_PATH = resolve(
  __dirname,
  '../../node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf',
)
const COMPENSATION_TABLE_MARKER = '__OFFER_COMPENSATION_TABLE__'
const COMPANY_NAME = 'PICODE SYSTEMS PRIVATE LTD'

export interface OfferLetterInput {
  candidateName: string
  candidateEmail: string
  candidatePhone: string
  candidateAddress: string
  roleTitle: string
  annualCtc: string
  offerDate: Date
  joiningDate: Date
  noticePeriod: string
}

export interface CompensationComponent {
  name: string
  monthly: number
  annual: number
}

export function calculateCompensation(annualCtc: number): CompensationComponent[] {
  if (!Number.isFinite(annualCtc) || annualCtc <= 0) {
    throw new InternalServerErrorException('Offer salary must be a positive amount')
  }

  const annualGross = annualCtc / 1.1
  const annualBonus = annualCtc - annualGross
  const monthlyGross = annualGross / 12
  const basic = monthlyGross * 0.5
  const hra = basic * 0.5
  const conveyance = 3342
  const medical = 2611
  const special = monthlyGross - basic - hra - conveyance - medical

  return [
    { name: 'Annual CTC', monthly: annualCtc / 12, annual: annualCtc },
    { name: 'Annual Bonus (10%)', monthly: annualBonus / 12, annual: annualBonus },
    { name: 'Annual Gross', monthly: monthlyGross, annual: annualGross },
    { name: 'Basic Allowance', monthly: basic, annual: basic * 12 },
    { name: 'HRA Allowance', monthly: hra, annual: hra * 12 },
    { name: 'Conveyance Allowance', monthly: conveyance, annual: conveyance * 12 },
    { name: 'Medical Allowance', monthly: medical, annual: medical * 12 },
    { name: 'Special Allowance', monthly: special, annual: special * 12 },
    { name: 'Monthly Gross', monthly: monthlyGross, annual: annualGross },
    { name: 'Professional Tax (deduction)', monthly: -200, annual: -2400 },
  ]
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(value)
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 2,
  }).format(value)
}

export function fillOfferTemplate(template: string, input: OfferLetterInput): string {
  const employeeName = input.candidateName.trim()
  // Keep this sequence aligned with the starred placeholders in the bundled DOCX.
  const replacements = [
    formatDate(input.offerDate),
    formatDate(input.joiningDate),
    employeeName,
    input.candidateAddress.trim(),
    input.roleTitle.trim(),
    formatDate(input.joiningDate),
    employeeName,
    employeeName,
    input.candidatePhone.trim(),
    input.candidateEmail.trim(),
    input.roleTitle.trim(),
    employeeName,
    employeeName,
  ]
  let replacementIndex = 0

  const filled = template
    .replace(/\*{3,}/g, () => {
      const value = replacements[replacementIndex]
      if (value === undefined) {
        throw new InternalServerErrorException(
          'Offer template contains more placeholders than expected',
        )
      }
      replacementIndex += 1
      return value
    })
    .replace(
      '[DOR + 1 Year]',
      'one year after the Employee’s date of relieving',
    )
    .replace(
      'Your Notice period would be of 30 days',
      `Your Notice period would be of ${input.noticePeriod.trim()}`,
    )

  if (replacementIndex !== replacements.length || /\*{3,}/.test(filled)) {
    throw new InternalServerErrorException(
      'Offer template placeholders do not match the expected contract fields',
    )
  }

  return filled
}

function replaceCompensationRows(lines: string[]): string[] {
  const start = lines.findIndex((line) => line.trim() === 'Remuneration')
  const end = lines.findIndex(
    (line, index) => index > start && line.trim() === 'Gross Salary',
  )

  if (start < 0 || end < 0) {
    throw new InternalServerErrorException(
      'Offer template is missing its remuneration section',
    )
  }

  return [
    ...lines.slice(0, start),
    COMPENSATION_TABLE_MARKER,
    ...lines.slice(end + 1),
  ]
}

@Injectable()
export class OfferLetterPdfService {
  async render(input: OfferLetterInput): Promise<Buffer> {
    const { value: template } = await mammoth.extractRawText({
      path: OFFER_TEMPLATE_PATH,
    })
    const text = fillOfferTemplate(template, input)
    const paragraphs = replaceCompensationRows(
      text
        .split(/\r?\n/)
        .map(normalizeParagraph)
        .filter(Boolean),
    )

    return new Promise((resolveBuffer, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 88, bottom: 56, left: 52, right: 52 },
        bufferPages: true,
        info: {
          Title: `${input.candidateName} — Employment Agreement`,
          Author: 'PiCode Systems',
        },
      })
      const chunks: Buffer[] = []
      doc.on('data', (chunk: Buffer) => chunks.push(chunk))
      doc.on('end', () => resolveBuffer(Buffer.concat(chunks)))
      doc.on('error', reject)
      doc.registerFont('OfferBody', BODY_FONT_PATH)
      doc.registerFont('OfferBold', BOLD_FONT_PATH)

      const addPageBackground = () => {
        doc.page.write(
          `q\n0.75686 0.89412 0.96078 rg\n0 0 ${doc.page.width} ${doc.page.height} re\nf\nQ\n`,
        )
      }
      doc.on('pageAdded', addPageBackground)
      addPageBackground()

      for (const paragraph of paragraphs) {
        doc.x = doc.page.margins.left
        if (paragraph === COMPENSATION_TABLE_MARKER) {
          drawCompensationTable(doc, input.annualCtc)
          continue
        }

        if (paragraph === 'EMPLOYMENT AGREEMENT') {
          doc
            .font('OfferBold')
            .fontSize(16)
            .fillColor('#0f172a')
            .text(
              paragraph,
              doc.page.margins.left,
              doc.y,
              {
              width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
              align: 'center',
              },
            )
          doc.moveDown(0.7)
          continue
        }

        if (isHeading(paragraph)) {
          doc
            .font('OfferBold')
            .fontSize(12)
            .fillColor('#0f172a')
            .text(
              paragraph,
              doc.page.margins.left,
              doc.y,
              {
              width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
              align: 'center',
              lineGap: 2,
              },
            )
          doc.moveDown(0.25)
          continue
        }

        doc
          .font('OfferBody')
          .fontSize(9)
          .fillColor('#0f172a')
          .text(
            paragraph,
            doc.page.margins.left,
            doc.y,
            {
            width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
            lineGap: 2,
            paragraphGap: 3,
            },
          )
      }

      const pageRange = doc.bufferedPageRange()
      for (
        let pageIndex = pageRange.start;
        pageIndex < pageRange.start + pageRange.count;
        pageIndex++
      ) {
        doc.switchToPage(pageIndex)
        const centerX = doc.page.width / 2
        const centerY = doc.page.height / 2

        doc.image(COMPANY_LOGO_PATH, centerX - 16, 12, {
          fit: [32, 32],
        })
        doc
          .font('OfferBold')
          .fontSize(9)
          .fillColor('#0f172a')
          .text(COMPANY_NAME, doc.page.margins.left, 50, {
            width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
            align: 'center',
            lineBreak: false,
          })

        doc.save()

        doc
          .font('OfferBody')
          .fontSize(42)
          .fillColor('#FFFFFF')
          .fillOpacity(0.45)
        doc.rotate(-35, { origin: [centerX, centerY] })
        doc.text('PiCode Systems Private Ltd', 0, centerY, {
          width: doc.page.width,
          align: 'center',
          lineBreak: false,
        })
        doc.restore()
      }

      doc.end()
    })
  }
}

function isHeading(paragraph: string): boolean {
  const heading = paragraph.replace(/^\d+(?:\.\d+)*\.?\s*/, '').trim()

  return (
    /^ANNEXURE\b/i.test(heading) ||
    /^DISCLOSURE AGREEMENT\b/i.test(heading) ||
    heading === 'EMPLOYEE DETAILS' ||
    (/^[A-Z0-9\s/&()"'’–—.-]+$/.test(heading) && /[A-Z]/.test(heading))
  )
}

function normalizeParagraph(paragraph: string): string {
  return paragraph
    .replace(/\u2122/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\t/g, ' ')
    .trim()
    .replace(/ {2,}/g, ' ')
    .replace(/^(\d+(?:\.\d+)+)(?=[A-Za-z])/g, '$1 ')
}

function drawCompensationTable(doc: PDFKit.PDFDocument, annualCtc: string): void {
  const rows = calculateCompensation(Number(annualCtc))
  const rowHeight = 21
  const tableHeight = rowHeight * (rows.length + 1) + 32
  const pageBottom = doc.page.height - doc.page.margins.bottom

  if (doc.y + tableHeight > pageBottom) doc.addPage()

  const left = doc.page.margins.left
  const monthlyX = left + 240
  const annualX = left + 355
  const tableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
  let y = doc.y + 4

  doc.font('OfferBold').fontSize(8).fillColor('#0f172a')
  doc.text('Compensation Component', left, y, { width: 230 })
  doc.text('Monthly', monthlyX, y, { width: 108, align: 'right' })
  doc.text('Annual', annualX, y, { width: 115, align: 'right' })
  y += rowHeight
  doc
    .moveTo(left, y - 4)
    .lineTo(left + tableWidth, y - 4)
    .strokeColor('#64748b')
    .lineWidth(0.6)
    .stroke()

  for (const row of rows) {
    const isTotal = row.name === 'Annual CTC' || row.name === 'Monthly Gross'
    doc
      .font(isTotal ? 'OfferBold' : 'OfferBody')
      .fontSize(8)
      .fillColor('#0f172a')
    doc.text(row.name, left, y, { width: 230 })
    doc.text(`INR ${formatAmount(row.monthly)}`, monthlyX, y, { width: 108, align: 'right' })
    doc.text(`INR ${formatAmount(row.annual)}`, annualX, y, { width: 115, align: 'right' })
    y += rowHeight
  }

  doc.y = y + 3
  doc
    .font('OfferBody')
    .fontSize(8)
    .fillColor('#334155')
    .text(
      'Annual bonus is 10% of annual gross. Monthly gross is divided into the allowances above; professional tax is shown as a monthly deduction.',
      left,
      doc.y,
      {
        width: tableWidth,
        lineGap: 1,
      },
    )
  doc.moveDown(0.6)
  doc.x = doc.page.margins.left
}
