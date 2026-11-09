import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApiQuery } from '../api/hooks'
import {
  PageHeader,
  Button,
  Badge,
  Select,
  Modal,
  Field,
  Input,
  Spinner,
  EmptyState,
  Card,
  CardHeader,
  CardContent,
} from '../components/ui'
import type { BadgeVariant } from '../components/ui'
import { FeedbackFormModal } from './Interviews'

// ── Types ──────────────────────────────────────────────────────────────────

type InterviewStatus =
  | 'SCHEDULED'
  | 'COMPLETED'
  | 'RESCHEDULED'
  | 'CANCELLED'
  | 'CANDIDATE_NO_SHOW'
  | 'INTERVIEWER_NO_SHOW'

type Recommendation = 'STRONG_HIRE' | 'HIRE' | 'HOLD' | 'REJECT' | 'CONSIDER_OTHER_ROLE'

interface Interview {
  id: string
  applicationId: string
  application?: {
    id: string
    candidate?: { id: string; name: string }
    role?: { id: string; title: string }
    currentStage?: { key: string; label: string }
  }
  interviewers?: Array<{ id: string; name?: string; email?: string }>
  stageKey?: string
  scheduledAt: string
  durationMin?: number
  status: InterviewStatus
}

interface TrackingData {
  submitted: number
  pending: number
  delayed: number
  conflicting: Array<{
    applicationId: string
    candidateName?: string
    roleTitle?: string
    conflictCount?: number
  }>
}

interface AISummary {
  overall: string
  commonStrengths: string[]
  commonConcerns: string[]
  conflictingViews: string[]
  decisionSupport: string
}

// ── Constants ──────────────────────────────────────────────────────────────

const CAN_VIEW_TRACKING = new Set(['ADMIN', 'HR', 'HIRING_MANAGER'])

const RECOMMENDATION_VARIANT: Record<Recommendation, BadgeVariant> = {
  STRONG_HIRE: 'success',
  HIRE: 'success',
  HOLD: 'warning',
  REJECT: 'danger',
  CONSIDER_OTHER_ROLE: 'info',
}

// ── AI Summary Modal ───────────────────────────────────────────────────────

interface AISummaryModalProps {
  open: boolean
  applicationId: string
  candidateName?: string
  onClose: () => void
}

