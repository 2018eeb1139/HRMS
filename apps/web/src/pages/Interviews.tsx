import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { useApiQuery } from "../api/hooks";
import { apiGet, apiSend } from "../api/client";
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
} from "../components/ui";
import type { BadgeVariant } from "../components/ui";
import {
  MultiSelect,
  MultiSelectContent,
  MultiSelectGroup,
  MultiSelectItem,
  MultiSelectTrigger,
  MultiSelectValue,
} from "../components/ui/multi-select";

// ── Types ──────────────────────────────────────────────────────────────────

type InterviewStatus =
  | "SCHEDULED"
  | "COMPLETED"
  | "RESCHEDULED"
  | "CANCELLED"
  | "CANDIDATE_NO_SHOW"
  | "INTERVIEWER_NO_SHOW";

interface Interviewer {
  id: string;
  name?: string;
  email?: string;
}

interface Application {
  id: string;
  candidateId: string;
  candidate?: { id: string; name: string };
  currentStage?: { key: string; label: string };
  role?: { id: string; title: string };
}

interface Interview {
  id: string;
  applicationId: string;
  application?: Application;
  interviewers?: Interviewer[];
  stageKey?: string;
  scheduledAt: string;
  durationMin?: number;
  meetingLink?: string;
  status: InterviewStatus;
}

