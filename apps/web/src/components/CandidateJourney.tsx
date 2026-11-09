import { useState } from "react";
import type React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { useApiQuery } from "../api/hooks";
import { apiDownload, apiSend, apiGet } from "../api/client";
import {
  Badge,
  Spinner,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Modal,
  Field,
  Input,
  Textarea,
} from "./ui";
import type { BadgeVariant } from "./ui";
import { FeedbackFormModal } from "../pages/Interviews";
import {
  MultiSelect,
  MultiSelectContent,
  MultiSelectGroup,
  MultiSelectItem,
  MultiSelectTrigger,
  MultiSelectValue,
} from "./ui/multi-select";
import type {
  CandidateJourney as CandidateJourneyData,
  JourneyInterview,
  JourneyFeedback,
  JourneyOffer,
} from "@picode-hr/shared";

// ── Props ──────────────────────────────────────────────────────────────────

interface CandidateJourneyProps {
  applicationId: string;
  onChanged?: () => void;
}

// ── Role gates ─────────────────────────────────────────────────────────────

const CAN_MANAGE = new Set(["ADMIN", "HR", "HIRING_MANAGER"]);
const CAN_INTERVIEW = new Set(["ADMIN", "HR", "HIRING_MANAGER", "INTERVIEWER"]);

// ── Badge helpers ──────────────────────────────────────────────────────────

const APP_STATUS_VARIANT: Record<string, BadgeVariant> = {
  ACTIVE: "info",
  REJECTED: "danger",
  WITHDRAWN: "default",
  HIRED: "success",
  ON_HOLD: "warning",
};

const INTERVIEW_STATUS_VARIANT: Record<string, BadgeVariant> = {
  SCHEDULED: "info",
  COMPLETED: "success",
  CANCELLED: "danger",
  NO_SHOW: "warning",
  RESCHEDULED: "warning",
  CANDIDATE_NO_SHOW: "warning",
  INTERVIEWER_NO_SHOW: "warning",
};

const RECOMMENDATION_VARIANT: Record<string, BadgeVariant> = {
  STRONG_YES: "success",
  YES: "success",
  MAYBE: "warning",
  NO: "danger",
  STRONG_NO: "danger",
  STRONG_HIRE: "success",
  HIRE: "success",
  HOLD: "warning",
  REJECT: "danger",
  CONSIDER_OTHER_ROLE: "warning",
};

const POSITIVE_INTERVIEW_RECOMMENDATIONS = new Set(["HIRE", "STRONG_HIRE"]);

function isInterviewRoundCleared(
  interviews: JourneyInterview[],
  stageKey: string,
) {
  const roundInterviews = interviews.filter(
    (interview) => interview.stageKey === stageKey,
  );

  return (
    roundInterviews.length > 0 &&
    roundInterviews.every(
      (interview) =>
        interview.status === "COMPLETED" &&
        interview.feedback.length > 0 &&
        interview.feedback.every((feedback) =>
          POSITIVE_INTERVIEW_RECOMMENDATIONS.has(feedback.recommendation),
        ),
    )
  );
}

const OFFER_STATUS_VARIANT: Record<string, BadgeVariant> = {
  TO_BE_PREPARED: "default",
  SENT: "info",
  UNDER_NEGOTIATION: "warning",
  ACCEPTED: "success",
  REJECTED: "danger",
  JOINED: "success",
  PENDING: "info",
  EXTENDED: "info",
  DECLINED: "danger",
  REVOKED: "danger",
  EXPIRED: "default",
};

const ALL_OFFER_STATUSES = [
  "TO_BE_PREPARED",
  "SENT",
  "UNDER_NEGOTIATION",
  "ACCEPTED",
  "REJECTED",
  "JOINED",
] as const;

const INTERVIEW_CHANGEABLE_STATUSES = [
  "SCHEDULED",
  "COMPLETED",
  "CANDIDATE_NO_SHOW",
  "INTERVIEWER_NO_SHOW",
] as const;

const JOINING_RISK_ITEMS = [
  { value: "", label: "Not set" },
  { value: "LOW", label: "LOW" },
  { value: "MEDIUM", label: "MEDIUM" },
  { value: "HIGH", label: "HIGH" },
];

const INTERVIEW_STATUS_ACTION_ITEMS = [
  { value: "", label: "Set status…" },
  ...INTERVIEW_CHANGEABLE_STATUSES.map((s) => ({
    value: s,
    label: s.replace(/_/g, " "),
  })),
];

const OFFER_STATUS_ACTION_ITEMS = [
  { value: "", label: "Set status…" },
  ...ALL_OFFER_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
];

// ── Date helpers ───────────────────────────────────────────────────────────

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString();
}

function fmtDateOnly(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

function toISO(local: string): string {
  if (!local) return "";
  return new Date(local).toISOString();
}

function toDateInput(iso?: string | Date | null): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

function toLocalInput(iso: string | Date): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Inline error box ───────────────────────────────────────────────────────

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-300">
      {msg}
    </div>
  );
}

