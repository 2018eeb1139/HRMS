import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common'
import { GoogleCalendarAdapter } from './google-calendar.adapter'

const originalGoogleConfig = {
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
  calendarId: process.env.GOOGLE_CALENDAR_ID,
}

const fetchMock = vi.fn()

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

describe('GoogleCalendarAdapter', () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'test-client-id'
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret'
    process.env.GOOGLE_REFRESH_TOKEN = 'test-refresh-token'
    delete process.env.GOOGLE_CALENDAR_ID
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    restoreEnv('GOOGLE_CLIENT_ID', originalGoogleConfig.clientId)
    restoreEnv('GOOGLE_CLIENT_SECRET', originalGoogleConfig.clientSecret)
    restoreEnv('GOOGLE_REFRESH_TOKEN', originalGoogleConfig.refreshToken)
    restoreEnv('GOOGLE_CALENDAR_ID', originalGoogleConfig.calendarId)
  })

  it('uploads and shares the candidate CV before creating an event with the Drive attachment', async () => {
    const prisma = {
      user: { findMany: vi.fn() },
    }
    const adapter = new GoogleCalendarAdapter(prisma as never)
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'access-token' }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'drive-file-1',
          name: 'resume.pdf',
          mimeType: 'application/pdf',
          webViewLink: 'https://drive.google.com/file/d/drive-file-1/view',
          owners: [{ emailAddress: 'jane@example.com' }],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ id: 'interviewer-permission' }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'calendar-event-1',
          conferenceData: {
            entryPoints: [
              { entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' },
            ],
          },
        }),
      )

    const result = await adapter.createEvent({
      summary: 'Senior Engineer interview — Jane Smith',
      description: 'Interview details',
      start: new Date('2026-07-01T09:00:00Z'),
      durationMin: 60,
      attendees: ['jane@example.com', 'interviewer@example.com'],
      attachments: [
        {
          fileName: 'resume.pdf',
          mimeType: 'application/pdf',
          content: Buffer.from('candidate CV bytes'),
        },
      ],
      icsUid: 'event-request-1',
    })

    expect(result).toEqual({
      eventId: 'calendar-event-1',
      meetingLink: 'https://meet.google.com/abc-defg-hij',
    })
    expect(fetchMock).toHaveBeenCalledTimes(4)

    const uploadCall = fetchMock.mock.calls[1]
    expect(uploadCall[0]).toContain('/upload/drive/v3/files')
    expect(uploadCall[0]).toContain('owners(emailAddress)')
    expect((uploadCall[1].body as Buffer).toString()).toContain('candidate CV bytes')

    const permissionBodies = fetchMock.mock.calls.slice(2, 3).map((call) =>
      JSON.parse(call[1].body as string),
    )
    expect(permissionBodies).toEqual([
      { type: 'user', role: 'reader', emailAddress: 'interviewer@example.com' },
    ])

    const eventCall = fetchMock.mock.calls[3]
    expect(eventCall[0]).toContain('supportsAttachments=true')
    expect(eventCall[0]).toContain('sendUpdates=all')
    const eventBody = JSON.parse(eventCall[1].body as string)
    expect(eventBody.attachments).toEqual([
      {
        fileUrl: 'https://drive.google.com/file/d/drive-file-1/view',
        title: 'resume.pdf',
        mimeType: 'application/pdf',
      },
    ])
    expect(eventBody.attendees).toEqual([
      { email: 'jane@example.com' },
      { email: 'interviewer@example.com' },
    ])
    expect(eventBody.conferenceData.createRequest.requestId).toBe('event-request-1')
  })

  it('checks interviewer calendars by email and returns combined busy intervals', async () => {
    const prisma = {
      user: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'user-1', email: 'one@example.com' },
          { id: 'user-2', email: 'two@example.com' },
        ]),
      },
    }
    const adapter = new GoogleCalendarAdapter(prisma as never)
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'access-token' }))
      .mockResolvedValueOnce(
        jsonResponse({
          calendars: {
            'one@example.com': {
              busy: [{ start: '2026-07-01T09:00:00Z', end: '2026-07-01T10:00:00Z' }],
            },
            'two@example.com': { busy: [] },
          },
        }),
      )

    const result = await adapter.freeBusy(
      ['user-1', 'user-2'],
      '2026-07-01T08:00:00Z',
      '2026-07-01T17:00:00Z',
    )

    expect(result).toEqual([
      { start: '2026-07-01T09:00:00Z', end: '2026-07-01T10:00:00Z' },
    ])
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string).items).toEqual([
      { id: 'one@example.com' },
      { id: 'two@example.com' },
    ])
  })

  it('rejects free/busy requests with unresolved interviewer IDs', async () => {
    const prisma = {
      user: { findMany: vi.fn().mockResolvedValue([]) },
    }
    const adapter = new GoogleCalendarAdapter(prisma as never)

    await expect(
      adapter.freeBusy(['missing-user'], '2026-07-01T08:00:00Z', '2026-07-01T17:00:00Z'),
    ).rejects.toThrow(BadRequestException)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('deletes uploaded Drive files if calendar event creation fails', async () => {
    const adapter = new GoogleCalendarAdapter({ user: { findMany: vi.fn() } } as never)
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'access-token' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'drive-file-1', name: 'resume.pdf' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'permission-1' }))
      .mockResolvedValueOnce(jsonResponse({ error: 'Calendar unavailable' }, 503))
      .mockResolvedValueOnce({ ok: true, status: 204 } as Response)

    await expect(
      adapter.createEvent({
        summary: 'Interview',
        start: new Date('2026-07-01T09:00:00Z'),
        durationMin: 60,
        attendees: ['jane@example.com'],
        attachments: [
          {
            fileName: 'resume.pdf',
            mimeType: 'application/pdf',
            content: Buffer.from('candidate CV bytes'),
          },
        ],
        icsUid: 'event-request-2',
      }),
    ).rejects.toThrow(ServiceUnavailableException)

    expect(fetchMock.mock.calls[4][0]).toContain('/drive/v3/files/drive-file-1')
    expect(fetchMock.mock.calls[4][1].method).toBe('DELETE')
  })

  it('cancels the event and sends attendee updates', async () => {
    const adapter = new GoogleCalendarAdapter({ user: { findMany: vi.fn() } } as never)
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'access-token' }))
      .mockResolvedValueOnce({ ok: true, status: 204 } as Response)

    await adapter.cancelEvent('event/with-slash')

    expect(fetchMock.mock.calls[1][0]).toContain('/events/event%2Fwith-slash?sendUpdates=all')
    expect(fetchMock.mock.calls[1][1].method).toBe('DELETE')
  })

  it('requires the shared-account OAuth refresh token configuration', async () => {
    delete process.env.GOOGLE_REFRESH_TOKEN
    const adapter = new GoogleCalendarAdapter({ user: { findMany: vi.fn() } } as never)

    await expect(
      adapter.createEvent({
        summary: 'Interview',
        start: new Date('2026-07-01T09:00:00Z'),
        durationMin: 60,
        attendees: [],
        icsUid: 'event-request-3',
      }),
    ).rejects.toThrow(ServiceUnavailableException)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
