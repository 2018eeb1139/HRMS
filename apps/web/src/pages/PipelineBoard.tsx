import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { useApiQuery } from '../api/hooks'
import { apiSend } from '../api/client'
import type { ScreeningResult } from '@picode-hr/shared'
import {
  PageHeader,
  Button,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Modal,
  Field,
  Textarea,
  Input,
  Spinner,
  EmptyState,
} from '../components/ui'
import type { BadgeVariant } from '../components/ui'

// ── Types ──────────────────────────────────────────────────────────────────

interface Stage {
  key: string
  label: string
  order: number
}

interface ApplicationCard {
  id: string
  candidateId: string
  roleId: string
  currentStage?: { key: string; label: string }
  status: string
  matchScore?: number
  candidate?: { id: string; name: string }
  screeningResult?: ScreeningResult
}

interface PipelineData {
  stages: Stage[]
  columns: Record<string, ApplicationCard[]>
}

interface Candidate {
  id: string
  name: string
}

interface Role {
  id: string
  title: string
  status: string
}

// ── Constants ──────────────────────────────────────────────────────────────

const CAN_MOVE = new Set(['ADMIN', 'HR', 'HIRING_MANAGER'])
const CAN_ADD = new Set(['ADMIN', 'HR', 'HIRING_MANAGER'])
const CAN_SCREEN = new Set(['ADMIN', 'HR'])

const RECOMMENDATION_VARIANT: Record<string, BadgeVariant> = {
  STRONG_SHORTLIST: 'success',
  SHORTLIST_MINOR_CONCERNS: 'success',
  NEEDS_HR_CLARIFICATION: 'warning',
  NOT_SUITABLE: 'danger',
  STRONG_YES: 'success',
  YES: 'success',
  MAYBE: 'warning',
  NO: 'danger',
  STRONG_NO: 'danger',
}

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  ACTIVE: 'info',
  REJECTED: 'danger',
  WITHDRAWN: 'default',
  HIRED: 'success',
  ON_HOLD: 'warning',
}

// ── Reject Modal ───────────────────────────────────────────────────────────

interface RejectModalProps {
  open: boolean
  applicationId: string
  roleId: string
  onClose: () => void
}