// ── Stage types ────────────────────────────────────────────────────────────

interface Stage {
  key: string;
  label: string;
  order: number;
}

interface User {
  id: string;
  name?: string;
  email: string;
  role: string;
}

// ── Step rail ─────────────────────────────────────────────────────────────

type StepStatus = "done" | "current" | "pending";

interface StepProps {
  status: StepStatus;
  isLast?: boolean;
  children: React.ReactNode;
}

function Step({ status, isLast = false, children }: StepProps) {
  const dotColor =
    status === "done"
      ? "bg-indigo-600 border-indigo-600"
      : status === "current"
        ? "bg-card border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-800"
        : "bg-card border-border";

  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div
          className={`w-3 h-3 rounded-full border-2 shrink-0 mt-1 ${dotColor}`}
        />
        {!isLast && (
          <div
            className={`w-0.5 flex-1 mt-1 min-h-6 ${
              status === "done" ? "bg-indigo-600" : "bg-muted"
            }`}
          />
        )}
      </div>
      <div className={`pb-6 flex-1 min-w-0 ${isLast ? "" : ""}`}>
        {children}
      </div>
    </div>
  );
}

// ── Section heading ────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
      {children}
    </p>
  );
}

// ── Reject modal ───────────────────────────────────────────────────────────

interface RejectModalProps {
  open: boolean;
  applicationId: string;
  onClose: () => void;
  onRejected: () => void;
}

function RejectModal({
  open,
  applicationId,
  onClose,
  onRejected,
}: RejectModalProps) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setReason("");
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (!reason.trim()) {
      setError("Reason is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiSend(`/applications/${applicationId}/reject`, "POST", {
        reason: reason.trim(),
      });
      handleClose();
      onRejected();
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Failed to reject application.",
      );
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Reject Application">
      <div className="space-y-4">
        {error && <ErrorBox msg={error} />}
        <Field label="Reason" htmlFor="reject-reason" required>
          <Textarea
            id="reject-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Describe the reason for rejection…"
            rows={3}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleSubmit} loading={saving}>
            Reject
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Schedule Interview Modal (compact, application-scoped) ─────────────────

interface ScheduleInterviewModalProps {
  open: boolean;
  applicationId: string;
  initialStageKey: string;
  meId: string;
  meRole: string;
  onClose: () => void;
  onScheduled: () => void;
}

