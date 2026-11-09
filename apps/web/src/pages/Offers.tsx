import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { useApiQuery } from '../api/hooks'
import { apiDownload, apiSend } from '../api/client'
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
  Input,
  Textarea,
  Spinner,
  EmptyState,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Card,
  CardContent,
} from '../components/ui'
import type { BadgeVariant } from '../components/ui'

// ── Types ──────────────────────────────────────────────────────────────────

type OfferStatus =
  | 'TO_BE_PREPARED'
  | 'SENT'
  | 'UNDER_NEGOTIATION'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'JOINED'

type JoiningRisk = 'LOW' | 'MEDIUM' | 'HIGH'

interface Offer {
  id: string
  applicationId: string
  application?: {
    id: string
    candidate?: { id: string; name: string }
    role?: { id: string; title: string }
  }
  offeredSalary?: string | number
  offerDate?: string
  expectedJoiningDate?: string
  noticePeriod?: string
  documentsPending?: string[]
  notes?: string
  status: OfferStatus
  joiningRisk?: JoiningRisk
  confirmedJoiningDate?: string
}

interface Application {
  id: string
  candidateId: string
  candidate?: {
    id: string
    name: string
    email?: string | null
    phone?: string | null
    address?: string | null
  }
  role?: { id: string; title: string }
}

// ── Constants ──────────────────────────────────────────────────────────────

const CAN_MANAGE = new Set(['ADMIN', 'HR'])

const ALL_STATUSES: OfferStatus[] = [
  'TO_BE_PREPARED',
  'SENT',
  'UNDER_NEGOTIATION',
  'ACCEPTED',
  'REJECTED',
  'JOINED',
]

const STATUS_ACTION_ITEMS = [
  { value: '', label: 'Set status…' },
  ...ALL_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, ' ') })),
]

const STATUS_FILTER_ITEMS = [
  { value: '', label: 'All statuses' },
  ...ALL_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, ' ') })),
]

const JOINING_RISK_ITEMS = [
  { value: '', label: 'Not set' },
  { value: 'LOW', label: 'LOW' },
  { value: 'MEDIUM', label: 'MEDIUM' },
  { value: 'HIGH', label: 'HIGH' },
]

const STATUS_VARIANT: Record<OfferStatus, BadgeVariant> = {
  TO_BE_PREPARED: 'default',
  SENT: 'info',
  UNDER_NEGOTIATION: 'warning',
  ACCEPTED: 'success',
  REJECTED: 'danger',
  JOINED: 'purple',
}

const RISK_VARIANT: Record<JoiningRisk, BadgeVariant> = {
  LOW: 'success',
  MEDIUM: 'warning',
  HIGH: 'danger',
}

function fmtDate(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString()
}

function toDateInput(iso?: string): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

// ── Create Offer Modal ─────────────────────────────────────────────────────

interface CreateOfferModalProps {
  open: boolean
  onClose: () => void
  onCreated: (downloadError?: string) => void
}

