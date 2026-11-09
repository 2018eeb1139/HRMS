import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { resolve } from 'node:path'
import PDFDocument from 'pdfkit'

const COMPANY_LOGO_PATH = resolve(__dirname, '../../assets/picodesolutions_logo.jpg')
const BODY_FONT_PATH = resolve(
  __dirname,
  '../../node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf',
)
const BOLD_FONT_PATH = resolve(
  __dirname,
  '../../node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf',
)
const COMPANY_NAME = 'PICODE SYSTEMS PRIVATE LTD'
const COMPANY_LEGAL_NAME = 'PiCode Systems Private Limited'

export interface RelievingLetterInput {
  candidateName: string
  employeeId: string
  designation: string
  department: string
  joiningDate: Date
  lastWorkingDate: Date
  hrName: string
  hrTitle: string
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(value)
}

function addYears(value: Date, years: number): Date {
  const result = new Date(value)
  result.setUTCFullYear(result.getUTCFullYear() + years)
  return result
}

@Injectable()
export class RelievingLetterPdfService {
  render(input: RelievingLetterInput): Promise<Buffer> {
    const employeeName = input.candidateName.trim()
    const relievingDate = formatDate(input.lastWorkingDate)
    const paragraphs = [
      'To,',
      employeeName,
      'Subject: Relieving cum Experience Letter',
      `This is to certify that ${employeeName} was employed with ${COMPANY_LEGAL_NAME} as per the particulars set out below, and has been duly relieved from the services of the Company.`,
      '1. Employment Particulars',
    ]

    return new Promise((resolveBuffer, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 94, bottom: 60, left: 52, right: 52 },
        bufferPages: true,
        info: {
          Title: `${employeeName} — Relieving cum Experience Letter`,
          Author: COMPANY_LEGAL_NAME,
        },
      })
      const chunks: Buffer[] = []
      doc.on('data', (chunk: Buffer) => chunks.push(chunk))
      doc.on('end', () => resolveBuffer(Buffer.concat(chunks)))
      doc.on('error', reject)
      doc.registerFont('LetterBody', BODY_FONT_PATH)
      doc.registerFont('LetterBold', BOLD_FONT_PATH)
      const addPageBackground = () => {
        doc.page.write(
          `q\n0.75686 0.89412 0.96078 rg\n0 0 ${doc.page.width} ${doc.page.height} re\nf\nQ\n`,
        )
      }
      doc.on('pageAdded', addPageBackground)
      addPageBackground()

      doc.font('LetterBold').fontSize(15).fillColor('#0f172a')
        .text('RELIEVING CUM EXPERIENCE LETTER', { align: 'center' })
      doc.moveDown(0.7)
      doc.font('LetterBody').fontSize(10).fillColor('#0f172a')
        .text(`Date: ${formatDate(new Date())}`)
      doc.moveDown(0.7)
      doc.font('LetterBold').fontSize(10).text(paragraphs[0])
      doc.moveDown(0.25)
      doc.font('LetterBold').fontSize(10).text(paragraphs[1])
      doc.moveDown(0.55)
      doc.font('LetterBold').fontSize(10).text(paragraphs[2])
      doc.moveDown(0.55)
      doc.font('LetterBody').fontSize(9.5).text(paragraphs[3], { lineGap: 3 })
      doc.moveDown(0.7)

      this.drawSectionHeading(doc, paragraphs[4])
      this.drawEmploymentParticulars(doc, input)

      this.drawSectionHeading(doc, '2. Nature of Engagement & Conduct')
      doc.font('LetterBody').fontSize(9.5).text(
        `During the tenure of employment, ${employeeName} worked as ${input.designation} and diligently fulfilled the responsibilities entrusted to the employee. The employee was an integral member of the team and made valuable contributions to the organisation’s objectives throughout the period of employment.`,
        { lineGap: 3, paragraphGap: 3 },
      )
      doc.moveDown(0.5)

      this.drawSectionHeading(doc, '3. Relieving & Handover')
      doc.font('LetterBody').fontSize(9.5).text(
        `The employee has been relieved from the services of the Company effective from the close of business on ${relievingDate}, having completed the required handover formalities and returned all Company assets and documents in accordance with Company policy.`,
        { lineGap: 3 },
      )
      doc.moveDown(0.5)

