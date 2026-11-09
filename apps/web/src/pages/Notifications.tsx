import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useApiQuery } from '../api/hooks'
import { apiSend } from '../api/client'
import {
  PageHeader,
  Button,
  Badge,
  Spinner,
  EmptyState,
  Card,
  CardContent,
} from '../components/ui'
import type { BadgeVariant } from '../components/ui'

// ── Types ──────────────────────────────────────────────────────────────────

interface Notification {
  id: string
  type: string
  message: string
  entityType?: string
  entityId?: string
  readAt?: string
  createdAt: string
  isSample?: boolean
}

// ── Constants ──────────────────────────────────────────────────────────────

const TYPE_VARIANT: Record<string, BadgeVariant> = {
  OFFER: 'success',
  INTERVIEW: 'info',
  APPLICATION: 'purple',
  FEEDBACK: 'warning',
  SYSTEM: 'default',
  JOINING: 'success',
}

const SAMPLE_NOTIFICATIONS: Notification[] = [
  {
    id: 'sample-interview',
    type: 'INTERVIEW',
    message: 'A technical interview has been scheduled with Jordan Lee.',
    createdAt: new Date(Date.now() - 12 * 60_000).toISOString(),
    isSample: true,
  },
  {
    id: 'sample-feedback',
    type: 'FEEDBACK',
    message: 'Interview feedback is ready for the Product Designer role.',
    createdAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
    isSample: true,
  },
  {
    id: 'sample-offer',
    type: 'OFFER',
    message: 'An offer has been accepted by a candidate.',
    createdAt: new Date(Date.now() - 5 * 60 * 60_000).toISOString(),
    isSample: true,
  },
  {
    id: 'sample-joining',
    type: 'JOINING',
    message: 'A new hire is joining next week. Check the joining tracker.',
    createdAt: new Date(Date.now() - 26 * 60 * 60_000).toISOString(),
    readAt: new Date(Date.now() - 20 * 60 * 60_000).toISOString(),
    isSample: true,
  },
  {
    id: 'sample-system',
    type: 'SYSTEM',
    message: 'Your hiring pipeline summary is ready to review.',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60_000).toISOString(),
    readAt: new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString(),
    isSample: true,
  },
]

function typeVariant(type: string): BadgeVariant {
  return TYPE_VARIANT[type] ?? 'default'
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

// ── Notification Item ──────────────────────────────────────────────────────

interface NotificationItemProps {
  notification: Notification
  onMarkedRead: () => void
}

function NotificationItem({ notification, onMarkedRead }: NotificationItemProps) {
  const [marking, setMarking] = useState(false)
  const isUnread = !notification.readAt

  const handleMarkRead = async () => {
    if (!isUnread) return
    setMarking(true)
    try {
      await apiSend(`/notifications/${notification.id}/read`, 'POST', {})
      onMarkedRead()
    } catch {
      // silently ignore, invalidation will sync
    } finally {
      setMarking(false)
    }
  }

  return (
    <div
      className={[
        'flex items-start justify-between gap-4 px-4 py-3 border-b border-border last:border-b-0 transition-colors',
        isUnread ? 'bg-indigo-50/50 dark:bg-indigo-950/40' : 'bg-card',
      ].join(' ')}
    >
      <div className="flex items-start gap-3 min-w-0">
        {/* Unread dot */}
        <div className="mt-1.5 shrink-0">
          {isUnread ? (
            <span className="h-2 w-2 rounded-full bg-indigo-500 inline-block" />
          ) : (
            <span className="h-2 w-2 rounded-full bg-transparent inline-block" />
          )}
        </div>

        <div className="min-w-0 space-y-1">
          <p className={`text-sm ${isUnread ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
            {notification.message}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={typeVariant(notification.type)}>
              {notification.type.replace(/_/g, ' ')}
            </Badge>
            <span className="text-xs text-muted-foreground" title={notification.createdAt}>
              {relativeTime(notification.createdAt)}
            </span>
            {notification.readAt && (
              <span className="text-xs text-muted-foreground">
                Read {relativeTime(notification.readAt)}
              </span>
            )}
          </div>
        </div>
      </div>

      {isUnread && !notification.isSample && (
        <Button
          size="sm"
          variant="ghost"
          onClick={handleMarkRead}
          disabled={marking}
          className="shrink-0 text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          {marking ? '…' : 'Mark read'}
        </Button>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export function Notifications() {
  const queryClient = useQueryClient()
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [markingAll, setMarkingAll] = useState(false)

  const { data: notifications, isLoading, error } = useApiQuery<Notification[]>(
    ['notifications', 'all'],
    '/notifications'
  )

  // Invalidate both the page query and the bell's unread query key
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  const handleMarkAll = async () => {
    setMarkingAll(true)
    try {
      await apiSend('/notifications/read-all', 'POST', {})
      invalidateAll()
    } catch {
      // silently ignore
    } finally {
      setMarkingAll(false)
    }
  }

  const isShowingSamples = !isLoading && !error && (notifications?.length ?? 0) === 0
  const list = isShowingSamples
    ? SAMPLE_NOTIFICATIONS.filter((notification) => !unreadOnly || !notification.readAt)
    : (notifications ?? []).filter(
        (notification) => !unreadOnly || !notification.readAt,
      )
  const unreadCount = list.filter((n) => !n.readAt).length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        subtitle={
          unreadOnly
            ? `${list.length} unread notification${list.length !== 1 ? 's' : ''}`
            : `${list.length} notification${list.length !== 1 ? 's' : ''}${unreadCount > 0 ? ` · ${unreadCount} unread` : ''}`
        }
        actions={
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(e) => setUnreadOnly(e.target.checked)}
                className="h-4 w-4 rounded-sm border-border text-indigo-600 focus:ring-indigo-500"
              />
              Unread only
            </label>
            {unreadCount > 0 && !isShowingSamples && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkAll}
                loading={markingAll}
                disabled={markingAll}
              >
                Mark all read
              </Button>
            )}
          </div>
        }
      />

      {isLoading && (
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-300">
          Failed to load notifications: {error.message}
        </div>
      )}

      {!isLoading && !error && list.length === 0 && (
        <EmptyState
          title="No notifications"
          description={unreadOnly ? 'You have no unread notifications.' : 'No notifications yet.'}
        />
      )}

      {!isLoading && !error && list.length > 0 && (
        <>
          {isShowingSamples && (
            <p className="text-xs text-muted-foreground" role="note">
              Showing sample notifications for preview.
            </p>
          )}
          <Card>
            <CardContent className="p-0">
              {list.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onMarkedRead={invalidateAll}
                />
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
