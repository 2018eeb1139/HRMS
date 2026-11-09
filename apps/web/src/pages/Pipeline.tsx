import { Link } from 'react-router-dom'
import { useApiQuery } from '../api/hooks'
import {
  PageHeader,
  Badge,
  Card,
  CardContent,
  Spinner,
  EmptyState,
} from '../components/ui'
import type { BadgeVariant } from '../components/ui'

// ── Types ──────────────────────────────────────────────────────────────────

type RoleStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'ON_HOLD'
  | 'FILLED'
  | 'CANCELLED'
  | 'CLOSED'

type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

interface Role {
  id: string
  title: string
  status: RoleStatus
  priority: Priority
  requiredCount: number
  filledCount: number
}

// ── Constants ──────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<RoleStatus, BadgeVariant> = {
  DRAFT: 'default',
  PENDING_APPROVAL: 'warning',
  OPEN: 'info',
  IN_PROGRESS: 'info',
  ON_HOLD: 'warning',
  FILLED: 'success',
  CANCELLED: 'danger',
  CLOSED: 'default',
}

const PRIORITY_VARIANT: Record<Priority, BadgeVariant> = {
  LOW: 'default',
  MEDIUM: 'info',
  HIGH: 'warning',
  CRITICAL: 'danger',
}

// ── Page ───────────────────────────────────────────────────────────────────

export function Pipeline() {
  const { data: roles, isLoading, error } = useApiQuery<Role[]>(
    ['roles', 'pipeline-picker'],
    '/roles?status=OPEN&status=IN_PROGRESS'
  )

  const activeRoles = (roles ?? []).filter(
    (r) => r.status === 'OPEN' || r.status === 'IN_PROGRESS'
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pipeline"
        subtitle="Select a role to view its candidate pipeline"
      />

      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      )}

      {error && !isLoading && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-300">
          Failed to load roles: {error.message}
        </div>
      )}

      {!isLoading && !error && activeRoles.length === 0 && (
        <EmptyState
          title="No open roles"
          description="There are no open or in-progress roles with a pipeline at the moment."
        />
      )}

      {!isLoading && !error && activeRoles.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activeRoles.map((role) => {
            const remaining = role.requiredCount - role.filledCount
            return (
              <Link key={role.id} to={`/pipeline/${role.id}`} className="block group">
                <Card className="hover:shadow-md transition-shadow h-full">
                  <CardContent className="py-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors leading-snug">
                        {role.title}
                      </h3>
                      <Badge variant={PRIORITY_VARIANT[role.priority] ?? 'default'}>
                        {role.priority}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={STATUS_VARIANT[role.status] ?? 'default'}>
                        {role.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{role.filledCount} filled</span>
                      <span
                        className={remaining > 0 ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-green-600 dark:text-green-400 font-medium'}
                      >
                        {remaining} remaining
                      </span>
                    </div>
                    <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium group-hover:underline">
                      View pipeline →
                    </p>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