      this.drawSectionHeading(doc, '4. Confidentiality & Non-Disclosure Obligation')
      doc.font('LetterBody').fontSize(9.2).text(
        `The employee acknowledges that, during the course of employment, the employee had access to confidential and proprietary information belonging to the Company, including but not limited to business plans, client data, source code, trade secrets, financial information, and other sensitive organisational information (“Confidential Information”). The employee agrees to keep all such Confidential Information strictly confidential and not to disclose, share, publish, or use it for any purpose, for a period of one (1) year from the date of relieving, i.e., up to ${formatDate(addYears(input.lastWorkingDate, 1))}.`,
        { lineGap: 2.5 },
      )
      doc.moveDown(0.4)
      doc.font('LetterBody').fontSize(9.2).text(
        'In the event of any breach of this confidentiality and non-disclosure obligation — including but not limited to the unauthorised disclosure, sharing, publication, or use of any Confidential Information — resulting in loss, harm, or damage to the Company, whether such damage is financial, operational, or reputational in nature, the employee shall be held personally liable and responsible for such breach. The Company shall be entitled to pursue all remedies available to it under applicable law, including recovery of monetary damages, compensation for loss of business or reputation, and injunctive relief, as may be warranted by the nature and extent of the breach.',
        { lineGap: 2.5 },
      )
      doc.moveDown(0.4)
      doc.font('LetterBody').fontSize(9.2).text(
        'This clause shall survive the relieving of the employee from the Company and shall remain binding for the duration specified above, irrespective of the reason for separation.',
        { lineGap: 2.5 },
      )
      doc.moveDown(0.5)

      this.drawSectionHeading(doc, '5. Closing Remarks')
      doc.font('LetterBody').fontSize(9.5).text(
        'We appreciate the contributions made during the period of association with the organisation and wish the employee continued success in all future endeavours.',
        { lineGap: 3 },
      )
      doc.moveDown(0.8)
      doc.font('LetterBody').fontSize(9.5).text('Sincerely,')
      doc.moveDown(0.35)
      doc.font('LetterBold').fontSize(9.5).text(`For ${COMPANY_LEGAL_NAME}`)
      doc.moveDown(1.6)
      doc.font('LetterBold').fontSize(9.5).text(input.hrName)
      doc.font('LetterBody').fontSize(9.5).text(input.hrTitle)
      doc.text(COMPANY_LEGAL_NAME)
      doc.text(`Date: ${formatDate(new Date())}`)
      doc.moveDown(0.8)
      doc.font('LetterBold').fontSize(9.5).text('Acknowledged & Agreed by Employee')
      doc.moveDown(0.8)
      doc.font('LetterBold').fontSize(9.5).text(employeeName)
      doc.font('LetterBody').fontSize(9.5).text('Employee')
      doc.text('Date: __________________')

      this.addBrandedPageHeaders(doc)
      doc.end()
    })
  }

  private drawSectionHeading(doc: PDFKit.PDFDocument, heading: string): void {
    doc.font('LetterBold').fontSize(10).fillColor('#0f172a')
      .text(heading, { lineGap: 2 })
    doc.moveDown(0.25)
  }

  private drawEmploymentParticulars(
    doc: PDFKit.PDFDocument,
    input: RelievingLetterInput,
  ): void {
    const rows = [
      ['Employee Name', input.candidateName],
      ['Employee ID', input.employeeId],
      ['Designation', input.designation],
      ['Department', input.department],
      ['Date of Joining', formatDate(input.joiningDate)],
      ['Last Working Date', formatDate(input.lastWorkingDate)],
    ]
    const left = doc.page.margins.left
    const tableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
    const labelWidth = 160
    const valueWidth = tableWidth - labelWidth
    const rowHeight = 24
    const tableHeight = rows.length * rowHeight
    if (doc.y + tableHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage()
    }

    let y = doc.y
    for (const [label, value] of rows) {
      doc.rect(left, y, labelWidth, rowHeight).strokeColor('#94a3b8').lineWidth(0.5).stroke()
      doc.rect(left + labelWidth, y, valueWidth, rowHeight).strokeColor('#94a3b8').lineWidth(0.5).stroke()
      doc.font('LetterBold').fontSize(8.5).fillColor('#0f172a')
        .text(label, left + 6, y + 7, { width: labelWidth - 12 })
      doc.font('LetterBody').fontSize(8.5).text(value, left + labelWidth + 6, y + 7, {
        width: valueWidth - 12,
      })
      y += rowHeight
    }
    doc.x = left
    doc.y = y + 10
  }

  private addBrandedPageHeaders(doc: PDFKit.PDFDocument): void {
    const pageRange = doc.bufferedPageRange()
    for (
      let pageIndex = pageRange.start;
      pageIndex < pageRange.start + pageRange.count;
      pageIndex++
    ) {
      doc.switchToPage(pageIndex)
      const centerX = doc.page.width / 2
      const centerY = doc.page.height / 2

      doc.image(COMPANY_LOGO_PATH, centerX - 16, 12, { fit: [32, 32] })
      doc.font('LetterBold').fontSize(9).fillColor('#0f172a')
        .text(COMPANY_NAME, doc.page.margins.left, 50, {
          width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
          align: 'center',
          lineBreak: false,
        })

      doc.save()
      doc.font('LetterBody').fontSize(42).fillColor('#FFFFFF').fillOpacity(0.45)
      doc.rotate(-35, { origin: [centerX, centerY] })
      doc.text('PiCode Systems Private Ltd', 0, centerY, {
        width: doc.page.width,
        align: 'center',
        lineBreak: false,
      })
      doc.restore()
    }
  }
}