interface User {
  id: string;
  name?: string;
  email: string;
  role: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const CAN_SCHEDULE = new Set(["ADMIN", "HR", "HIRING_MANAGER"]);

const STATUS_VARIANT: Record<InterviewStatus, BadgeVariant> = {
  SCHEDULED: "info",
  COMPLETED: "success",
  RESCHEDULED: "warning",
  CANCELLED: "default",
  CANDIDATE_NO_SHOW: "danger",
  INTERVIEWER_NO_SHOW: "danger",
};

const ALL_STATUSES: InterviewStatus[] = [
  "SCHEDULED",
  "COMPLETED",
  "RESCHEDULED",
  "CANCELLED",
  "CANDIDATE_NO_SHOW",
  "INTERVIEWER_NO_SHOW",
];

const STATUS_ACTION_ITEMS = [
  { value: "", label: "Set status…" },
  ...ALL_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
];

const STATUS_FILTER_ITEMS = [
  { value: "", label: "All statuses" },
  ...ALL_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
];

// convert datetime-local string → ISO string
function toISO(local: string): string {
  if (!local) return "";
  return new Date(local).toISOString();
}

// convert ISO → datetime-local value
function toLocalInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Schedule Interview Modal ───────────────────────────────────────────────

interface ScheduleModalProps {
  open: boolean;
  onClose: () => void;
  onScheduled: () => void;
  meRole: string;
  meId: string;
}

function ScheduleModal({
  open,
  onClose,
  onScheduled,
  meRole,
  meId,
}: ScheduleModalProps) {
  const [appSearch, setAppSearch] = useState("");
  const [selectedAppId, setSelectedAppId] = useState("");
  const [interviewerIds, setInterviewerIds] = useState<string[]>([]);
  const [stageKey, setStageKey] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [durationMin, setDurationMin] = useState("60");
  const [meetingLink, setMeetingLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestingSlots, setSuggestingSlots] = useState(false);
  const [suggestedSlots, setSuggestedSlots] = useState<string[]>([]);

  const canSelectInterviewers = ["ADMIN", "HR", "HIRING_MANAGER"].includes(
    meRole,
  );

  const { data: applications } = useApiQuery<Application[]>(
    ["applications", "picker", appSearch],
    `/applications${appSearch ? `?q=${encodeURIComponent(appSearch)}` : ""}`,
  );

  const { data: users, error: usersError } = useApiQuery<User[]>(
    ["users", "picker"],
    "/users",
    { enabled: open && canSelectInterviewers },
  );

  const reset = () => {
    setAppSearch("");
    setSelectedAppId("");
    setInterviewerIds([]);
    setStageKey("");
    setScheduledAt("");
    setDurationMin("60");
    setMeetingLink("");
    setError(null);
    setSuggestedSlots([]);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const resolvedInterviewerIds = (): string[] => {
    return interviewerIds.length > 0 ? interviewerIds : [meId];
  };

  const handleSuggestSlots = async () => {
    const ids = resolvedInterviewerIds();
    if (ids.length === 0) {
      setError("Enter at least one interviewer ID.");
      return;
    }
    setSuggestingSlots(true);
    setError(null);
    try {
      const now = new Date();
      const from = now.toISOString();
      const to = new Date(
        now.getTime() + 7 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const slots = await apiSend<string[]>(
        "/interviews/suggest-slots",
        "POST",
        {
          interviewerIds: ids,
          fromISO: from,
          toISO: to,
          durationMin: parseInt(durationMin, 10) || 60,
        },
      );
      setSuggestedSlots(Array.isArray(slots) ? slots : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to suggest slots.");
    } finally {
      setSuggestingSlots(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedAppId) {
      setError("Select an application.");
      return;
    }
    if (!scheduledAt) {
      setError("Pick a date and time.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiSend("/interviews", "POST", {
        applicationId: selectedAppId,
        interviewerIds: resolvedInterviewerIds(),
        stageKey: stageKey.trim() || undefined,
        scheduledAt: toISO(scheduledAt),
        durationMin: parseInt(durationMin, 10) || 60,
        meetingLink: meetingLink.trim() || undefined,
      });
      reset();
      onScheduled();
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Failed to schedule interview.",
      );
      setSaving(false);
    }
  };

  const applicationItems = [
    { value: "", label: "Choose an application…" },
    ...(applications ?? []).map((a) => ({
      value: a.id,
      label: `${a.candidate?.name ?? a.candidateId} — ${a.role?.title ?? ""}`,
    })),
  ];

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Schedule Interview"
      className="max-w-2xl"
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Application picker */}
        <Field label="Search Application" htmlFor="sched-app-search">
          <Input
            id="sched-app-search"
            value={appSearch}
            onChange={(e) => setAppSearch(e.target.value)}
            placeholder="Search by candidate name…"
          />
        </Field>
        <Field label="Application" htmlFor="sched-app-select" required>
          <Select
            items={applicationItems}
            value={selectedAppId}
            onValueChange={(value) => setSelectedAppId(value ?? "")}
          >
            <SelectTrigger id="sched-app-select" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {applicationItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {/* Interviewers */}
        {canSelectInterviewers ? (
          <Field
            label="Interviewers"
            htmlFor="sched-interviewers"
            hint="Select one or more interviewers. Leave blank to assign yourself."
          >
            <MultiSelect
              values={interviewerIds}
              onValuesChange={setInterviewerIds}
            >
              <MultiSelectTrigger id="sched-interviewers" className="w-full">
                <MultiSelectValue placeholder="Select interviewers…" />
              </MultiSelectTrigger>
              <MultiSelectContent
                search={{
                  placeholder: "Search interviewers…",
                  emptyMessage: "No interviewers found.",
                }}
              >
                <MultiSelectGroup>
                  {(users ?? [])
                    .filter((u) =>
                      [
                        "INTERVIEWER",
                        "HIRING_MANAGER",
                        "PROJECT_MANAGER",
                      ].includes(u.role),
                    )
                    .map((u) => (
                      <MultiSelectItem
                        key={u.id}
                        value={u.id}
                        badgeLabel={u.name ?? u.email}
                      >
                        <span className="flex w-full items-center justify-between gap-3">
                          <span>{u.name ?? u.email}</span>
                          <Badge variant="default">{u.role}</Badge>
                        </span>
                      </MultiSelectItem>
                    ))}
                </MultiSelectGroup>
              </MultiSelectContent>
            </MultiSelect>
            {usersError && (
              <p role="alert" className="text-xs text-destructive">
                Failed to load interviewers: {usersError.message}
              </p>
            )}
          </Field>
        ) : (
          <Field
            label="Interviewers"
            htmlFor="sched-interviewers"
            hint="You will be assigned as the interviewer."
          >
            <Input id="sched-interviewers" value="You" readOnly />
          </Field>
        )}

        {/* Stage */}
        <Field label="Stage Key (optional)" htmlFor="sched-stage">
          <Input
            id="sched-stage"
            value={stageKey}
            onChange={(e) => setStageKey(e.target.value)}
            placeholder="e.g. TECHNICAL_1"
          />
        </Field>

        {/* Duration */}
        <Field label="Duration (minutes)" htmlFor="sched-duration">
          <Input
            id="sched-duration"
            type="number"
            min="15"
            step="15"
            value={durationMin}
            onChange={(e) => setDurationMin(e.target.value)}
          />
        </Field>

        {/* Date-time + suggest slots */}
        <Field label="Scheduled At" htmlFor="sched-datetime" required>
          <div className="space-y-2">
            <Input
              id="sched-datetime"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleSuggestSlots}
              loading={suggestingSlots}
              disabled={suggestingSlots}
            >
              Suggest Available Slots
            </Button>
            {suggestedSlots.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  Click a slot to select it:
                </p>
                <div className="flex flex-wrap gap-2">
                  {suggestedSlots.slice(0, 8).map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setScheduledAt(toLocalInput(slot))}
                      className="px-2 py-1 text-xs rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-400 dark:border-indigo-800 dark:hover:bg-indigo-900 transition-colors"
                    >
                      {new Date(slot).toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Field>

        {/* Meeting link */}
        <Field label="Meeting Link (optional)" htmlFor="sched-link">
          <Input
            id="sched-link"
            type="url"
            value={meetingLink}
            onChange={(e) => setMeetingLink(e.target.value)}
            placeholder="https://meet.google.com/…"
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={saving}>
            Schedule
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Reschedule Modal ───────────────────────────────────────────────────────

interface RescheduleModalProps {
  open: boolean;
  interview: Interview;
  onClose: () => void;
  onRescheduled: () => void;
}

function RescheduleModal({
  open,
  interview,
  onClose,
  onRescheduled,
}: RescheduleModalProps) {
  const [scheduledAt, setScheduledAt] = useState(
    toLocalInput(interview.scheduledAt),
  );
  const [durationMin, setDurationMin] = useState(
    String(interview.durationMin ?? 60),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (!scheduledAt) {
      setError("Pick a date and time.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiSend(`/interviews/${interview.id}/reschedule`, "PUT", {
        scheduledAt: toISO(scheduledAt),
        durationMin: parseInt(durationMin, 10) || 60,
      });
      onRescheduled();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to reschedule.");
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Reschedule Interview">
      <div className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
        <Field
          label="New Date &amp; Time"
          htmlFor="reschedule-datetime"
          required
        >
          <Input
            id="reschedule-datetime"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        </Field>
        <Field label="Duration (minutes)" htmlFor="reschedule-duration">
          <Input
            id="reschedule-duration"
            type="number"
            min="15"
            step="15"
            value={durationMin}
            onChange={(e) => setDurationMin(e.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={saving}>
            Reschedule
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Cancel Confirm Modal ───────────────────────────────────────────────────

interface CancelModalProps {
  open: boolean;
  interview: Interview;
  onClose: () => void;
  onCancelled: () => void;
}

function CancelModal({
  open,
  interview,
  onClose,
  onCancelled,
}: CancelModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCancel = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiSend(`/interviews/${interview.id}/cancel`, "POST", {});
      onCancelled();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to cancel interview.");
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Cancel Interview">
      <div className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
        <p className="text-sm text-foreground">
          Are you sure you want to cancel this interview scheduled for{" "}
          <span className="font-medium">
            {new Date(interview.scheduledAt).toLocaleString()}
          </span>
          ?
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Keep
          </Button>
          <Button variant="destructive" onClick={handleCancel} loading={saving}>
            Cancel Interview
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Interview Row ──────────────────────────────────────────────────────────

interface InterviewRowProps {
  interview: Interview;
  canManage: boolean;
  onFeedback: (interviewId: string) => void;
  onRefresh: () => void;
}

function InterviewRow({
  interview,
  canManage,
  onFeedback,
  onRefresh,
}: InterviewRowProps) {
  const queryClient = useQueryClient();
  const [showReschedule, setShowReschedule] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const candidateName =
    interview.application?.candidate?.name ??
    interview.application?.candidateId ??
    interview.applicationId;

  const stageLabel =
    interview.application?.currentStage?.label ?? interview.stageKey ?? "—";

  const interviewerNames =
    (interview.interviewers ?? [])
      .map((i) => i.name ?? i.email ?? i.id)
      .join(", ") || "—";

  const isFinal =
    interview.status === "CANCELLED" ||
    interview.status === "COMPLETED" ||
    interview.status === "CANDIDATE_NO_SHOW" ||
    interview.status === "INTERVIEWER_NO_SHOW";

  const handleStatusChange = async (status: string) => {
    if (!status) return;
    setUpdatingStatus(true);
    try {
      await apiSend(`/interviews/${interview.id}/status`, "PUT", { status });
      await queryClient.invalidateQueries({ queryKey: ["interviews"] });
    } catch {
      // silently surface via table re-render
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <>
      <Tr>
        <Td className="font-medium">{candidateName}</Td>
        <Td>{stageLabel}</Td>
        <Td className="whitespace-nowrap">
          {new Date(interview.scheduledAt).toLocaleString()}
        </Td>
        <Td>{interview.durationMin ?? 60} min</Td>
        <Td className="max-w-[160px] truncate">{interviewerNames}</Td>
        <Td>
          <Badge variant={STATUS_VARIANT[interview.status] ?? "default"}>
            {interview.status.replace(/_/g, " ")}
          </Badge>
        </Td>
        <Td>
          {interview.meetingLink ? (
            <a
              href={interview.meetingLink}
              target="_blank"
              rel="noreferrer"
              className="text-indigo-600 hover:underline text-xs"
            >
              Join
            </a>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          )}
        </Td>
        <Td>
          <div className="flex items-center gap-2">
            {/* Status change */}
            {!isFinal && (
              <Select
                items={STATUS_ACTION_ITEMS}
                value=""
                onValueChange={(value) => handleStatusChange(value ?? "")}
                disabled={updatingStatus}
              >
                <SelectTrigger className="text-xs py-1 w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_ACTION_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {/* Reschedule / Cancel (ADMIN/HR/HM only) */}
            {canManage && !isFinal && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowReschedule(true)}
                  className="text-xs"
                >
                  Reschedule
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setShowCancel(true)}
                  className="text-xs"
                >
                  Cancel
                </Button>
              </>
            )}
            {/* Feedback link */}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onFeedback(interview.id)}
              className="text-xs text-indigo-600"
            >
              Feedback
            </Button>
          </div>
        </Td>
      </Tr>

      {showReschedule && (
        <RescheduleModal
          open={showReschedule}
          interview={interview}
          onClose={() => setShowReschedule(false)}
          onRescheduled={() => {
            queryClient.invalidateQueries({ queryKey: ["interviews"] });
            onRefresh();
          }}
        />
      )}

      {showCancel && (
        <CancelModal
          open={showCancel}
          interview={interview}
          onClose={() => setShowCancel(false)}
          onCancelled={() => {
            queryClient.invalidateQueries({ queryKey: ["interviews"] });
            onRefresh();
          }}
        />
      )}
    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export function Interviews() {
  const { me } = useAuth();
  const userRole = me?.role ?? "";
  const canManage = CAN_SCHEDULE.has(userRole);

  const [statusFilter, setStatusFilter] = useState<string>("");
  const [showSchedule, setShowSchedule] = useState(false);
  const [feedbackInterviewId, setFeedbackInterviewId] = useState<string | null>(
    null,
  );

  const queryClient = useQueryClient();

  const path = statusFilter
    ? `/interviews?status=${encodeURIComponent(statusFilter)}`
    : "/interviews";

  const {
    data: interviews,
    isLoading,
    error,
  } = useApiQuery<Interview[]>(["interviews", statusFilter], path);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["interviews"] });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-300">
        Failed to load interviews: {error.message}
      </div>
    );
  }

  const list = interviews ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Interviews"
        subtitle={`${list.length} interview${list.length !== 1 ? "s" : ""}`}
        actions={
          <div className="flex items-center gap-3">
            <Select
              items={STATUS_FILTER_ITEMS}
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value ?? "")}
            >
              <SelectTrigger className="w-48 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTER_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canManage && (
              <Button onClick={() => setShowSchedule(true)}>
                Schedule Interview
              </Button>
            )}
          </div>
        }
      />

      {list.length === 0 ? (
        <EmptyState
          title="No interviews"
          description={
            statusFilter
              ? `No interviews with status "${statusFilter.replace(/_/g, " ")}".`
              : "No interviews scheduled yet."
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <Thead>
                <Tr>
                  <Th>Candidate</Th>
                  <Th>Stage</Th>
                  <Th>Scheduled At</Th>
                  <Th>Duration</Th>
                  <Th>Interviewers</Th>
                  <Th>Status</Th>
                  <Th>Meeting</Th>
                  <Th>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {list.map((iv) => (
                  <InterviewRow
                    key={iv.id}
                    interview={iv}
                    canManage={canManage}
                    onFeedback={(id) => setFeedbackInterviewId(id)}
                    onRefresh={handleRefresh}
                  />
                ))}
              </Tbody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Schedule modal */}
      {canManage && (
        <ScheduleModal
          open={showSchedule}
          onClose={() => setShowSchedule(false)}
          onScheduled={() => {
            setShowSchedule(false);
            handleRefresh();
          }}
          meRole={userRole}
          meId={me?.id ?? ""}
        />
      )}

      {/* Feedback form triggered from row */}
      {feedbackInterviewId && (
        <FeedbackFormModal
          open={true}
          interviewId={feedbackInterviewId}
          onClose={() => setFeedbackInterviewId(null)}
          onSubmitted={() => {
            setFeedbackInterviewId(null);
            handleRefresh();
          }}
        />
      )}
    </div>
  );
}

// ── Inline Feedback Form Modal (imported from Feedback page logic) ──────────
// Declared here so Interviews page can open it without circular imports.

interface FeedbackTemplate {
  id: string;
  name: string;
  ratingScaleMax: number;
  fields: Array<{
    key: string;
    label: string;
    type: "rating" | "text";
    weight?: number;
    mandatory?: boolean;
  }>;
}

type Recommendation =
  | "STRONG_HIRE"
  | "HIRE"
  | "HOLD"
  | "REJECT"
  | "CONSIDER_OTHER_ROLE";

const RECOMMENDATIONS: Recommendation[] = [
  "STRONG_HIRE",
  "HIRE",
  "HOLD",
  "REJECT",
  "CONSIDER_OTHER_ROLE",
];

const RECOMMENDATION_ITEMS = [
  { value: "", label: "Select recommendation…" },
  ...RECOMMENDATIONS.map((r) => ({ value: r, label: r.replace(/_/g, " ") })),
];

const OVERALL_SCORE_ITEMS = [
  { value: "", label: "Select…" },
  ...Array.from({ length: 10 }, (_, i) => i + 1).map((n) => ({
    value: String(n),
    label: String(n),
  })),
];

interface FeedbackFormModalProps {
  open: boolean;
  interviewId: string;
  onClose: () => void;
  onSubmitted: () => void;
}

export function FeedbackFormModal({
  open,
  interviewId,
  onClose,
  onSubmitted,
}: FeedbackFormModalProps) {
  const queryClient = useQueryClient();
  const [scores, setScores] = useState<Record<string, string>>({});
  const [strengths, setStrengths] = useState("");
  const [concerns, setConcerns] = useState("");
  const [notes, setNotes] = useState("");
  const [recommendation, setRecommendation] = useState<Recommendation | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);

  const { data: templates, isLoading: loadingTemplates } = useApiQuery<
    FeedbackTemplate[]
  >(["feedback-templates"], "/config/feedback-templates");

  const template = (templates ?? [])[0] ?? null;

  const handleScoreChange = (key: string, value: string) => {
    setScores((prev) => ({ ...prev, [key]: value }));
  };

  const handleClose = () => {
    setScores({});
    setStrengths("");
    setConcerns("");
    setNotes("");
    setRecommendation("");
    setError(null);
    setAlreadySubmitted(false);
    onClose();
  };

  const handleSubmit = async () => {
    if (!recommendation) {
      setError("Select a recommendation.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const parsedScores: Record<string, number | string> = {};
      for (const [key, val] of Object.entries(scores)) {
        const num = Number(val);
        parsedScores[key] = isNaN(num) ? val : num;
      }
      await apiSend("/feedback", "POST", {
        interviewId,
        templateId: template?.id,
        scores: parsedScores,
        strengths: strengths.trim() || undefined,
        concerns: concerns.trim() || undefined,
        notes: notes.trim() || undefined,
        recommendation,
      });
      queryClient.invalidateQueries({ queryKey: ["feedback"] });
      handleClose();
      onSubmitted();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to submit feedback.";
      if (msg.includes("409") || msg.toLowerCase().includes("already")) {
        setAlreadySubmitted(true);
        setError("Feedback has already been submitted for this interview.");
      } else {
        setError(msg);
      }
      setSaving(false);
    }
  };

  const ratingItems = [
    { value: "", label: "Select rating…" },
    ...Array.from(
      { length: template?.ratingScaleMax ?? 0 },
      (_, i) => i + 1,
    ).map((n) => ({
      value: String(n),
      label: String(n),
    })),
  ];

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Submit Feedback"
      className="max-w-2xl"
    >
      <div className="space-y-4">
        {error && (
          <div
            className={`rounded-md border px-3 py-2 text-sm ${alreadySubmitted ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/40 dark:border-amber-800 dark:text-amber-300" : "bg-red-50 border-red-200 text-red-700 dark:bg-red-900/40 dark:border-red-800 dark:text-red-300"}`}
          >
            {error}
          </div>
        )}

        {alreadySubmitted ? (
          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={handleClose}>
              Close
            </Button>
          </div>
        ) : (
          <>
            {loadingTemplates ? (
              <div className="flex justify-center py-4">
                <Spinner />
              </div>
            ) : template ? (
              /* Template-driven fields */
              template.fields.map((field) => (
                <Field
                  key={field.key}
                  label={field.label}
                  htmlFor={`score-${field.key}`}
                  required={field.mandatory}
                >
                  {field.type === "rating" ? (
                    <Select
                      items={ratingItems}
                      value={scores[field.key] ?? ""}
                      onValueChange={(value) =>
                        handleScoreChange(field.key, value ?? "")
                      }
                    >
                      <SelectTrigger
                        id={`score-${field.key}`}
                        className="w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ratingItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id={`score-${field.key}`}
                      value={scores[field.key] ?? ""}
                      onChange={(e) =>
                        handleScoreChange(field.key, e.target.value)
                      }
                      placeholder={`Enter ${field.label.toLowerCase()}…`}
                    />
                  )}
                </Field>
              ))
            ) : (
              /* Default form when no template */
              <Field label="Overall Rating (1-10)" htmlFor="score-overall">
                <Select
                  items={OVERALL_SCORE_ITEMS}
                  value={scores["overall"] ?? ""}
                  onValueChange={(value) =>
                    handleScoreChange("overall", value ?? "")
                  }
                >
                  <SelectTrigger id="score-overall" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OVERALL_SCORE_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}

            <Field label="Strengths" htmlFor="fb-strengths">
              <Input
                id="fb-strengths"
                value={strengths}
                onChange={(e) => setStrengths(e.target.value)}
                placeholder="Key strengths observed…"
              />
            </Field>
            <Field label="Concerns" htmlFor="fb-concerns">
              <Input
                id="fb-concerns"
                value={concerns}
                onChange={(e) => setConcerns(e.target.value)}
                placeholder="Concerns or gaps…"
              />
            </Field>
            <Field label="Notes" htmlFor="fb-notes">
              <Input
                id="fb-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes…"
              />
            </Field>
            <Field label="Recommendation" htmlFor="fb-recommendation" required>
              <Select
                items={RECOMMENDATION_ITEMS}
                value={recommendation}
                onValueChange={(value) =>
                  setRecommendation((value ?? "") as Recommendation)
                }
              >
                <SelectTrigger id="fb-recommendation" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECOMMENDATION_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={handleClose} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} loading={saving}>
                Submit Feedback
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
