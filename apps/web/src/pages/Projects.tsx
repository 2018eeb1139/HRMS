import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApiQuery, useApiMutation } from '../api/hooks'
import {
  PageHeader,
  Button,
  Badge,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Modal,
  Field,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  EmptyState,
  Card,
} from '../components/ui'
import type { BadgeVariant } from '../components/ui'

// ── Types ──────────────────────────────────────────────────────────────────

export interface Project {
  id: string
  name: string
  client?: string
  projectManager?: string
  startDate?: string
  endDate?: string
  status?: ProjectStatus
}

type ProjectStatus = 'ACTIVE' | 'PLANNED' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED'

interface ProjectStaffing {
  requiredHeadcount: number
  filledHeadcount: number
  gap: number
  openRoles: number
  riskLevel: RiskLevel
}

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH'

interface NewProjectForm {
  name: string
  client: string
  projectManager: string
  startDate: string
  endDate: string
  status: ProjectStatus | ''
}

// ── Helpers ────────────────────────────────────────────────────────────────

const RISK_VARIANT: Record<RiskLevel, BadgeVariant> = {
  LOW: 'success',
  MEDIUM: 'warning',
  HIGH: 'danger',
}

const STATUS_VARIANT: Record<ProjectStatus, BadgeVariant> = {
  ACTIVE: 'success',
  PLANNED: 'info',
  ON_HOLD: 'warning',
  COMPLETED: 'default',
  CANCELLED: 'danger',
}

const PROJECT_STATUS_OPTIONS: ProjectStatus[] = [
  'ACTIVE',
  'PLANNED',
  'ON_HOLD',
  'COMPLETED',
  'CANCELLED',
]

const PROJECT_STATUS_ITEMS = [
  { value: '', label: 'Select status…' },
  ...PROJECT_STATUS_OPTIONS.map((s) => ({ value: s, label: s.replace('_', ' ') })),
]

const CAN_CREATE = new Set(['ADMIN', 'HR', 'PROJECT_MANAGER'])

const EMPTY_FORM: NewProjectForm = {
  name: '',
  client: '',
  projectManager: '',
  startDate: '',
  endDate: '',
  status: '',
}

// ── Staffing badge (per row) ───────────────────────────────────────────────

function StaffingCell({ projectId }: { projectId: string }) {
  const { data, isLoading } = useApiQuery<ProjectStaffing>(
    ['project-staffing', projectId],
    `/projects/${projectId}/staffing`
  )

  if (isLoading) return <Spinner size="sm" />

  if (!data) return <span className="text-muted-foreground text-xs">—</span>

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">
        {data.filledHeadcount}/{data.requiredHeadcount}
        {data.gap > 0 && (
          <span className="text-amber-600 dark:text-amber-400 ml-1">(gap: {data.gap})</span>
        )}
      </span>
      <Badge variant={RISK_VARIANT[data.riskLevel]}>{data.riskLevel}</Badge>
    </div>
  )
}

// ── New Project Modal ──────────────────────────────────────────────────────

interface NewProjectModalProps {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

function NewProjectModal({ open, onClose, onCreated }: NewProjectModalProps) {
  const [form, setForm] = useState<NewProjectForm>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)

  const mutation = useApiMutation<Project>('/projects', 'POST', [['projects']])

  const setField = <K extends keyof NewProjectForm>(key: K, value: NewProjectForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = async () => {
    if (!form.name.trim()) { setFormError('Project name is required.'); return }
    setFormError(null)
    try {
      await mutation.mutateAsync({
        name: form.name.trim(),
        client: form.client.trim() || undefined,
        projectManager: form.projectManager.trim() || undefined,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        status: form.status || undefined,
      })
      setForm(EMPTY_FORM)
      onCreated()
      onClose()
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Failed to create project.')
    }
  }

  const handleClose = () => {
    setForm(EMPTY_FORM)
    setFormError(null)
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="New Project">
      <div className="space-y-4">
        {formError && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {formError}
          </div>
        )}

        <Field label="Project Name" htmlFor="proj-name" required>
          <Input
            id="proj-name"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            placeholder="e.g. Platform Migration"
          />
        </Field>

        <Field label="Client" htmlFor="proj-client">
          <Input
            id="proj-client"
            value={form.client}
            onChange={(e) => setField('client', e.target.value)}
            placeholder="Client name"
          />
        </Field>

        <Field label="Project Manager" htmlFor="proj-pm">
          <Input
            id="proj-pm"
            value={form.projectManager}
            onChange={(e) => setField('projectManager', e.target.value)}
            placeholder="Name or email"
          />
        </Field>

        <Field label="Status" htmlFor="proj-status">
          <Select
            items={PROJECT_STATUS_ITEMS}
            value={form.status}
            onValueChange={(value) => setField('status', (value ?? '') as ProjectStatus | '')}
          >
            <SelectTrigger id="proj-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_STATUS_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Start Date" htmlFor="proj-start">
            <Input
              id="proj-start"
              type="date"
              value={form.startDate}
              onChange={(e) => setField('startDate', e.target.value)}
            />
          </Field>
          <Field label="End Date" htmlFor="proj-end">
            <Input
              id="proj-end"
              type="date"
              value={form.endDate}
              onChange={(e) => setField('endDate', e.target.value)}
            />
          </Field>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={mutation.isPending}>
            Create Project
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export function Projects() {
  const { me } = useAuth()
  const role = me?.role ?? ''
  const canCreate = CAN_CREATE.has(role)

  const [showNewProject, setShowNewProject] = useState(false)

  const { data: projects, isLoading, error, refetch } = useApiQuery<Project[]>(
    ['projects'],
    '/projects'
  )

  const formatDate = (d?: string) =>
    d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        subtitle="Project staffing and headcount"
        actions={
          canCreate ? (
            <Button onClick={() => setShowNewProject(true)}>New Project</Button>
          ) : undefined
        }
      />

      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      )}

      {error && !isLoading && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-300">
          Failed to load projects: {error.message}
        </div>
      )}

      {!isLoading && !error && (projects ?? []).length === 0 && (
        <EmptyState
          title="No projects found"
          description="Projects will appear here once created."
          actions={
            canCreate ? (
              <Button onClick={() => setShowNewProject(true)}>New Project</Button>
            ) : undefined
          }
        />
      )}

      {!isLoading && !error && (projects ?? []).length > 0 && (
        <Card>
          <Table>
            <Thead>
              <Tr>
                <Th>Name</Th>
                <Th>Client</Th>
                <Th>Project Manager</Th>
                <Th>Status</Th>
                <Th>Start</Th>
                <Th>End</Th>
                <Th>Staffing</Th>
              </Tr>
            </Thead>
            <Tbody>
              {(projects ?? []).map((p) => (
                <Tr key={p.id}>
                  <Td className="font-medium text-foreground">{p.name}</Td>
                  <Td className="text-muted-foreground">{p.client ?? '—'}</Td>
                  <Td className="text-muted-foreground">{p.projectManager ?? '—'}</Td>
                  <Td>
                    {p.status ? (
                      <Badge variant={STATUS_VARIANT[p.status] ?? 'default'}>
                        {p.status.replace('_', ' ')}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </Td>
                  <Td className="text-muted-foreground">{formatDate(p.startDate)}</Td>
                  <Td className="text-muted-foreground">{formatDate(p.endDate)}</Td>
                  <Td>
                    <StaffingCell projectId={p.id} />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Card>
      )}

      <NewProjectModal
        open={showNewProject}
        onClose={() => setShowNewProject(false)}
        onCreated={() => refetch()}
      />
    </div>
  )
}
