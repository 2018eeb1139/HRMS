import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { CalendarPort } from './calendar.port'

type JsonRecord = Record<string, unknown>

interface DriveAttachment {
  fileName: string
  mimeType: string
  content: Buffer
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

@Injectable()
export class GoogleCalendarAdapter implements CalendarPort {
  private readonly logger = new Logger(GoogleCalendarAdapter.name)

  constructor(private readonly prisma: PrismaService) {}

  async freeBusy(
    userIds: string[],
    fromISO: string,
    toISO: string,
  ): Promise<{ start: string; end: string }[]> {
    if (userIds.length === 0) return []

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true },
    })
    if (users.length !== userIds.length) {
      throw new BadRequestException('One or more selected interviewers were not found')
    }

    const accessToken = await this.getAccessToken()
    const result = await this.requestJson(
      'https://www.googleapis.com/calendar/v3/freeBusy',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timeMin: fromISO,
          timeMax: toISO,
          items: users.map(({ email }) => ({ id: email })),
        }),
      },
      'Calendar availability',
    )

    if (!isRecord(result.calendars)) {
      throw new ServiceUnavailableException(
        'Google Calendar returned an invalid availability response',
      )
    }

    const busy: { start: string; end: string }[] = []
    for (const { email } of users) {
      const calendar = result.calendars[email]
      if (!isRecord(calendar) || !Array.isArray(calendar.busy)) {
        throw new ServiceUnavailableException(
          `Google Calendar returned invalid availability for ${email}`,
        )
      }
      if (Array.isArray(calendar.errors) && calendar.errors.length > 0) {
        throw new ServiceUnavailableException(
          `Unable to read Google Calendar availability for ${email}`,
        )
      }

      for (const interval of calendar.busy) {
        if (
          !isRecord(interval) ||
          typeof interval.start !== 'string' ||
          typeof interval.end !== 'string'
        ) {
          throw new ServiceUnavailableException(
            `Google Calendar returned an invalid busy interval for ${email}`,
          )
        }
        busy.push({ start: interval.start, end: interval.end })
      }
    }

    return busy
  }

  async createEvent(event: {
    summary: string
    description?: string
    start: Date
    durationMin: number
    attendees: string[]
    attachments?: DriveAttachment[]
    icsUid: string
  }): Promise<{ eventId: string; meetingLink?: string }> {
    const accessToken = await this.getAccessToken()
    const uploadedFileIds: string[] = []

    try {
      const attachments = []
      for (const attachment of event.attachments ?? []) {
        const driveFile = await this.uploadDriveFile(accessToken, attachment)
        uploadedFileIds.push(driveFile.id)

        const ownerEmail = driveFile.ownerEmail?.toLowerCase()
        for (const email of new Set(event.attendees.map((attendee) => attendee.trim().toLowerCase()))) {
          if (email === ownerEmail) continue
          await this.shareDriveFile(accessToken, driveFile.id, email)
        }

        attachments.push({
          fileUrl:
            driveFile.webViewLink ??
            `https://drive.google.com/open?id=${encodeURIComponent(driveFile.id)}`,
          title: driveFile.name ?? attachment.fileName,
          mimeType: driveFile.mimeType ?? attachment.mimeType,
        })
      }

      const end = new Date(event.start.getTime() + event.durationMin * 60_000)
      const calendarEvent = await this.requestJson(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events?supportsAttachments=true&sendUpdates=all&conferenceDataVersion=1`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            summary: event.summary,
            description: event.description,
            start: { dateTime: event.start.toISOString() },
            end: { dateTime: end.toISOString() },
            attendees: event.attendees.map((email) => ({ email })),
            attachments,
            conferenceData: {
              createRequest: {
                requestId: event.icsUid,
                conferenceSolutionKey: { type: 'hangoutsMeet' },
              },
            },
          }),
        },
        'Calendar event creation',
      )

      const eventId = getString(calendarEvent.id)
      if (!eventId) {
        throw new ServiceUnavailableException(
          'Google Calendar created an event but returned no event ID',
        )
      }

      let meetingLink: string | undefined
      if (isRecord(calendarEvent.conferenceData) && Array.isArray(calendarEvent.conferenceData.entryPoints)) {
        const videoEntry = calendarEvent.conferenceData.entryPoints.find(
          (entry): entry is JsonRecord =>
            isRecord(entry) && entry.entryPointType === 'video' && typeof entry.uri === 'string',
        )
        meetingLink = videoEntry ? getString(videoEntry.uri) : undefined
      }

      return { eventId, meetingLink }
    } catch (error) {
      for (const fileId of uploadedFileIds) {
        try {
          await this.deleteDriveFile(accessToken, fileId)
        } catch (cleanupError) {
          this.logger.warn(
            `Unable to remove temporary Drive attachment ${fileId}: ${String(cleanupError)}`,
          )
        }
      }
      throw error
    }
  }

  async cancelEvent(eventId: string): Promise<void> {
    const accessToken = await this.getAccessToken()
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    )
    if (!response.ok && response.status !== 404) {
      throw new ServiceUnavailableException(
        `Google Calendar event cancellation failed (${response.status})`,
      )
    }
  }

  private get calendarId(): string {
    return process.env.GOOGLE_CALENDAR_ID ?? 'primary'
  }

  private async getAccessToken(): Promise<string> {
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN
    if (!clientId || !clientSecret || !refreshToken) {
      throw new ServiceUnavailableException(
        'Google Calendar is not configured; set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN',
      )
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Google OAuth token refresh failed (${response.status})`,
      )
    }

    const tokenResponse: unknown = await response.json()
    const accessToken = isRecord(tokenResponse)
      ? getString(tokenResponse.access_token)
      : undefined
    if (!accessToken) {
      throw new ServiceUnavailableException(
        'Google OAuth returned no access token',
      )
    }
    return accessToken
  }

  private async requestJson(
    url: string,
    init: RequestInit,
    operation: string,
  ): Promise<JsonRecord> {
    const response = await fetch(url, init)
    if (!response.ok) {
      let detail = ''
      try {
        const payload: unknown = await response.json()
        if (isRecord(payload) && isRecord(payload.error)) {
          detail = getString(payload.error.message) ?? ''
        }
      } catch {
        // Keep the HTTP status as the actionable fallback when Google returns no JSON.
      }
      throw new ServiceUnavailableException(
        `Google ${operation} request failed (${response.status})${detail ? `: ${detail}` : ''}`,
      )
    }

    const payload: unknown = await response.json()
    if (!isRecord(payload)) {
      throw new ServiceUnavailableException(
        `Google ${operation} returned an invalid response`,
      )
    }
    return payload
  }

  private async uploadDriveFile(
    accessToken: string,
    attachment: DriveAttachment,
  ): Promise<{
    id: string
    name?: string
    mimeType?: string
    webViewLink?: string
    ownerEmail?: string
  }> {
    const boundary = `picode-${crypto.randomUUID()}`
    const metadata = JSON.stringify({
      name: attachment.fileName,
      mimeType: attachment.mimeType,
    })
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${attachment.mimeType}\r\n\r\n`,
      ),
      attachment.content,
      Buffer.from(`\r\n--${boundary}--`),
    ])
    const result = await this.requestJson(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,owners(emailAddress)',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      },
      'Drive CV upload',
    )
    const id = getString(result.id)
    if (!id) {
      throw new ServiceUnavailableException(
        'Google Drive uploaded the CV but returned no file ID',
      )
    }
    return {
      id,
      name: getString(result.name),
      mimeType: getString(result.mimeType),
      webViewLink: getString(result.webViewLink),
      ownerEmail:
        Array.isArray(result.owners) && isRecord(result.owners[0])
          ? getString(result.owners[0].emailAddress)
          : undefined,
    }
  }

  private async shareDriveFile(
    accessToken: string,
    fileId: string,
    email: string,
  ): Promise<void> {
    await this.requestJson(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=false`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'user',
          role: 'reader',
          emailAddress: email,
        }),
      },
      'Drive attachment sharing',
    )
  }

  private async deleteDriveFile(accessToken: string, fileId: string): Promise<void> {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    )
    if (!response.ok && response.status !== 404) {
      throw new ServiceUnavailableException(
        `Google Drive attachment cleanup failed (${response.status})`,
      )
    }
  }
}