function ScheduleInterviewModal({
  open,
  applicationId,
  initialStageKey,
  meId,
  meRole,
  onClose,
  onScheduled,
}: ScheduleInterviewModalProps) {
  const canSelectInterviewers = ["ADMIN", "HR", "HIRING_MANAGER"].includes(
    meRole,
  );
  const [interviewerIds, setInterviewerIds] = useState<string[]>([]);
  const [stageKey, setStageKey] = useState(initialStageKey);
  const [scheduledAt, setScheduledAt] = useState("");
  const [durationMin, setDurationMin] = useState("60");
  const [meetingLink, setMeetingLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestingSlots, setSuggestingSlots] = useState(false);
  const [suggestedSlots, setSuggestedSlots] = useState<string[]>([]);

  const { data: users, error: usersError } = useApiQuery<User[]>(
    ["users", "picker"],
    "/users",
    { enabled: open && canSelectInterviewers },
  );

  const reset = () => {
    setInterviewerIds([]);
    setStageKey(initialStageKey);
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

  const resolvedIds = (): string[] => {
    return interviewerIds.length > 0 ? interviewerIds : [meId];
  };

  const handleSuggestSlots = async () => {
    const ids = resolvedIds();
    setSuggestingSlots(true);
    setError(null);
    try {
      const now = new Date();
      const slots = await apiSend<string[]>(
        "/interviews/suggest-slots",
        "POST",
        {
          interviewerIds: ids,
          fromISO: now.toISOString(),
          toISO: new Date(
            now.getTime() + 7 * 24 * 60 * 60 * 1000,
          ).toISOString(),
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
    if (!scheduledAt) {
      setError("Pick a date and time.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiSend("/interviews", "POST", {
        applicationId,
        interviewerIds: resolvedIds(),
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

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Schedule Interview"
      className="max-w-xl"
    >
      <div className="space-y-4">
        {error && <ErrorBox msg={error} />}

        {/* Interviewers */}
        {canSelectInterviewers ? (
          <Field
            label="Interviewers"
            htmlFor="si-interviewers"
            hint="Select one or more interviewers. Leave blank to assign yourself."
          >
            <MultiSelect
              values={interviewerIds}
              onValuesChange={setInterviewerIds}
            >
              <MultiSelectTrigger id="si-interviewers" className="w-full">
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
                      ["INTERVIEWER", "HIRING_MANAGER"].includes(u.role),
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
            htmlFor="si-interviewers"
            hint="You will be assigned as the interviewer."
          >
            <Input
              id="si-interviewers"
              value="You"
              readOnly
            />
          </Field>
        )}

        <Field label="Stage Key (optional)" htmlFor="si-stage">
          <Input
            id="si-stage"
            value={stageKey}
            onChange={(e) => setStageKey(e.target.value)}
            placeholder="e.g. TECHNICAL_1"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Duration (min)" htmlFor="si-duration">
            <Input
              id="si-duration"
              type="number"
              min="15"
              step="15"
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value)}
            />
          </Field>
          <Field label="Meeting Link" htmlFor="si-link">
            <Input
              id="si-link"
              type="url"
              value={meetingLink}
              onChange={(e) => setMeetingLink(e.target.value)}
              placeholder="https://meet.google.com/…"
            />
          </Field>
        </div>

        <Field label="Scheduled At" htmlFor="si-datetime" required>
          <div className="space-y-2">
            <Input
              id="si-datetime"
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
                <div className="flex flex-wrap gap-1.5">
                  {suggestedSlots.slice(0, 6).map((slot) => (
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

// ── Make Offer Modal ───────────────────────────────────────────────────────

interface MakeOfferModalProps {
  open: boolean;
  applicationId: string;
  candidateId: string;
  candidateEmail: string | null;
  candidatePhone: string | null;
  candidateAddress: string | null;
  candidateName: string;
  roleTitle: string;
  onClose: () => void;
  onCreated: (downloadError?: string) => void;
}

function MakeOfferModal({
  open,
  applicationId,
  candidateId,
  candidateEmail,
  candidatePhone,
  candidateAddress,
  candidateName,
  roleTitle,
  onClose,
  onCreated,
}: MakeOfferModalProps) {
  const [email, setEmail] = useState(candidateEmail ?? "");
  const [phone, setPhone] = useState(candidatePhone ?? "");
  const [offeredSalary, setOfferedSalary] = useState("");
  const [expectedJoiningDate, setExpectedJoiningDate] = useState("");
  const [noticePeriod, setNoticePeriod] = useState("");
  const [address, setAddress] = useState(candidateAddress ?? "");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setEmail(candidateEmail ?? "");
    setPhone(candidatePhone ?? "");
    setOfferedSalary("");
    setExpectedJoiningDate("");
    setNoticePeriod("");
    setAddress(candidateAddress ?? "");
    setNotes("");
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!offeredSalary || Number(offeredSalary) <= 0) {
      setError("Enter a positive annual CTC.");
      return;
    }
    if (!expectedJoiningDate) {
      setError("Enter the expected joining date.");
      return;
    }
    if (!email.trim()) {
      setError("Enter the candidate's email address.");
      return;
    }
    if (!phone.trim()) {
      setError("Enter the candidate's contact number.");
      return;
    }
    const noticeDays = Number(noticePeriod);
    if (!noticePeriod.trim() || !Number.isInteger(noticeDays) || noticeDays < 0) {
      setError("Enter the notice period as a non-negative whole number of days.");
      return;
    }
    if (!address.trim()) {
      setError("Enter the candidate's full residential address.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await apiSend(`/candidates/${candidateId}`, "PUT", {
        email: email.trim(),
        phone: phone.trim(),
        address: address.trim(),
      });
      const createdOffer = await apiSend<{ id: string }>("/offers", "POST", {
        applicationId,
        offeredSalary: Number(offeredSalary),
        expectedJoiningDate,
        noticePeriod: `${noticeDays} days`,
        notes: notes.trim() || undefined,
      });
      reset();
      const safeName =
        candidateName.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") ||
        "candidate";
      const safeRole =
        roleTitle.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") ||
        "role";
      try {
        await apiDownload(
          `/offers/${createdOffer.id}/offer-letter.pdf`,
          `${safeName}-${safeRole}-Offer-Letter.pdf`,
        );
        onCreated();
      } catch (downloadError: unknown) {
        onCreated(
          `Offer created, but the PDF could not be downloaded: ${
            downloadError instanceof Error
              ? downloadError.message
              : "Unknown download error"
          }. Use Download Offer Letter to try again.`,
        );
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create offer.");
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Make Offer">
      <div className="space-y-4">
        {error && <ErrorBox msg={error} />}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Candidate Email" htmlFor="mo-email" required>
            <Input
              id="mo-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="candidate@example.com"
              required
            />
          </Field>
          <Field label="Candidate Contact" htmlFor="mo-phone" required>
            <Input
              id="mo-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              required
            />
          </Field>
        </div>
        <Field
          label="Annual CTC (INR)"
          htmlFor="mo-salary"
          required
          hint="Monthly amount in the offer letter is calculated as annual CTC ÷ 12."
        >
          <Input
            id="mo-salary"
            type="number"
            min="1"
            step="1000"
            value={offeredSalary}
            onChange={(e) => setOfferedSalary(e.target.value)}
            placeholder="e.g. 80000"
            required
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Expected Joining Date" htmlFor="mo-joining" required>
            <Input
              id="mo-joining"
              type="date"
              value={expectedJoiningDate}
              onChange={(e) => setExpectedJoiningDate(e.target.value)}
              required
            />
          </Field>
          <Field label="Notice Period (days)" htmlFor="mo-notice" required>
            <Input
              id="mo-notice"
              type="number"
              min="0"
              step="1"
              value={noticePeriod}
              onChange={(e) => setNoticePeriod(e.target.value)}
              placeholder="e.g. 30"
              required
            />
          </Field>
        </div>
        <Field
          label="Candidate Residential Address"
          htmlFor="mo-address"
          required
          hint="Saved to the candidate profile and included in the offer letter."
        >
          <Textarea
            id="mo-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Full residential address"
            rows={3}
            required
          />
        </Field>
        <Field label="Notes" htmlFor="mo-notes">
          <Textarea
            id="mo-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any additional notes…"
            rows={3}
          />
        </Field>
        <p className="text-xs text-muted-foreground italic">
          Note: Setting status to ACCEPTED or JOINED will automatically update
          the campaign headcount/funnel.
        </p>
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
  );
}

// ── Edit Offer Modal (journey-scoped) ──────────────────────────────────────

interface EditOfferModalProps {
  open: boolean;
  offer: JourneyOffer;
  onClose: () => void;
  onSaved: () => void;
}

function EditOfferModal({
  open,
  offer,
  onClose,
  onSaved,
}: EditOfferModalProps) {
  const [joiningRisk, setJoiningRisk] = useState<string>(
    offer.joiningRisk ?? "",
  );
  const [confirmedJoiningDate, setConfirmedJoiningDate] = useState(
    toDateInput(offer.confirmedJoiningDate),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiSend(`/offers/${offer.id}`, "PUT", {
        joiningRisk: joiningRisk || undefined,
        confirmedJoiningDate: confirmedJoiningDate || undefined,
      });
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update offer.");
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Edit Offer">
      <div className="space-y-4">
        {error && <ErrorBox msg={error} />}
        <Field label="Joining Risk" htmlFor="eo-risk">
          <Select
            items={JOINING_RISK_ITEMS}
            value={joiningRisk}
            onValueChange={(value) => setJoiningRisk(value ?? "")}
          >
            <SelectTrigger id="eo-risk" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {JOINING_RISK_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Confirmed Joining Date" htmlFor="eo-confirmed">
          <Input
            id="eo-confirmed"
            type="date"
            value={confirmedJoiningDate}
            onChange={(e) => setConfirmedJoiningDate(e.target.value)}
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
  );
}

// ── Reschedule modal (journey-scoped) ──────────────────────────────────────

interface RescheduleModalProps {
  open: boolean;
  interview: JourneyInterview;
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
        {error && <ErrorBox msg={error} />}
        <Field label="New Date &amp; Time" htmlFor="rs-datetime" required>
          <Input
            id="rs-datetime"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        </Field>
        <Field label="Duration (minutes)" htmlFor="rs-duration">
          <Input
            id="rs-duration"
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

// ── CV step ────────────────────────────────────────────────────────────────

interface CvStepProps {
  journey: CandidateJourneyData;
  canManage: boolean;
  onRefresh: () => void;
}

function CvStep({ journey, canManage, onRefresh }: CvStepProps) {
  const queryClient = useQueryClient();
  const { candidate, application } = journey;

  const [screening, setScreening] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [advanceError, setAdvanceError] = useState<string | null>(null);
  const [showReject, setShowReject] = useState(false);

  const hasScreening = application.matchScore != null;

  const { data: stages } = useApiQuery<Stage[]>(["stages"], "/config/stages");
  const sortedStages = [...(stages ?? [])].sort((a, b) => a.order - b.order);
  const currentStageIndex = sortedStages.findIndex(
    (stage) => stage.key === journey.currentStage?.key,
  );
  const nextStage =
    currentStageIndex >= 0 ? sortedStages[currentStageIndex + 1] : undefined;

  const handleScreen = async () => {
    setScreening(true);
    setScreenError(null);
    try {
      await apiSend(`/applications/${application.id}/screen`, "POST", {});
      await queryClient.invalidateQueries({
        queryKey: ["journey", application.id],
      });
      onRefresh();
    } catch (e: unknown) {
      setScreenError(e instanceof Error ? e.message : "AI screen failed.");
    } finally {
      setScreening(false);
    }
  };

  const handleAdvance = async (toStageKey: string) => {
    if (!toStageKey) return;
    setAdvancing(true);
    setAdvanceError(null);
    try {
      await apiSend(`/applications/${application.id}/stage`, "PUT", {
        toStageKey,
      });
      await queryClient.invalidateQueries({
        queryKey: ["journey", application.id],
      });
      onRefresh();
    } catch (e: unknown) {
      setAdvanceError(
        e instanceof Error ? e.message : "Failed to advance stage.",
      );
    } finally {
      setAdvancing(false);
    }
  };

  const isTerminal =
    application.status === "REJECTED" ||
    application.status === "HIRED" ||
    application.status === "WITHDRAWN";

  return (
    <Step status={hasScreening ? "done" : "current"}>
      <SectionTitle>Candidate Profile</SectionTitle>
      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <p className="font-semibold text-foreground text-sm">
              {candidate.name}
            </p>
            {(candidate.currentRole || candidate.currentCompany) && (
              <p className="text-xs text-muted-foreground">
                {[candidate.currentRole, candidate.currentCompany]
                  .filter(Boolean)
                  .join(" @ ")}
              </p>
            )}
          </div>
          <Badge variant={APP_STATUS_VARIANT[application.status] ?? "default"}>
            {application.status}
          </Badge>
        </div>

        {candidate.skills.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {candidate.skills.map((sk) => (
              <Badge key={sk} variant="default">
                {sk}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {candidate.email && <span>{candidate.email}</span>}
          {candidate.location && <span>{candidate.location}</span>}
          {candidate.yearsExperience != null && (
            <span>{candidate.yearsExperience} yrs exp</span>
          )}
        </div>

        <div className="flex gap-3 flex-wrap">
          {candidate.cvUrl && (
            <a
              href={candidate.cvUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium underline"
            >
              View CV
            </a>
          )}
          {candidate.linkedinUrl && (
            <a
              href={candidate.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium underline"
            >
              LinkedIn
            </a>
          )}
        </div>

        {application.matchScore != null && (
          <div className="flex items-center gap-2 pt-1 border-t border-border">
            <Badge
              variant={
                application.matchScore >= 70
                  ? "success"
                  : application.matchScore >= 40
                    ? "warning"
                    : "danger"
              }
            >
              {application.matchScore}% match
            </Badge>
            {application.hrRecommendation && (
              <Badge
                variant={
                  RECOMMENDATION_VARIANT[application.hrRecommendation] ??
                  "default"
                }
              >
                {application.hrRecommendation.replace(/_/g, " ")}
              </Badge>
            )}
          </div>
        )}

        {application.screeningSummary && (
          <div className="pt-1 border-t border-border">
            <p className="text-xs text-muted-foreground font-medium mb-0.5">
              Screening Summary
            </p>
            <p className="text-xs text-foreground leading-relaxed">
              {application.screeningSummary}
            </p>
          </div>
        )}

        {/* ── Actions (manage-gated) ── */}
        {canManage && !isTerminal && (
          <div className="pt-2 border-t border-border space-y-2">
            {screenError && <ErrorBox msg={screenError} />}
            {advanceError && <ErrorBox msg={advanceError} />}

            <div className="flex flex-wrap items-center gap-2">
              {/* AI Screen */}
              <Button
                size="sm"
                variant="outline"
                onClick={handleScreen}
                loading={screening}
                disabled={screening}
              >
                Run AI Screen
              </Button>

              {hasScreening && nextStage && nextStage.key !== "AI_SCREENING" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAdvance(nextStage.key)}
                  loading={advancing}
                  disabled={advancing}
                >
                  Move to {nextStage.label}
                </Button>
              )}

              {/* Reject */}
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setShowReject(true)}
              >
                Reject
              </Button>
            </div>
          </div>
        )}
      </div>

      {showReject && (
        <RejectModal
          open={showReject}
          applicationId={application.id}
          onClose={() => setShowReject(false)}
          onRejected={() => {
            queryClient.invalidateQueries({
              queryKey: ["journey", application.id],
            });
            onRefresh();
          }}
        />
      )}
    </Step>
  );
}

// ── Interview step ─────────────────────────────────────────────────────────

interface InterviewStepProps {
  interview: JourneyInterview;
  applicationId: string;
  index: number;
  isLast: boolean;
  canManage: boolean;
  canInterview: boolean;
  onRefresh: () => void;
}

function feedbackBlock(fb: JourneyFeedback) {
  return (
    <div
      key={fb.id}
      className="rounded-md border border-border bg-muted px-2.5 py-2 space-y-1 text-xs"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={RECOMMENDATION_VARIANT[fb.recommendation] ?? "default"}>
          {fb.recommendation.replace(/_/g, " ")}
        </Badge>
        <span className="text-muted-foreground">
          {fmtDateOnly(fb.submittedAt)}
        </span>
      </div>
      {fb.strengths && (
        <p className="text-green-700">
          <span className="font-medium">Strengths:</span> {fb.strengths}
        </p>
      )}
      {fb.concerns && (
        <p className="text-amber-700">
          <span className="font-medium">Concerns:</span> {fb.concerns}
        </p>
      )}
      {fb.notes && <p className="text-muted-foreground italic">{fb.notes}</p>}
    </div>
  );
}

function InterviewStep({
  interview,
  applicationId,
  index,
  isLast,
  canManage,
  canInterview,
  onRefresh,
}: InterviewStepProps) {
  const queryClient = useQueryClient();
  const [showFeedback, setShowFeedback] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const label = interview.stageKey
    ? interview.stageKey.replace(/_/g, " ")
    : `Interview ${index + 1}`;

  const isFinal =
    interview.status === "COMPLETED" ||
    interview.status === "CANCELLED" ||
    interview.status === "CANDIDATE_NO_SHOW" ||
    interview.status === "INTERVIEWER_NO_SHOW";

  const isDone =
    interview.status === "COMPLETED" ||
    interview.status === "CANCELLED" ||
    interview.status === "NO_SHOW" ||
    interview.status === "CANDIDATE_NO_SHOW" ||
    interview.status === "INTERVIEWER_NO_SHOW";

  const invalidateAll = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["journey", applicationId],
    });
    onRefresh();
  };

  const handleStatusChange = async (status: string) => {
    if (!status) return;
    setUpdatingStatus(true);
    setActionError(null);
    try {
      await apiSend(`/interviews/${interview.id}/status`, "PUT", { status });
      await invalidateAll();
    } catch (e: unknown) {
      setActionError(
        e instanceof Error ? e.message : "Failed to update status.",
      );
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    setActionError(null);
    try {
      await apiSend(`/interviews/${interview.id}/cancel`, "POST", {});
      await invalidateAll();
    } catch (e: unknown) {
      setActionError(
        e instanceof Error ? e.message : "Failed to cancel interview.",
      );
      setCancelling(false);
    }
  };

  return (
    <Step status={isDone ? "done" : "current"} isLast={isLast}>
      <SectionTitle>{label}</SectionTitle>
      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant={INTERVIEW_STATUS_VARIANT[interview.status] ?? "default"}
          >
            {interview.status}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {fmtDate(interview.scheduledAt)}
          </span>
          {interview.durationMin > 0 && (
            <span className="text-xs text-muted-foreground">
              {interview.durationMin} min
            </span>
          )}
        </div>

        {interview.interviewers.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Interviewers:{" "}
            {interview.interviewers.map((iv) => iv.name).join(", ")}
          </p>
        )}

        {interview.meetingLink && (
          <a
            href={interview.meetingLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-indigo-600 hover:text-indigo-800 underline"
          >
            Meeting link
          </a>
        )}

        {interview.feedback.length > 0 && (
          <div className="space-y-2 pt-1 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground">
              Feedback
            </p>
            {interview.feedback.map((fb) => feedbackBlock(fb))}
          </div>
        )}

        {/* ── Per-interview actions ── */}
        {canInterview && (
          <div className="pt-2 border-t border-border space-y-2">
            {actionError && <ErrorBox msg={actionError} />}
            <div className="flex flex-wrap items-center gap-2">
              {/* Feedback */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowFeedback(true)}
              >
                Log Feedback
              </Button>

              {/* Status change */}
              {!isFinal && (
                <Select
                  items={INTERVIEW_STATUS_ACTION_ITEMS}
                  value=""
                  onValueChange={(value) => handleStatusChange(value ?? "")}
                  disabled={updatingStatus}
                >
                  <SelectTrigger className="text-xs py-1 w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERVIEW_STATUS_ACTION_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Reschedule / Cancel (manage-only) */}
              {canManage && !isFinal && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowReschedule(true)}
                  >
                    Reschedule
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleCancel}
                    loading={cancelling}
                    disabled={cancelling}
                  >
                    Cancel
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {showFeedback && (
        <FeedbackFormModal
          open={showFeedback}
          interviewId={interview.id}
          onClose={() => setShowFeedback(false)}
          onSubmitted={() => {
            setShowFeedback(false);
            invalidateAll();
          }}
        />
      )}

      {showReschedule && (
        <RescheduleModal
          open={showReschedule}
          interview={interview}
          onClose={() => setShowReschedule(false)}
          onRescheduled={() => {
            setShowReschedule(false);
            invalidateAll();
          }}
        />
      )}
    </Step>
  );
}

// ── Offer step ─────────────────────────────────────────────────────────────

interface OfferStepProps {
  journey: CandidateJourneyData;
  isLast: boolean;
  canManage: boolean;
  onRefresh: () => void;
}

function OfferStep({ journey, isLast, canManage, onRefresh }: OfferStepProps) {
  const queryClient = useQueryClient();
  const { offer, application } = journey;
  const canMakeOffer =
    isInterviewRoundCleared(journey.interviews, "TECH_INTERVIEW") &&
    isInterviewRoundCleared(journey.interviews, "HM_INTERVIEW");

  const [showMake, setShowMake] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [downloadingOfferLetter, setDownloadingOfferLetter] = useState(false);
  const [offerError, setOfferError] = useState<string | null>(null);

  const invalidateAll = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["journey", application.id],
    });
    onRefresh();
  };

  const handleStatusChange = async (status: string) => {
    if (!status || !offer) return;
    setUpdatingStatus(true);
    setOfferError(null);
    try {
      await apiSend(`/offers/${offer.id}/status`, "PUT", { status });
      await invalidateAll();
    } catch (e: unknown) {
      setOfferError(
        e instanceof Error ? e.message : "Failed to update offer status.",
      );
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleDownloadOfferLetter = async () => {
    if (!offer) return;
    setDownloadingOfferLetter(true);
    setOfferError(null);
    try {
      const safeName =
        journey.candidate.name
          .replace(/[^a-z0-9]+/gi, "-")
          .replace(/^-+|-+$/g, "") || "candidate";
      const safeRole =
        journey.role.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") ||
        "role";
      await apiDownload(
        `/offers/${offer.id}/offer-letter.pdf`,
        `${safeName}-${safeRole}-Offer-Letter.pdf`,
      );
    } catch (e: unknown) {
      setOfferError(
        e instanceof Error ? e.message : "Failed to download the offer letter.",
      );
    } finally {
      setDownloadingOfferLetter(false);
    }
  };

  if (!offer) {
    return (
      <Step status="pending" isLast={isLast}>
        <SectionTitle>Offer</SectionTitle>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground italic">No offer yet.</p>
          {canManage && (
            <>
              {offerError && <ErrorBox msg={offerError} />}
              <Button
                size="sm"
                variant="outline"
                disabled={!canMakeOffer}
                onClick={() => setShowMake(true)}
              >
                Make Offer
              </Button>
            </>
          )}
          {canManage && !canMakeOffer && (
            <p className="text-xs text-muted-foreground">
              Complete both interview rounds with positive feedback before
              making an offer.
            </p>
          )}
        </div>

        {showMake && (
          <MakeOfferModal
            open={showMake}
            applicationId={application.id}
            candidateId={journey.candidate.id}
            candidateEmail={journey.candidate.email}
            candidatePhone={journey.candidate.phone}
            candidateAddress={journey.candidate.address}
            candidateName={journey.candidate.name}
            roleTitle={journey.role.title}
            onClose={() => setShowMake(false)}
            onCreated={(downloadError) => {
              setShowMake(false);
              setOfferError(downloadError ?? null);
              invalidateAll();
            }}
          />
        )}
      </Step>
    );
  }

  const isDone =
    offer.status === "ACCEPTED" ||
    offer.status === "REJECTED" ||
    offer.status === "JOINED";

  return (
    <Step status={isDone ? "done" : "current"} isLast={isLast}>
      <SectionTitle>Offer</SectionTitle>
      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={OFFER_STATUS_VARIANT[offer.status] ?? "default"}>
            {offer.status.replace(/_/g, " ")}
          </Badge>
          {offer.offerDate && (
            <span className="text-xs text-muted-foreground">
              Issued: {fmtDateOnly(offer.offerDate)}
            </span>
          )}
        </div>

        {offer.offeredSalary && (
          <p className="text-sm font-semibold text-foreground">
            Annual CTC (INR):{" "}
            {Number.isFinite(Number(offer.offeredSalary))
              ? Number(offer.offeredSalary).toLocaleString("en-IN")
              : offer.offeredSalary}
          </p>
        )}

        <div className="text-xs text-muted-foreground space-y-0.5">
          {offer.expectedJoiningDate && (
            <p>
              Expected joining:{" "}
              <span className="text-foreground">
                {fmtDateOnly(offer.expectedJoiningDate)}
              </span>
            </p>
          )}
          {offer.confirmedJoiningDate && (
            <p>
              Confirmed joining:{" "}
              <span className="font-medium text-green-700">
                {fmtDateOnly(offer.confirmedJoiningDate)}
              </span>
            </p>
          )}
          {offer.joiningRisk && (
            <p className="text-amber-600">
              Risk: {offer.joiningRisk.replace(/_/g, " ")}
            </p>
          )}
        </div>

        {offer.notes && (
          <p className="text-xs text-muted-foreground italic border-t border-border pt-1">
            {offer.notes}
          </p>
        )}

        {canManage && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleDownloadOfferLetter}
            loading={downloadingOfferLetter}
            disabled={downloadingOfferLetter}
          >
            Download Offer Letter
          </Button>
        )}

        {/* ── Offer actions ── */}
        {canManage && (
          <div className="pt-2 border-t border-border space-y-2">
            {offerError && <ErrorBox msg={offerError} />}
            <div className="flex flex-wrap items-center gap-2">
              <Select
                items={OFFER_STATUS_ACTION_ITEMS}
                value=""
                onValueChange={(value) => handleStatusChange(value ?? "")}
                disabled={updatingStatus}
              >
                <SelectTrigger className="text-xs py-1 w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OFFER_STATUS_ACTION_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {updatingStatus && <Spinner size="sm" />}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowEdit(true)}
              >
                Edit
              </Button>
            </div>
            <p className="text-xs text-muted-foreground italic">
              ACCEPTED / JOINED auto-updates campaign headcount.
            </p>
          </div>
        )}
      </div>

      {showEdit && (
        <EditOfferModal
          open={showEdit}
          offer={offer}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            invalidateAll();
          }}
        />
      )}
    </Step>
  );
}

// ── Joining step ───────────────────────────────────────────────────────────

interface JoiningStepProps {
  journey: CandidateJourneyData;
}

function JoiningStep({ journey }: JoiningStepProps) {
  const { offer, application } = journey;
  const confirmedDate = offer?.confirmedJoiningDate;
  const isJoined = application.status === "HIRED" || offer?.status === "JOINED";

  return (
    <Step status={isJoined ? "done" : "pending"} isLast>
      <SectionTitle>Joining</SectionTitle>
      {isJoined ? (
        <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/40 dark:border-green-800 p-3 space-y-1">
          <Badge variant="success">Joined</Badge>
          {confirmedDate && (
            <p className="text-xs text-green-700 dark:text-green-300">
              Joined on {fmtDateOnly(confirmedDate)}
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">
          {confirmedDate
            ? `Scheduled for ${fmtDateOnly(confirmedDate)}`
            : "Not yet joined."}
        </p>
      )}
    </Step>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function CandidateJourney({
  applicationId,
  onChanged,
}: CandidateJourneyProps) {
  const { me } = useAuth();
  const queryClient = useQueryClient();
  const userRole = me?.role ?? "";
  const canManage = CAN_MANAGE.has(userRole);
  const canInterview = CAN_INTERVIEW.has(userRole);

  const {
    data: journey,
    isLoading,
    error,
  } = useApiQuery<CandidateJourneyData>(
    ["journey", applicationId],
    `/applications/${applicationId}/journey`,
  );

  // Called after any mutation — invalidates journey + bubbles up to RoleDetail
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["journey", applicationId] });
    onChanged?.();
  };

  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduledStageKey, setScheduledStageKey] = useState("TECH_INTERVIEW");

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size="md" />
      </div>
    );
  }

  if (error || !journey) {
    return (
      <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">
        Failed to load journey: {error?.message ?? "Not found"}
      </div>
    );
  }

  const sortedInterviews = [...journey.interviews].sort(
    (a, b) =>
      new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
  );
  const hasFirstInterview = sortedInterviews.length > 0;
  const hasSecondInterview = sortedInterviews.some(
    (interview) => interview.stageKey === "HM_INTERVIEW",
  );
  const canScheduleSecondInterview = isInterviewRoundCleared(
    journey.interviews,
    "TECH_INTERVIEW",
  );
  const matchScore = journey.application.matchScore;
  const canScheduleInterview =
    canManage && journey.application.status === "ACTIVE" && matchScore != null;

  return (
    <div className="pt-4 px-2">
      {/* Role context */}
      <p className="text-xs text-muted-foreground mb-4">
        Campaign:{" "}
        <span className="font-medium text-muted-foreground">
          {journey.role.title}
        </span>
        {journey.role.project && <> · {journey.role.project.name}</>}
        {journey.currentStage && (
          <>
            {" "}
            · Current stage:{" "}
            <span className="font-medium text-indigo-600">
              {journey.currentStage.label}
            </span>
          </>
        )}
      </p>

      <div>
        {/* Step 1: CV / Profile */}
        <CvStep
          journey={journey}
          canManage={canManage}
          onRefresh={handleRefresh}
        />

        {canScheduleInterview && !hasFirstInterview && (
          <Step status="pending">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setScheduledStageKey("TECH_INTERVIEW");
                setShowSchedule(true);
              }}
            >
              {matchScore >= 75
                ? "+ Schedule 1st Interview"
                : "+ Schedule 1st Interview (HR override)"}
            </Button>
          </Step>
        )}

        {/* Steps 2+: Interviews */}
        {sortedInterviews.map((interview, idx) => (
          <InterviewStep
            key={interview.id}
            interview={interview}
            applicationId={applicationId}
            index={idx}
            isLast={false}
            canManage={canManage}
            canInterview={canInterview}
            onRefresh={handleRefresh}
          />
        ))}

        {canScheduleInterview && hasFirstInterview && !hasSecondInterview && (
          <Step status="pending">
            <Button
              size="sm"
              variant="outline"
              disabled={!canScheduleSecondInterview}
              onClick={() => {
                setScheduledStageKey("HM_INTERVIEW");
                setShowSchedule(true);
              }}
            >
              + Schedule 2nd Interview
            </Button>
            {!canScheduleSecondInterview && (
              <p className="mt-2 text-xs text-muted-foreground">
                Complete the first interview round with positive feedback
                before scheduling the second interview.
              </p>
            )}
          </Step>
        )}

        {/* Offer step */}
        <OfferStep
          journey={journey}
          isLast={false}
          canManage={canManage}
          onRefresh={handleRefresh}
        />

        {/* Joining step */}
        <JoiningStep journey={journey} />
      </div>

      {/* Schedule Interview modal */}
      {showSchedule && (
        <ScheduleInterviewModal
          open={showSchedule}
          applicationId={applicationId}
          initialStageKey={scheduledStageKey}
          meId={me?.id ?? ""}
          meRole={userRole}
          onClose={() => setShowSchedule(false)}
          onScheduled={() => {
            setShowSchedule(false);
            handleRefresh();
          }}
        />
      )}
    </div>
  );
}
