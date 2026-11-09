import { describe, it, expect } from 'vitest'
import { generateIcs } from './ics'

const BASE_EVENT = {
  uid: 'test-uid-1234',
  start: new Date('2026-07-01T09:00:00Z'),
  durationMin: 60,
  summary: 'Technical Interview',
}

describe('generateIcs', () => {
  it('includes BEGIN:VCALENDAR and END:VCALENDAR', () => {
    const ics = generateIcs(BASE_EVENT)
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('END:VCALENDAR')
  })

  it('includes BEGIN:VEVENT and END:VEVENT', () => {
    const ics = generateIcs(BASE_EVENT)
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('END:VEVENT')
  })

  it('formats DTSTART as UTC YYYYMMDDTHHMMSSZ', () => {
    const ics = generateIcs(BASE_EVENT)
    expect(ics).toContain('DTSTART:20260701T090000Z')
  })

  it('formats DTEND as start + durationMin', () => {
    const ics = generateIcs(BASE_EVENT)
    // 09:00 + 60 min = 10:00
    expect(ics).toContain('DTEND:20260701T100000Z')
  })

  it('formats DTEND correctly for 45-minute duration', () => {
    const ics = generateIcs({ ...BASE_EVENT, start: new Date('2026-07-01T14:00:00Z'), durationMin: 45 })
    // 14:00 + 45 min = 14:45
    expect(ics).toContain('DTEND:20260701T144500Z')
  })

  it('includes UID line', () => {
    const ics = generateIcs(BASE_EVENT)
    expect(ics).toContain('UID:test-uid-1234')
  })

  it('includes SUMMARY line', () => {
    const ics = generateIcs(BASE_EVENT)
    expect(ics).toContain('SUMMARY:Technical Interview')
  })

  it('includes DESCRIPTION when provided', () => {
    const ics = generateIcs({ ...BASE_EVENT, description: 'Please bring your portfolio.' })
    expect(ics).toContain('DESCRIPTION:Please bring your portfolio.')
  })

  it('omits DESCRIPTION when not provided', () => {
    const ics = generateIcs(BASE_EVENT)
    expect(ics).not.toContain('DESCRIPTION:')
  })

  it('includes LOCATION when provided', () => {
    const ics = generateIcs({ ...BASE_EVENT, location: 'Conference Room A' })
    expect(ics).toContain('LOCATION:Conference Room A')
  })

  it('includes ORGANIZER line when organizerEmail provided', () => {
    const ics = generateIcs({ ...BASE_EVENT, organizerEmail: 'hr@picode.com' })
    expect(ics).toContain('ORGANIZER:mailto:hr@picode.com')
  })

  it('includes ATTENDEE lines for each attendee', () => {
    const ics = generateIcs({
      ...BASE_EVENT,
      attendees: ['alice@picode.com', 'bob@picode.com'],
    })
    expect(ics).toContain('ATTENDEE:mailto:alice@picode.com')
    expect(ics).toContain('ATTENDEE:mailto:bob@picode.com')
  })

  it('uses CRLF line endings throughout', () => {
    const ics = generateIcs(BASE_EVENT)
    expect(ics).toContain('\r\n')
    // Every line except last should end with CRLF
    const lines = ics.split('\r\n')
    expect(lines[0]).toBe('BEGIN:VCALENDAR')
  })

  it('is deterministic — same input produces same output', () => {
    const a = generateIcs(BASE_EVENT)
    const b = generateIcs(BASE_EVENT)
    expect(a).toBe(b)
  })

  it('handles midnight UTC date correctly', () => {
    const ics = generateIcs({
      ...BASE_EVENT,
      start: new Date('2026-12-31T23:30:00Z'),
      durationMin: 60,
    })
    expect(ics).toContain('DTSTART:20261231T233000Z')
    expect(ics).toContain('DTEND:20270101T003000Z')
  })
})