function CreateOfferModal({ open, onClose, onCreated }: CreateOfferModalProps) {
  const [appSearch, setAppSearch] = useState('')
  const [selectedAppId, setSelectedAppId] = useState('')
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null)
  const [candidateEmail, setCandidateEmail] = useState('')
  const [candidatePhone, setCandidatePhone] = useState('')
  const [candidateAddress, setCandidateAddress] = useState('')
  const [offeredSalary, setOfferedSalary] = useState('')
  const [offerDate, setOfferDate] = useState('')
  const [expectedJoiningDate, setExpectedJoiningDate] = useState('')
  const [noticePeriod, setNoticePeriod] = useState('')
  const [documentsPending, setDocumentsPending] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: applications } = useApiQuery<Application[]>(
    ['applications', 'picker', appSearch],
    `/applications${appSearch ? `?q=${encodeURIComponent(appSearch)}` : ''}`
  )

  const reset = () => {
    setAppSearch('')
    setSelectedAppId('')
    setSelectedApplication(null)
    setCandidateEmail('')
    setCandidatePhone('')
    setCandidateAddress('')
    setOfferedSalary('')
    setOfferDate('')
    setExpectedJoiningDate('')
    setNoticePeriod('')
    setDocumentsPending('')
    setNotes('')
    setError(null)
  }

  const handleClose = () => { reset(); onClose() }

  const handleSubmit = async () => {
    if (!selectedAppId) { setError('Select an application.'); return }
    if (!candidateEmail.trim()) { setError('Enter the candidate email.'); return }
    if (!candidatePhone.trim()) { setError('Enter the candidate contact number.'); return }
    if (!candidateAddress.trim()) { setError('Enter the candidate residential address.'); return }
    if (!offeredSalary || Number(offeredSalary) <= 0) { setError('Enter a positive annual CTC.'); return }
    if (!expectedJoiningDate) { setError('Enter the expected joining date.'); return }
    const noticeDays = Number(noticePeriod)
    if (!noticePeriod.trim() || !Number.isInteger(noticeDays) || noticeDays < 0) {
      setError('Enter the notice period as a non-negative whole number of days.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const application = selectedApplication
      if (!application) throw new Error('Selected application could not be found.')

      await apiSend(`/candidates/${application.candidateId}`, 'PUT', {
        email: candidateEmail.trim(),
        phone: candidatePhone.trim(),
        address: candidateAddress.trim(),
      })
      const createdOffer = await apiSend<{ id: string }>('/offers', 'POST', {
        applicationId: selectedAppId,
        offeredSalary: Number(offeredSalary),
        offerDate: offerDate || undefined,
        expectedJoiningDate,
        noticePeriod: `${noticeDays} days`,
        documentsPending: documentsPending
          ? documentsPending.split(',').map((s) => s.trim()).filter(Boolean)
          : undefined,
        notes: notes.trim() || undefined,
      })
      reset()
      const safeName =
        (application.candidate?.name ?? 'candidate')
          .replace(/[^a-z0-9]+/gi, '-')
          .replace(/^-+|-+$/g, '') || 'candidate'
      const safeRole =
        (application.role?.title ?? 'role')
          .replace(/[^a-z0-9]+/gi, '-')
          .replace(/^-+|-+$/g, '') || 'role'
      try {
        await apiDownload(
          `/offers/${createdOffer.id}/offer-letter.pdf`,
          `${safeName}-${safeRole}-Offer-Letter.pdf`,
        )
        onCreated()
      } catch (downloadError: unknown) {
        onCreated(
          `Offer created, but the PDF could not be downloaded: ${
            downloadError instanceof Error
              ? downloadError.message
              : 'Unknown download error'
          }. Use Download Offer Letter to try again.`,
        )
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create offer.')
      setSaving(false)
    }
  }

  const applicationItems = [
    { value: '', label: 'Choose an application…' },
    ...(applications ?? []).map((a) => ({
      value: a.id,
      label: `${a.candidate?.name ?? a.candidateId} — ${a.role?.title ?? ''}`,
    })),
  ]
  const handleApplicationChange = (applicationId: string) => {
    setSelectedAppId(applicationId)
    const application = applications?.find((item) => item.id === applicationId)
    setSelectedApplication(application ?? null)
    setCandidateEmail(application?.candidate?.email ?? '')
    setCandidatePhone(application?.candidate?.phone ?? '')
    setCandidateAddress(application?.candidate?.address ?? '')
  }

  return (
    <Modal open={open} onClose={handleClose} title="Create Offer" className="max-w-2xl">
      <div className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <Field label="Search Application" htmlFor="offer-app-search">
          <Input
            id="offer-app-search"
            value={appSearch}
            onChange={(e) => setAppSearch(e.target.value)}
            placeholder="Search by candidate name…"
          />
        </Field>

        <Field label="Application" htmlFor="offer-app-select" required>
          <Select
            items={applicationItems}
            value={selectedAppId}
            onValueChange={(value) => handleApplicationChange(value ?? '')}
          >
            <SelectTrigger id="offer-app-select" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {applicationItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Candidate Email" htmlFor="offer-candidate-email" required>
            <Input
              id="offer-candidate-email"
              type="email"
              value={candidateEmail}
              onChange={(e) => setCandidateEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Candidate Contact" htmlFor="offer-candidate-phone" required>
            <Input
              id="offer-candidate-phone"
              type="tel"
              value={candidatePhone}
              onChange={(e) => setCandidatePhone(e.target.value)}
              required
            />
          </Field>
        </div>

        <Field label="Candidate Residential Address" htmlFor="offer-candidate-address" required>
          <Textarea
            id="offer-candidate-address"
            value={candidateAddress}
            onChange={(e) => setCandidateAddress(e.target.value)}
            placeholder="Full residential address"
            rows={2}
            required
          />
        </Field>

        <Field
          label="Annual CTC (INR)"
          htmlFor="offer-salary"
          required
          hint="Monthly amount in the offer letter is calculated as annual CTC ÷ 12."
        >
          <Input
            id="offer-salary"
            type="number"
            min="1"
            step="1000"
            value={offeredSalary}
            onChange={(e) => setOfferedSalary(e.target.value)}
            placeholder="e.g. 80000"
            required
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Offer Date" htmlFor="offer-date">
            <Input
              id="offer-date"
              type="date"
              value={offerDate}
              onChange={(e) => setOfferDate(e.target.value)}
            />
          </Field>
          <Field label="Expected Joining Date" htmlFor="offer-joining-date" required>
            <Input
              id="offer-joining-date"
              type="date"
              value={expectedJoiningDate}
              onChange={(e) => setExpectedJoiningDate(e.target.value)}
              required
            />
          </Field>
        </div>

        <Field label="Notice Period (days)" htmlFor="offer-notice" required>
          <Input
            id="offer-notice"
            type="number"
            min="0"
            step="1"
            value={noticePeriod}
            onChange={(e) => setNoticePeriod(e.target.value)}
            placeholder="e.g. 30"
            required
          />
        </Field>

        <Field
          label="Documents Pending"
          htmlFor="offer-docs"
          hint="Comma-separated list, e.g. Degree Certificate, ID Proof"
        >
          <Input
            id="offer-docs"
            value={documentsPending}
            onChange={(e) => setDocumentsPending(e.target.value)}
            placeholder="Degree Certificate, ID Proof…"
          />
        </Field>

        <Field label="Notes" htmlFor="offer-notes">
          <Textarea
            id="offer-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any additional notes…"
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={saving}>
            Create Offer
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Edit Offer Modal ───────────────────────────────────────────────────────

interface EditOfferModalProps {
  open: boolean
  offer: Offer
  onClose: () => void
  onSaved: () => void
}

function EditOfferModal({ open, offer, onClose, onSaved }: EditOfferModalProps) {
  const [joiningRisk, setJoiningRisk] = useState<JoiningRisk | ''>(offer.joiningRisk ?? '')
  const [confirmedJoiningDate, setConfirmedJoiningDate] = useState(
    toDateInput(offer.confirmedJoiningDate)
  )
  const [documentsPending, setDocumentsPending] = useState(
    (offer.documentsPending ?? []).join(', ')
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClose = () => { setError(null); onClose() }

  const handleSubmit = async () => {
    setSaving(true)
    setError(null)
    try {
      await apiSend(`/offers/${offer.id}`, 'PUT', {
        joiningRisk: joiningRisk || undefined,
        confirmedJoiningDate: confirmedJoiningDate || undefined,
        documentsPending: documentsPending
          ? documentsPending.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
      })
      onSaved()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update offer.')
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Edit Offer Details">
      <div className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <Field label="Joining Risk" htmlFor="edit-risk">
          <Select
            items={JOINING_RISK_ITEMS}
            value={joiningRisk}
            onValueChange={(value) => setJoiningRisk((value ?? '') as JoiningRisk | '')}
          >
            <SelectTrigger id="edit-risk" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {JOINING_RISK_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Confirmed Joining Date" htmlFor="edit-confirmed-date">
          <Input
            id="edit-confirmed-date"
            type="date"
            value={confirmedJoiningDate}
            onChange={(e) => setConfirmedJoiningDate(e.target.value)}
          />
        </Field>

        <Field
          label="Documents Pending"
          htmlFor="edit-docs"
          hint="Comma-separated list"
        >
          <Input
            id="edit-docs"
            value={documentsPending}
            onChange={(e) => setDocumentsPending(e.target.value)}
            placeholder="Degree Certificate, ID Proof…"
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={saving}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Offer Row ──────────────────────────────────────────────────────────────

interface OfferRowProps {
  offer: Offer
  canManage: boolean
  onRefresh: () => void
}

function OfferRow({ offer, canManage, onRefresh }: OfferRowProps) {
  const queryClient = useQueryClient()
  const [showEdit, setShowEdit] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [downloadingLetter, setDownloadingLetter] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const candidateName =
    offer.application?.candidate?.name ?? offer.applicationId
  const roleTitle = offer.application?.role?.title ?? '—'

  const handleStatusChange = async (status: string) => {
    if (!status) return
    setUpdatingStatus(true)
    try {
      await apiSend(`/offers/${offer.id}/status`, 'PUT', { status })
      await queryClient.invalidateQueries({ queryKey: ['offers'] })
      await queryClient.invalidateQueries({ queryKey: ['joining'] })
    } catch {
      // surface via re-render
    } finally {
      setUpdatingStatus(false)
    }
  }

  const handleEditSaved = () => {
    queryClient.invalidateQueries({ queryKey: ['offers'] })
    queryClient.invalidateQueries({ queryKey: ['joining'] })
    onRefresh()
  }

  const handleDownloadLetter = async () => {
    setDownloadingLetter(true)
    setDownloadError(null)
    try {
      const safeName =
        candidateName.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') ||
        'candidate'
      const safeRole =
        roleTitle.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') ||
        'role'
      await apiDownload(
        `/offers/${offer.id}/offer-letter.pdf`,
        `${safeName}-${safeRole}-Offer-Letter.pdf`,
      )
    } catch (e: unknown) {
      setDownloadError(
        e instanceof Error ? e.message : 'Failed to download the offer letter.',
      )
    } finally {
      setDownloadingLetter(false)
    }
  }

  return (
    <>
      <Tr>
        <Td className="font-medium">{candidateName}</Td>
        <Td>{roleTitle}</Td>
        <Td>
          {offer.offeredSalary != null
            ? Number.isFinite(Number(offer.offeredSalary))
              ? Number(offer.offeredSalary).toLocaleString('en-IN')
              : offer.offeredSalary
            : '—'}
        </Td>
        <Td>
          <Badge variant={STATUS_VARIANT[offer.status] ?? 'default'}>
            {offer.status.replace(/_/g, ' ')}
          </Badge>
        </Td>
        <Td className="whitespace-nowrap">{fmtDate(offer.offerDate)}</Td>
        <Td className="whitespace-nowrap">{fmtDate(offer.expectedJoiningDate)}</Td>
        <Td>
          {offer.joiningRisk ? (
            <Badge variant={RISK_VARIANT[offer.joiningRisk]}>
              {offer.joiningRisk}
            </Badge>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          )}
        </Td>
        <Td>
          {canManage && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownloadLetter}
                loading={downloadingLetter}
                disabled={downloadingLetter}
                className="text-xs"
              >
                Download PDF
              </Button>
              <Select
                items={STATUS_ACTION_ITEMS}
                value=""
                onValueChange={(value) => handleStatusChange(value ?? '')}
                disabled={updatingStatus}
              >
                <SelectTrigger className="text-xs py-1 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_ACTION_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowEdit(true)}
                className="text-xs"
              >
                Edit
              </Button>
            </div>
          )}
        </Td>
      </Tr>
      {downloadError && (
        <Tr>
          <Td colSpan={8}>
            <div className="text-xs text-red-600 dark:text-red-300">
              {downloadError}
            </div>
          </Td>
        </Tr>
      )}

      {showEdit && (
        <EditOfferModal
          open={showEdit}
          offer={offer}
          onClose={() => setShowEdit(false)}
          onSaved={handleEditSaved}
        />
      )}
    </>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export function Offers() {
  const { me } = useAuth()
  const userRole = me?.role ?? ''
  const canManage = CAN_MANAGE.has(userRole)

  const [statusFilter, setStatusFilter] = useState<string>('')
  const [showCreate, setShowCreate] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const queryClient = useQueryClient()

  const path = statusFilter
    ? `/offers?status=${encodeURIComponent(statusFilter)}`
    : '/offers'

  const { data: offers, isLoading, error } = useApiQuery<Offer[]>(
    ['offers', statusFilter],
    path
  )

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['offers'] })
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-300">
        Failed to load offers: {error.message}
      </div>
    )
  }

  const list = offers ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Offers"
        subtitle={`${list.length} offer${list.length !== 1 ? 's' : ''}`}
        actions={
          <div className="flex items-center gap-3">
            <Select
              items={STATUS_FILTER_ITEMS}
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value ?? '')}
            >
              <SelectTrigger className="w-52 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTER_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canManage && (
              <Button
                onClick={() => {
                  setCreateError(null)
                  setShowCreate(true)
                }}
              >
                Create Offer
              </Button>
            )}
          </div>
        }
      />

      {createError && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {createError}
        </div>
      )}

      {list.length === 0 ? (
        <EmptyState
          title="No offers"
          description={
            statusFilter
              ? `No offers with status "${statusFilter.replace(/_/g, ' ')}".`
              : 'No offers have been created yet.'
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <Thead>
                <Tr>
                  <Th>Candidate</Th>
                  <Th>Role</Th>
                  <Th>Annual CTC (INR)</Th>
                  <Th>Status</Th>
                  <Th>Offer Date</Th>
                  <Th>Expected Joining</Th>
                  <Th>Joining Risk</Th>
                  <Th>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {list.map((offer) => (
                  <OfferRow
                    key={offer.id}
                    offer={offer}
                    canManage={canManage}
                    onRefresh={handleRefresh}
                  />
                ))}
              </Tbody>
            </Table>
          </CardContent>
        </Card>
      )}

      {canManage && (
        <CreateOfferModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onCreated={(downloadError) => {
            setShowCreate(false)
            setCreateError(downloadError ?? null)
            handleRefresh()
          }}
        />
      )}
    </div>
  )
}
