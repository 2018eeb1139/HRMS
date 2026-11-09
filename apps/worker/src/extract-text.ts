import pdfParse from 'pdf-parse'
import mammoth from 'mammoth'

export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType.includes('pdf')) {
    const data = await pdfParse(buffer)
    return data.text
  }
  if (
    mimeType.includes('word') ||
    mimeType.includes('officedocument') ||
    mimeType.includes('docx')
  ) {
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }
  throw new Error('Unsupported CV type: ' + mimeType)
}
