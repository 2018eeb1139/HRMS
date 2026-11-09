import { Injectable } from '@nestjs/common'
import type { CalendarPort } from './calendar.port'

/**
 * Fake (no-op) CalendarPort — default provider in InterviewsModule.
 * The real GoogleCalendarAdapter replaces it via DI injection in the next task
 * once Google OAuth credentials are available.
 */
@Injectable()
export class FakeCalendar implements CalendarPort {
  async freeBusy(
    _userIds: string[],
    _fromISO: string,
    _toISO: string,
  ): Promise<{ start: string; end: string }[]> {
    // All free by default — no busy intervals
    return []
  }

  async createEvent(e: {
    summary: string
    description?: string
    start: Date
    durationMin: number
    attendees: string[]
    icsUid: string
  }): Promise<{ eventId: string; meetingLink?: string }> {
    return { eventId: `fake-${e.icsUid}` }
  }

  async cancelEvent(_eventId: string): Promise<void> {
    // no-op
  }
}
