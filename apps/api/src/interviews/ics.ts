/**
 * RFC 5545 VCALENDAR / VEVENT generator.
 * Deterministic given inputs — DTSTAMP uses the event start time so tests can snapshot it.
 */

function formatUtc(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const y = date.getUTCFullYear()
  const mo = pad(date.getUTCMonth() + 1)
  const d = pad(date.getUTCDate())
  const h = pad(date.getUTCHours())
  const mi = pad(date.getUTCMinutes())
  const s = pad(date.getUTCSeconds())
  return `${y}${mo}${d}T${h}${mi}${s}Z`
}

export interface IcsEvent {
  uid: string
  start: Date
  durationMin: number
  summary: string
  description?: string
  location?: string
  organizerEmail?: string
  attendees?: string[]
}

export function generateIcs(e: IcsEvent): string {
  const dtStart = formatUtc(e.start)
  const endMs = e.start.getTime() + e.durationMin * 60 * 1000
  const dtEnd = formatUtc(new Date(endMs))
  // Use event start as DTSTAMP for determinism (avoids wall-clock calls in tests)
  const dtStamp = dtStart

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Picode HR//Interview Scheduler//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${e.summary}`,
  ]

  if (e.description) {
    lines.push(`DESCRIPTION:${e.description.replace(/\n/g, '\\n')}`)
  }

  if (e.location) {
    lines.push(`LOCATION:${e.location}`)
  }

  if (e.organizerEmail) {
    lines.push(`ORGANIZER:mailto:${e.organizerEmail}`)
  }

  for (const attendee of e.attendees ?? []) {
    lines.push(`ATTENDEE:mailto:${attendee}`)
  }

  lines.push('STATUS:CONFIRMED')
  lines.push('END:VEVENT')
  lines.push('END:VCALENDAR')

  return lines.join('\r\n')
}
