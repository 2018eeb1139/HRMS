export const CALENDAR = Symbol('CALENDAR')

export interface CalendarPort {
  freeBusy(
    userIds: string[],
    fromISO: string,
    toISO: string,
  ): Promise<{ start: string; end: string }[]>

  createEvent(e: {
    summary: string
    description?: string
    start: Date
    durationMin: number
    attendees: string[]
    attachments?: {
      fileName: string
      mimeType: string
      content: Buffer
    }[]
    icsUid: string
  }): Promise<{ eventId: string; meetingLink?: string }>

  cancelEvent(eventId: string): Promise<void>
}
