import { useApiQuery } from '../api/hooks'
import {
  PageHeader,
  Badge,
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

interface JoiningRow {
  offerId: string
  candidateName: string
  roleTitle: string
  projectName?: string
  joiningDate?: string
  offerStatus: OfferStatus
  documentsPending: string[]
  joiningRisk?: JoiningRisk
}

// ── Constants ──────────────────────────────────────────────────────────────

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

// ── Page ───────────────────────────────────────────────────────────────────

export function Joining() {
  const { data: rows, isLoading, error } = useApiQuery<JoiningRow[]>(
    ['joining'],
    '/offers/tracking/joining'
  )

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
        Failed to load joining tracker: {error.message}
      </div>
    )
  }

  // Sort by joiningDate ascending (nulls last)
  const list = [...(rows ?? [])].sort((a, b) => {
    if (!a.joiningDate && !b.joiningDate) return 0
    if (!a.joiningDate) return 1
    if (!b.joiningDate) return -1
    return new Date(a.joiningDate).getTime() - new Date(b.joiningDate).getTime()
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Joining Tracker"
        subtitle={`${list.length} candidate${list.length !== 1 ? 's' : ''} in onboarding pipeline`}
      />

      {list.length === 0 ? (
        <EmptyState
          title="No joining records"
          description="Candidates with accepted offers will appear here."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <Thead>
                <Tr>
                  <Th>Candidate</Th>
                  <Th>Role</Th>
                  <Th>Project</Th>
                  <Th>Joining Date</Th>
                  <Th>Offer Status</Th>
                  <Th>Documents Pending</Th>
                  <Th>Joining Risk</Th>
                </Tr>
              </Thead>
              <Tbody>
                {list.map((row) => (
                  <Tr key={row.offerId}>
                    <Td className="font-medium">{row.candidateName}</Td>
                    <Td>{row.roleTitle}</Td>
                    <Td>{row.projectName ?? '—'}</Td>
                    <Td className="whitespace-nowrap">{fmtDate(row.joiningDate)}</Td>
                    <Td>
                      <Badge variant={STATUS_VARIANT[row.offerStatus] ?? 'default'}>
                        {row.offerStatus.replace(/_/g, ' ')}
                      </Badge>
                    </Td>
                    <Td>
                      {(row.documentsPending ?? []).length === 0 ? (
                        <span className="text-green-600 text-xs font-medium">All clear</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {row.documentsPending.map((doc) => (
                            <Badge key={doc} variant="warning">
                              {doc}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </Td>
                    <Td>
                      {row.joiningRisk ? (
                        <Badge variant={RISK_VARIANT[row.joiningRisk]}>
                          {row.joiningRisk}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
