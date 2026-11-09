import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApiQuery } from '../api/hooks'
import {
  PageHeader,
  Card,
  CardHeader,
  CardContent,
  Badge,
  Spinner,
} from '../components/ui'
import type { BadgeVariant } from '../components/ui'

// ── Types ──────────────────────────────────────────────────────────────────

interface RoleRef {
  roleId: string
  title: string
  projectId?: string
}

interface ExecutiveDashboard {
  openRoles: number
  requiredPositions: number
  filledPositions: number
  gap: number
  highPriorityRoles: RoleRef[]
  highRiskRoles: RoleRef[]
  offersInProgress: number
  upcomingJoiners: number
  delayedRoles: RoleRef[]
  projectStaffingRisks: RoleRef[]
}

interface HrOpsDashboard {
  cvsPendingReview: number
  candidatesPerStage: Record<string, number>
  interviewsScheduled: number
  feedbackPending: number
  offersPending: number
  followUpsDue: number
  rolesWithNoShortlist: number
}

// ── Helpers ────────────────────────────────────────────────────────────────

const HR_OPS_ROLES = new Set(['ADMIN', 'HR'])
const EXEC_ROLES = new Set(['ADMIN', 'HR', 'LEADERSHIP', 'HIRING_MANAGER'])

interface MetricCardProps {
  label: string
  value: number | string
  variant?: BadgeVariant
}

function MetricCard({ label, value, variant }: MetricCardProps) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 py-5">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        <span className="text-3xl font-bold text-foreground">{value}</span>
        {variant && (
          <Badge variant={variant} className="w-fit mt-1">
            {label}
          </Badge>
        )}
      </CardContent>
    </Card>
  )
}

interface RoleListProps {
  title: string
  roles: RoleRef[]
  emptyText: string
}

function RoleList({ title, roles, emptyText }: RoleListProps) {
  return (
    <Card>
      <CardHeader>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </CardHeader>
      <CardContent>
        {roles.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <ul className="divide-y divide-border">
            {roles.map((r) => (
              <li key={r.roleId} className="py-2">
                <Link
                  to={`/roles/${r.roleId}`}
                  className="text-sm text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 hover:underline"
                >
                  {r.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

// ── Executive section ──────────────────────────────────────────────────────

function ExecutiveSection() {
  const { data, isLoading, error } = useApiQuery<ExecutiveDashboard>(
    ['dashboard', 'executive'],
    '/dashboards/executive'
  )

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-300">
        Failed to load executive dashboard: {error?.message ?? 'Unknown error'}
      </div>
    )
  }

  return (
    <section className="space-y-6">
      <h2 className="text-base font-semibold text-foreground">Executive Overview</h2>

      {/* Metric grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <MetricCard label="Open Roles" value={data.openRoles} />
        <MetricCard label="Required" value={data.requiredPositions} />
        <MetricCard label="Filled" value={data.filledPositions} />
        <MetricCard label="Gap" value={data.gap} />
        <MetricCard label="Offers In Progress" value={data.offersInProgress} />
        <MetricCard label="Upcoming Joiners" value={data.upcomingJoiners} />
      </div>

      {/* Role lists */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <RoleList
          title="High Priority Roles"
          roles={data.highPriorityRoles}
          emptyText="No high priority roles."
        />
        <RoleList
          title="High Risk Roles"
          roles={data.highRiskRoles}
          emptyText="No high risk roles."
        />
        <RoleList
          title="Delayed Roles"
          roles={data.delayedRoles}
          emptyText="No delayed roles."
        />
      </div>
    </section>
  )
}

// ── HR Ops section ─────────────────────────────────────────────────────────

function HrOpsSection() {
  const { data, isLoading, error } = useApiQuery<HrOpsDashboard>(
    ['dashboard', 'hr-ops'],
    '/dashboards/hr-ops'
  )

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-300">
        Failed to load HR ops data: {error?.message ?? 'Unknown error'}
      </div>
    )
  }

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-foreground">HR Operations</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <MetricCard label="CVs Pending Review" value={data.cvsPendingReview} />
        <MetricCard label="Interviews Scheduled" value={data.interviewsScheduled} />
        <MetricCard label="Feedback Pending" value={data.feedbackPending} />
        <MetricCard label="Offers Pending" value={data.offersPending} />
        <MetricCard label="Follow-ups Due" value={data.followUpsDue} />
        <MetricCard label="Roles w/ No Shortlist" value={data.rolesWithNoShortlist} />
      </div>
    </section>
  )
}

// ── Interviewer view ───────────────────────────────────────────────────────

function InterviewerWelcome() {
  return (
    <Card>
      <CardContent className="py-10 flex flex-col items-center gap-4 text-center">
        <p className="text-muted-foreground text-sm max-w-sm">
          Welcome! Head to Interviews to see your upcoming sessions and submit feedback.
        </p>
        <Link
          to="/interviews"
          className="inline-flex items-center px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 transition-colors"
        >
          Go to Interviews
        </Link>
      </CardContent>
    </Card>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export function Dashboard() {
  const { me } = useAuth()
  const role = me?.role ?? ''

  const showExec = EXEC_ROLES.has(role)
  const showHrOps = HR_OPS_ROLES.has(role)
  const showInterviewer = role === 'INTERVIEWER'

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your hiring activity"
      />

      {showExec && <ExecutiveSection />}
      {showHrOps && <HrOpsSection />}
      {showInterviewer && <InterviewerWelcome />}

      {!showExec && !showInterviewer && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No dashboard data available for your role.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