function RejectModal({ open, applicationId, roleId, onClose }: RejectModalProps) {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleReject = async () => {
    if (!reason.trim()) { setError('Reason is required.'); return }
    setSaving(true)
    setError(null)
    try {
      await apiSend(`/applications/${applicationId}/reject`, 'POST', { reason: reason.trim() })
      await queryClient.invalidateQueries({ queryKey: ['pipeline', roleId] })
      setReason('')
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to reject application.')
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    setReason('')
    setError(null)
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Reject Application">
      <div className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
        <Field label="Reason" htmlFor="reject-reason" required>
          <Textarea
            id="reject-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Provide a reason for rejection…"
            rows={3}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={saving}>Cancel</Button>
          <Button variant="destructive" onClick={handleReject} loading={saving}>Reject</Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Screening Result Modal ─────────────────────────────────────────────────

interface ScreeningModalProps {
  open: boolean
  result: ScreeningResult | null
  onClose: () => void
}

function ScreeningModal({ open, result, onClose }: ScreeningModalProps) {
  if (!result) return null
  return (
    <Modal open={open} onClose={onClose} title="Screening Result">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl font-bold text-foreground">{result.matchScore}%</span>
          {result.recommendationCategory && (
            <Badge variant={RECOMMENDATION_VARIANT[result.recommendationCategory] ?? 'default'}>
              {result.recommendationCategory.replace(/_/g, ' ')}
            </Badge>
          )}
        </div>

        <p className="text-sm text-foreground leading-relaxed">{result.summary}</p>

        <div className="grid grid-cols-3 gap-2 rounded-md bg-muted/50 p-3 text-center">
          <div>
            <p className="text-sm font-semibold text-foreground">{result.skillsMatch}%</p>
            <p className="text-xs text-muted-foreground">Skills</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{result.experienceMatch}%</p>
            <p className="text-xs text-muted-foreground">Experience</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{result.seniorityFit}%</p>
            <p className="text-xs text-muted-foreground">Seniority</p>
          </div>
        </div>

        {result.matchedRequiredSkills.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Matched required skills</p>
            <ul className="space-y-1">
              {result.matchedRequiredSkills.map((skill) => (
                <li key={skill} className="text-sm text-green-700 flex gap-2">
                  <span className="text-green-500 shrink-0">✓</span>{skill}
                </li>
              ))}
            </ul>
          </div>
        )}

        {result.missingRequiredSkills.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Missing required skills</p>
            <ul className="space-y-1">
              {result.missingRequiredSkills.map((skill) => (
                <li key={skill} className="text-sm text-amber-700 flex gap-2">
                  <span className="text-amber-500 shrink-0">!</span>{skill}
                </li>
              ))}
            </ul>
          </div>
        )}

        {(result.strengths ?? []).length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Strengths</p>
            <ul className="space-y-1">
              {result.strengths!.map((s, i) => (
                <li key={i} className="text-sm text-green-700 flex gap-2">
                  <span className="text-green-500 shrink-0">✓</span>{s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {(result.gaps ?? []).length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Gaps</p>
            <ul className="space-y-1">
              {result.gaps!.map((g, i) => (
                <li key={i} className="text-sm text-amber-700 flex gap-2">
                  <span className="text-amber-500 shrink-0">!</span>{g}
                </li>
              ))}
            </ul>
          </div>
        )}

        {(result.riskFlags ?? []).length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Risk Flags</p>
            <ul className="space-y-1">
              {result.riskFlags!.map((r, i) => (
                <li key={i} className="text-sm text-red-700 flex gap-2">
                  <span className="text-red-500 shrink-0">✕</span>{r}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Add Candidate Modal ────────────────────────────────────────────────────

interface AddCandidateModalProps {
  open: boolean
  roleId: string
  onClose: () => void
}

function AddCandidateModal({ open, roleId, onClose }: AddCandidateModalProps) {
  const queryClient = useQueryClient()
  const [selectedCandidateId, setSelectedCandidateId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const { data: candidates } = useApiQuery<Candidate[]>(
    ['candidates', 'picker', search],
    `/candidates${search ? `?q=${encodeURIComponent(search)}` : ''}`
  )

  const handleAdd = async () => {
    if (!selectedCandidateId) { setError('Select a candidate.'); return }
    setSaving(true)
    setError(null)
    try {
      await apiSend('/applications', 'POST', { candidateId: selectedCandidateId, roleId })
      await queryClient.invalidateQueries({ queryKey: ['pipeline', roleId] })
      setSelectedCandidateId('')
      setSearch('')
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to add candidate.')
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    setSelectedCandidateId('')
    setSearch('')
    setError(null)
    onClose()
  }

  const candidateItems = [
    { value: '', label: 'Choose a candidate…' },
    ...(candidates ?? []).map((c) => ({ value: c.id, label: c.name })),
  ]

  return (
    <Modal open={open} onClose={handleClose} title="Add Candidate to Pipeline">
      <div className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
        <Field label="Search Candidates" htmlFor="add-cand-search">
          <Input
            id="add-cand-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
          />
        </Field>
        <Field label="Select Candidate" htmlFor="add-cand-select">
          <Select
            items={candidateItems}
            value={selectedCandidateId}
            onValueChange={(value) => setSelectedCandidateId(value ?? '')}
          >
            <SelectTrigger id="add-cand-select" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {candidateItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleAdd} loading={saving}>Add to Pipeline</Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Application Card ───────────────────────────────────────────────────────

interface AppCardProps {
  app: ApplicationCard
  stages: Stage[]
  roleId: string
  canMove: boolean
  canReject: boolean
  canScreen: boolean
}

function AppCard({ app, stages, roleId, canMove, canReject, canScreen }: AppCardProps) {
  const queryClient = useQueryClient()
  const [moving, setMoving] = useState(false)
  const [screening, setScreening] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [showScreening, setShowScreening] = useState(false)
  const [screenError, setScreenError] = useState<string | null>(null)
  const [screeningResult, setScreeningResult] = useState<ScreeningResult | null>(
    app.screeningResult ?? null
  )
  const [moveError, setMoveError] = useState<string | null>(null)

  const otherStages = stages.filter((s) => s.key !== app.currentStage?.key)

  const handleMove = async (toStageKey: string) => {
    if (!toStageKey || !canMove) return
    setMoving(true)
    setMoveError(null)
    try {
      await apiSend(`/applications/${app.id}/stage`, 'PUT', { toStageKey })
      await queryClient.invalidateQueries({ queryKey: ['pipeline', roleId] })
    } catch (e: unknown) {
      setMoveError(e instanceof Error ? e.message : 'Failed to move.')
    } finally {
      setMoving(false)
    }
  }

  const handleScreen = async () => {
    if (!canScreen) return
    setScreening(true)
    setScreenError(null)
    try {
      const result = await apiSend<ScreeningResult>(`/applications/${app.id}/screen`, 'POST', {})
      setScreeningResult(result)
      setShowScreening(true)
      await queryClient.invalidateQueries({ queryKey: ['pipeline', roleId] })
    } catch (e: unknown) {
      setScreenError(e instanceof Error ? e.message : 'Screening failed.')
    } finally {
      setScreening(false)
    }
  }

  const isRejected = app.status === 'REJECTED'

  const moveItems = [
    { value: '', label: 'Move to…' },
    ...otherStages.map((s) => ({ value: s.key, label: s.label })),
  ]

  return (
    <>
      <div className={`rounded-lg border bg-card p-3 shadow-xs space-y-2 ${isRejected ? 'opacity-60' : ''}`}>
        {/* Candidate name + status */}
        <div className="flex items-start justify-between gap-2">
          <Link
            to={`/candidates/${app.candidateId}`}
            className="font-medium text-foreground text-sm hover:text-indigo-600 hover:underline leading-snug"
          >
            {app.candidate?.name ?? 'Unknown'}
          </Link>
          <Badge variant={STATUS_VARIANT[app.status] ?? 'default'} className="shrink-0">
            {app.status}
          </Badge>
        </div>

        {/* Match score */}
        {app.matchScore != null && (
          <div className="flex items-center gap-1">
            <Badge
              variant={app.matchScore >= 70 ? 'success' : app.matchScore >= 40 ? 'warning' : 'danger'}
            >
              {app.matchScore}% match
            </Badge>
          </div>
        )}

        {/* Move error */}
        {moveError && (
          <p className="text-xs text-red-600">{moveError}</p>
        )}
        {screenError && (
          <p className="text-xs text-red-600">{screenError}</p>
        )}

        {/* Actions */}
        {!isRejected && (
          <div className="space-y-1.5">
            {canMove && otherStages.length > 0 && (
              <Select
                items={moveItems}
                value=""
                onValueChange={(value) => handleMove(value ?? '')}
                disabled={moving}
              >
                <SelectTrigger className="text-xs py-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {moveItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="flex gap-1">
              {canScreen && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleScreen}
                  loading={screening}
                  className="text-xs px-2 py-1"
                >
                  Screen
                </Button>
              )}
              {screeningResult && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowScreening(true)}
                  className="text-xs px-2 py-1"
                >
                  Result
                </Button>
              )}
              {canReject && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setShowReject(true)}
                  className="text-xs px-2 py-1"
                >
                  Reject
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <RejectModal
        open={showReject}
        applicationId={app.id}
        roleId={roleId}
        onClose={() => setShowReject(false)}
      />

      <ScreeningModal
        open={showScreening}
        result={screeningResult}
        onClose={() => setShowScreening(false)}
      />
    </>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export function PipelineBoard() {
  const { roleId } = useParams<{ roleId: string }>()
  const { me } = useAuth()
  const userRole = me?.role ?? ''
  const canMove = CAN_MOVE.has(userRole)
  const canAdd = CAN_ADD.has(userRole)
  const canScreen = CAN_SCREEN.has(userRole)
  const canReject = CAN_MOVE.has(userRole)

  const [showAdd, setShowAdd] = useState(false)

  const { data: pipeline, isLoading, error } = useApiQuery<PipelineData>(
    ['pipeline', roleId],
    `/applications/pipeline/${roleId}`
  )

  const { data: role } = useApiQuery<Role>(
    ['role', roleId],
    `/roles/${roleId}`
  )

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error || !pipeline) {
    return (
      <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-300">
        Failed to load pipeline: {error?.message ?? 'Not found'}
      </div>
    )
  }

  const stages = [...pipeline.stages].sort((a, b) => a.order - b.order)
  const totalApps = stages.reduce(
    (sum, s) => sum + (pipeline.columns[s.key] ?? []).length, 0
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title={role ? `Pipeline: ${role.title}` : 'Pipeline'}
        subtitle={`${totalApps} application${totalApps !== 1 ? 's' : ''} across ${stages.length} stages`}
        actions={
          <div className="flex gap-2">
            <Link
              to="/pipeline"
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-muted-foreground bg-card border border-border rounded-md hover:bg-muted"
            >
              ← All Roles
            </Link>
            {canAdd && (
              <Button size="sm" onClick={() => setShowAdd(true)}>
                Add Candidate
              </Button>
            )}
          </div>
        }
      />

      {stages.length === 0 && (
        <EmptyState
          title="No stages configured"
          description="Contact your administrator to configure pipeline stages."
        />
      )}

      {stages.length > 0 && (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {stages.map((stage) => {
              const cards = pipeline.columns[stage.key] ?? []
              return (
                <div key={stage.key} className="w-64 shrink-0">
                  {/* Column header */}
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-foreground text-sm">{stage.label}</h3>
                    <Badge variant="default">{cards.length}</Badge>
                  </div>

                  {/* Cards */}
                  <div className="space-y-3">
                    {cards.length === 0 && (
                      <div className="rounded-lg border-2 border-dashed border-border p-4 text-center">
                        <p className="text-xs text-muted-foreground">No candidates</p>
                      </div>
                    )}
                    {cards.map((app) => (
                      <AppCard
                        key={app.id}
                        app={app}
                        stages={stages}
                        roleId={roleId!}
                        canMove={canMove}
                        canReject={canReject}
                        canScreen={canScreen}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {canAdd && roleId && (
        <AddCandidateModal
          open={showAdd}
          roleId={roleId}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  )
}