function AISummaryModal({ open, applicationId, candidateName, onClose }: AISummaryModalProps) {
  const { data: summary, isLoading, error } = useApiQuery<AISummary>(
    ['feedback-summary', applicationId],
    `/feedback/application/${applicationId}/summary`
  )

  return (
    <Modal open={open} onClose={onClose} title={`AI Summary${candidateName ? ` — ${candidateName}` : ''}`} className="max-w-2xl">
      <div className="space-y-4">
        {isLoading && (
          <div className="flex justify-center py-8">
            <Spinner size="lg" />
          </div>
        )}
        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            Failed to load summary: {error.message}
          </div>
        )}
        {summary && (
          <>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Overall Assessment
              </p>
              <p className="text-sm text-foreground leading-relaxed">{summary.overall}</p>
            </div>

            {summary.commonStrengths.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  Common Strengths
                </p>
                <ul className="space-y-1">
                  {summary.commonStrengths.map((s, i) => (
                    <li key={i} className="text-sm text-green-700 flex gap-2">
                      <span className="text-green-500 shrink-0">✓</span>{s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {summary.commonConcerns.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  Common Concerns
                </p>
                <ul className="space-y-1">
                  {summary.commonConcerns.map((c, i) => (
                    <li key={i} className="text-sm text-amber-700 flex gap-2">
                      <span className="text-amber-500 shrink-0">!</span>{c}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {summary.conflictingViews.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  Conflicting Views
                </p>
                <ul className="space-y-1">
                  {summary.conflictingViews.map((v, i) => (
                    <li key={i} className="text-sm text-purple-700 flex gap-2">
                      <span className="text-purple-500 shrink-0">↔</span>{v}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Decision Support
              </p>
              <p className="text-sm text-foreground leading-relaxed">{summary.decisionSupport}</p>
            </div>
          </>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Tracking Panel (ADMIN / HR / HM) ──────────────────────────────────────

interface TrackingPanelProps {
  roleId: string
}

function TrackingPanel({ roleId }: TrackingPanelProps) {
  const [summaryAppId, setSummaryAppId] = useState<string | null>(null)
  const [summaryCandidate, setSummaryCandidate] = useState<string | undefined>(undefined)

  const path = roleId
    ? `/feedback/tracking?roleId=${encodeURIComponent(roleId)}`
    : '/feedback/tracking'

  const { data: tracking, isLoading, error } = useApiQuery<TrackingData>(
    ['feedback-tracking', roleId],
    path
  )

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-300">
        Failed to load tracking: {error.message}
      </div>
    )
  }

  if (!tracking) return null

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-6 text-center">
            <p className="text-3xl font-bold text-green-600">{tracking.submitted}</p>
            <p className="text-sm text-muted-foreground mt-1">Submitted</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-6 text-center">
            <p className="text-3xl font-bold text-amber-500">{tracking.pending}</p>
            <p className="text-sm text-muted-foreground mt-1">Pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-6 text-center">
            <p className="text-3xl font-bold text-red-500">{tracking.delayed}</p>
            <p className="text-sm text-muted-foreground mt-1">Delayed</p>
          </CardContent>
        </Card>
      </div>

      {tracking.conflicting.length > 0 && (
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold text-foreground">
              Conflicting Feedback Applications ({tracking.conflicting.length})
            </h3>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {tracking.conflicting.map((item) => (
              <div
                key={item.applicationId}
                className="flex items-center justify-between py-2 border-b border-border last:border-0"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {item.candidateName ?? item.applicationId}
                  </p>
                  {item.roleTitle && (
                    <p className="text-xs text-muted-foreground">{item.roleTitle}</p>
                  )}
                  {item.conflictCount != null && (
                    <Badge variant="purple" className="mt-1">
                      {item.conflictCount} conflicting review{item.conflictCount !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSummaryAppId(item.applicationId)
                    setSummaryCandidate(item.candidateName)
                  }}
                >
                  AI Summary
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {summaryAppId && (
        <AISummaryModal
          open={true}
          applicationId={summaryAppId}
          candidateName={summaryCandidate}
          onClose={() => {
            setSummaryAppId(null)
            setSummaryCandidate(undefined)
          }}
        />
      )}
    </>
  )
}

// ── Awaiting Feedback List ─────────────────────────────────────────────────

function AwaitingFeedbackList() {
  const [feedbackInterviewId, setFeedbackInterviewId] = useState<string | null>(null)

  const { data: interviews, isLoading, error } = useApiQuery<Interview[]>(
    ['interviews', 'COMPLETED'],
    '/interviews?status=COMPLETED'
  )

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-300">
        Failed to load interviews: {error.message}
      </div>
    )
  }

  const completed = (interviews ?? []).filter((iv) => iv.status === 'COMPLETED')

  if (completed.length === 0) {
    return (
      <EmptyState
        title="No interviews awaiting feedback"
        description="Completed interviews with pending feedback will appear here."
      />
    )
  }

  return (
    <>
      <div className="space-y-3">
        {completed.map((iv) => {
          const candidateName =
            iv.application?.candidate?.name ??
            iv.applicationId
          const stageLabel =
            iv.application?.currentStage?.label ?? iv.stageKey ?? '—'
          const roleTitle = iv.application?.role?.title ?? '—'

          return (
            <Card key={iv.id}>
              <CardContent className="py-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">{candidateName}</p>
                    <p className="text-xs text-muted-foreground">
                      {roleTitle} · {stageLabel} ·{' '}
                      {new Date(iv.scheduledAt).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setFeedbackInterviewId(iv.id)}
                  >
                    Give Feedback
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {feedbackInterviewId && (
        <FeedbackFormModal
          open={true}
          interviewId={feedbackInterviewId}
          onClose={() => setFeedbackInterviewId(null)}
          onSubmitted={() => setFeedbackInterviewId(null)}
        />
      )}
    </>
  )
}

// ── Application Feedback Viewer ────────────────────────────────────────────

interface ApplicationFeedbackPanelProps {
  applicationId: string
  onClose: () => void
}

interface FeedbackEntry {
  id: string
  interviewId: string
  recommendation: Recommendation
  strengths?: string
  concerns?: string
  notes?: string
  scores?: Record<string, number | string>
  reviewer?: { name?: string; email?: string }
  createdAt?: string
}

function ApplicationFeedbackModal({ applicationId, onClose }: ApplicationFeedbackPanelProps) {
  const { data: entries, isLoading, error } = useApiQuery<FeedbackEntry[]>(
    ['feedback-application', applicationId],
    `/feedback/application/${applicationId}`
  )

  const [showSummary, setShowSummary] = useState(false)

  return (
    <Modal open={true} onClose={onClose} title="Application Feedback" className="max-w-2xl">
      <div className="space-y-4">
        {isLoading && <div className="flex justify-center py-6"><Spinner /></div>}
        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error.message}
          </div>
        )}

        {!isLoading && !error && (entries ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">No feedback submitted yet.</p>
        )}

        {(entries ?? []).map((fb) => (
          <div key={fb.id} className="rounded-lg border border-border p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">
                {fb.reviewer?.name ?? fb.reviewer?.email ?? 'Unknown reviewer'}
              </p>
              <div className="flex items-center gap-2">
                <Badge variant={RECOMMENDATION_VARIANT[fb.recommendation] ?? 'default'}>
                  {fb.recommendation.replace(/_/g, ' ')}
                </Badge>
                {fb.createdAt && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(fb.createdAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
            {fb.strengths && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">Strengths:</span> {fb.strengths}
              </p>
            )}
            {fb.concerns && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">Concerns:</span> {fb.concerns}
              </p>
            )}
            {fb.notes && (
              <p className="text-xs text-muted-foreground italic">{fb.notes}</p>
            )}
          </div>
        ))}

        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSummary(true)}
          >
            AI Summary
          </Button>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>

      {showSummary && (
        <AISummaryModal
          open={true}
          applicationId={applicationId}
          onClose={() => setShowSummary(false)}
        />
      )}
    </Modal>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export function Feedback() {
  const { me } = useAuth()
  const userRole = me?.role ?? ''
  const canViewTracking = CAN_VIEW_TRACKING.has(userRole)

  const [roleIdFilter, setRoleIdFilter] = useState('')
  const [viewAppId, setViewAppId] = useState<string | null>(null)

  return (
    <div className="space-y-8">
      <PageHeader
        title="Feedback"
        subtitle="Interview feedback, scorecards and tracking"
      />

      {/* ── Tracking Panel (ADMIN / HR / HM) ── */}
      {canViewTracking && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Feedback Tracking</h2>
            <div className="flex items-center gap-2">
              <label htmlFor="role-filter" className="text-sm text-muted-foreground">
                Role ID:
              </label>
              <Input
                id="role-filter"
                value={roleIdFilter}
                onChange={(e) => setRoleIdFilter(e.target.value)}
                placeholder="Filter by role ID…"
                className="w-48 text-sm"
              />
            </div>
          </div>
          <TrackingPanel roleId={roleIdFilter} />
        </section>
      )}

      {/* ── View application feedback (ADMIN / HR / HM) ── */}
      {canViewTracking && (
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-foreground">View Feedback by Application</h2>
          </div>
          <div className="flex items-center gap-3">
            <Input
              id="app-id-input"
              placeholder="Enter application ID…"
              className="w-64 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const val = (e.target as HTMLInputElement).value.trim()
                  if (val) setViewAppId(val)
                }
              }}
            />
            <span className="text-xs text-muted-foreground">Press Enter to view</span>
          </div>
        </section>
      )}

      {/* ── My interviews awaiting feedback (all roles) ── */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">
          {canViewTracking ? 'Completed Interviews Awaiting Feedback' : 'My Interviews Awaiting Feedback'}
        </h2>
        <AwaitingFeedbackList />
      </section>

      {/* Application feedback modal */}
      {viewAppId && (
        <ApplicationFeedbackModal
          applicationId={viewAppId}
          onClose={() => setViewAppId(null)}
        />
      )}
    </div>
  )
}
