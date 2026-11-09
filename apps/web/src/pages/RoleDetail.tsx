import { useRef, useState } from "react";
import type React from "react";
import { useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { useApiQuery, useApiMutation } from "../api/hooks";
import { apiSend, apiUpload, apiDownload } from "../api/client";
import {
  PageHeader,
  Button,
  Badge,
  Card,
  CardHeader,
  CardContent,
  Modal,
  Field,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  Input,
  Spinner,
  EmptyState,
} from "../components/ui";
import type { BadgeVariant } from "../components/ui";
import { CandidateJourney } from "../components/CandidateJourney";
import type { CampaignFunnel } from "@picode-hr/shared";

// ── Types ──────────────────────────────────────────────────────────────────

type RoleStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "OPEN"
  | "IN_PROGRESS"
  | "ON_HOLD"
  | "FILLED"
  | "CANCELLED"
  | "CLOSED";

type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface Role {
  id: string;
  title: string;
  status: RoleStatus;
  priority: Priority;
  requiredCount: number;
  filledCount: number;
  remainingCount: number;
  projectId?: string;
  project?: { id: string; name: string } | null;
  department?: { id: string; name: string } | null;
  seniority?: { id: string; name: string } | null;
  jobDescription?: string;
}

interface ApplicationRow {
  id: string;
  candidateId: string;
  currentStageId?: string | null;
  matchScore?: number | null;
  status: string;
}

interface Stage {
  key: string;
  label: string;
  order: number;
}

interface Candidate {
  id: string;
  name: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<RoleStatus, BadgeVariant> = {
  DRAFT: "default",
  PENDING_APPROVAL: "warning",
  OPEN: "info",
  IN_PROGRESS: "info",
  ON_HOLD: "warning",
  FILLED: "success",
  CANCELLED: "danger",
  CLOSED: "default",
};

const PRIORITY_VARIANT: Record<Priority, BadgeVariant> = {
  LOW: "default",
  MEDIUM: "info",
  HIGH: "warning",
  CRITICAL: "danger",
};

const STATUS_OPTIONS: RoleStatus[] = [
  "DRAFT",
  "PENDING_APPROVAL",
  "OPEN",
  "IN_PROGRESS",
  "ON_HOLD",
  "FILLED",
  "CANCELLED",
  "CLOSED",
];

const APP_STATUS_VARIANT: Record<string, BadgeVariant> = {
  ACTIVE: "info",
  REJECTED: "danger",
  WITHDRAWN: "default",
  HIRED: "success",
  ON_HOLD: "warning",
};

const CAN_MANAGE = new Set(["ADMIN", "HR", "HIRING_MANAGER"]);

const SOURCE_OPTIONS = [
  "HR_UPLOAD",
  "REFERRAL",
  "LINKEDIN",
  "JOB_PORTAL",
  "AGENCY",
  "DIRECT",
  "TALENT_POOL",
  "INTERNAL",
] as const;

const STATUS_ITEMS = STATUS_OPTIONS.map((s) => ({
  value: s,
  label: s.replace(/_/g, " "),
}));

const CLOSE_REASON_ITEMS = [
  { value: "", label: "Select a reason…" },
  { value: "FILLED", label: "Position Filled" },
  { value: "CANCELLED", label: "Position Cancelled" },
  { value: "BUDGET_CUT", label: "Budget Cut" },
  { value: "RESTRUCTURE", label: "Restructure" },
  { value: "OTHER", label: "Other" },
];

const SOURCE_ITEMS = [
  { value: "", label: "Select source…" },
  ...SOURCE_OPTIONS.map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
];

// ── Helpers ────────────────────────────────────────────────────────────────

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-4">
      <span className="w-36 shrink-0 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <span className="text-sm text-foreground">{value ?? "—"}</span>
    </div>
  );
}

function HeadcountBar({
  required,
  filled,
}: {
  required: number;
  filled: number;
}) {
  const pct =
    required > 0 ? Math.min(100, Math.round((filled / required) * 100)) : 0;
  const color =
    pct >= 100 ? "bg-green-500" : pct >= 50 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{filled} filled</span>
        <span>{required} required</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{pct}% complete</p>
    </div>
  );
}

// ── Change Status Modal ────────────────────────────────────────────────────

interface ChangeStatusModalProps {
  open: boolean;
  currentStatus: RoleStatus;
  roleId: string;
  onClose: () => void;
  onChanged: () => void;
}

function ChangeStatusModal({
  open,
  currentStatus,
  roleId,
  onClose,
  onChanged,
}: ChangeStatusModalProps) {
  const [newStatus, setNewStatus] = useState<RoleStatus>(currentStatus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useApiMutation<Role>(`/roles/${roleId}/status`, "PUT", [
    ["role", roleId],
    ["roles"],
  ]);

  const handleSave = async () => {
    if (newStatus === currentStatus) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await mutation.mutateAsync({ status: newStatus });
      onChanged();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update status.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Change Status">
      <div className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
        <Field label="New Status" htmlFor="status-select">
          <Select
            items={STATUS_ITEMS}
            value={newStatus}
            onValueChange={(value) => setNewStatus((value ?? "") as RoleStatus)}
          >
            <SelectTrigger id="status-select" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Close Role Modal ───────────────────────────────────────────────────────

interface CloseRoleModalProps {
  open: boolean;
  roleId: string;
  onClose: () => void;
  onClosed: () => void;
}

function CloseRoleModal({
  open,
  roleId,
  onClose,
  onClosed,
}: CloseRoleModalProps) {
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setReason("");
    setNotes("");
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
      await apiSend<Role>(`/roles/${roleId}/close`, "POST", {
        reason: reason.trim(),
        notes: notes.trim() || undefined,
      });
      handleClose();
      onClosed();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to close role.");
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Close Role">
      <div className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
        <Field label="Reason" htmlFor="close-reason" required>
          <Select
            items={CLOSE_REASON_ITEMS}
            value={reason}
            onValueChange={(value) => setReason(value ?? "")}
          >
            <SelectTrigger id="close-reason" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLOSE_REASON_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Notes" htmlFor="close-notes">
          <Textarea
            id="close-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional additional notes…"
            rows={3}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleSubmit} loading={saving}>
            Close Role
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Campaign Funnel component ──────────────────────────────────────────────

interface CampaignFunnelProps {
  roleId: string;
}

const FUNNEL_STEPS: Array<{
  key: keyof CampaignFunnel;
  label: string;
  accent: string;
}> = [
  {
    key: "peopleAdded",
    label: "People Added",
    accent: "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800",
  },
  {
    key: "cvReviewed",
    label: "CV Reviewed",
    accent: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800",
  },
  {
    key: "screened",
    label: "Screened",
    accent: "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800",
  },
  {
    key: "firstInterview",
    label: "1st Interview",
    accent: "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-800",
  },
  {
    key: "secondInterview",
    label: "2nd Interview",
    accent: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800",
  },
  {
    key: "selected",
    label: "Selected",
    accent: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800",
  },
  {
    key: "offer",
    label: "Offer",
    accent: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800",
  },
  {
    key: "joined",
    label: "Joined",
    accent: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-800",
  },
];

function CampaignFunnelSection({ roleId }: CampaignFunnelProps) {
  const {
    data: funnel,
    isLoading,
    error,
  } = useApiQuery<CampaignFunnel>(
    ["funnel", roleId],
    `/applications/funnel/${roleId}`,
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Spinner size="md" />
      </div>
    );
  }

  if (error || !funnel) {
    return (
      <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">
        Failed to load funnel: {error?.message ?? "Unknown error"}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-foreground">
          Campaign Funnel
        </h2>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {FUNNEL_STEPS.map((step) => (
            <div
              key={step.key}
              className={`flex flex-col items-center rounded-lg border px-3 py-2 min-w-[80px] ${step.accent}`}
            >
              <span className="text-xl font-bold leading-none">
                {funnel[step.key]}
              </span>
              <span className="text-xs mt-1 text-center leading-tight">
                {step.label}
              </span>
            </div>
          ))}

          {/* Subtle rejected/withdrawn */}
          <div className="flex flex-col items-center rounded-lg border px-3 py-2 min-w-[80px] bg-muted text-muted-foreground border-border">
            <span className="text-xl font-bold leading-none">
              {funnel.rejected}
            </span>
            <span className="text-xs mt-1 text-center leading-tight">
              Rejected
            </span>
          </div>
          <div className="flex flex-col items-center rounded-lg border px-3 py-2 min-w-[80px] bg-muted text-muted-foreground border-border">
            <span className="text-xl font-bold leading-none">
              {funnel.withdrawn}
            </span>
            <span className="text-xs mt-1 text-center leading-tight">
              Withdrawn
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Add Person Modal ───────────────────────────────────────────────────────

type AddPersonTab = "new" | "existing";

interface AddPersonModalProps {
  open: boolean;
  roleId: string;
  onClose: () => void;
  onAdded: () => void;
}

interface NewPersonForm {
  name: string;
  email: string;
  currentRole: string;
  currentCompany: string;
  skills: string;
  cvUrl: string;
  source: string;
}

const EMPTY_NEW_FORM: NewPersonForm = {
  name: "",
  email: "",
  currentRole: "",
  currentCompany: "",
  skills: "",
  cvUrl: "",
  source: "",
};

function AddPersonModal({
  open,
  roleId,
  onClose,
  onAdded,
}: AddPersonModalProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<AddPersonTab>("new");
  const [form, setForm] = useState<NewPersonForm>(EMPTY_NEW_FORM);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Existing candidate search
  const [searchQ, setSearchQ] = useState("");
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [addingExisting, setAddingExisting] = useState(false);
  const [existingError, setExistingError] = useState<string | null>(null);

  const { data: candidateResults } = useApiQuery<Candidate[]>(
    ["candidates", "picker", searchQ],
    `/candidates${searchQ ? `?q=${encodeURIComponent(searchQ)}` : ""}`,
  );

  const setField = <K extends keyof NewPersonForm>(
    key: K,
    val: NewPersonForm[K],
  ) => setForm((prev) => ({ ...prev, [key]: val }));

  const resetAll = () => {
    setForm(EMPTY_NEW_FORM);
    setCvFile(null);
    setError(null);
    setSearchQ("");
    setSelectedCandidateId("");
    setExistingError(null);
    setSaving(false);
    setAddingExisting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  const handleAddNew = async () => {
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const candidate = await apiSend<{ id: string }>("/candidates", "POST", {
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        currentRole: form.currentRole.trim() || undefined,
        currentCompany: form.currentCompany.trim() || undefined,
        skills: form.skills
          ? form.skills
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
        cvUrl: form.cvUrl.trim() || undefined,
        source: form.source || undefined,
      });

      if (cvFile) {
        await apiUpload(`/candidates/${candidate.id}/cv`, cvFile);
      }

      await apiSend("/applications", "POST", {
        candidateId: candidate.id,
        roleId,
      });

      await queryClient.invalidateQueries({
        queryKey: ["applications", roleId],
      });
      await queryClient.invalidateQueries({ queryKey: ["funnel", roleId] });

      resetAll();
      onAdded();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to add person.");
      setSaving(false);
    }
  };

  const handleAddExisting = async () => {
    if (!selectedCandidateId) {
      setExistingError("Select a candidate.");
      return;
    }
    setAddingExisting(true);
    setExistingError(null);
    try {
      await apiSend("/applications", "POST", {
        candidateId: selectedCandidateId,
        roleId,
      });
      await queryClient.invalidateQueries({
        queryKey: ["applications", roleId],
      });
      await queryClient.invalidateQueries({ queryKey: ["funnel", roleId] });
      resetAll();
      onAdded();
      onClose();
    } catch (e: unknown) {
      setExistingError(
        e instanceof Error ? e.message : "Failed to add candidate.",
      );
      setAddingExisting(false);
    }
  };

  const candidateItems = [
    { value: "", label: "Choose…" },
    ...(candidateResults ?? []).map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <Modal open={open} onClose={handleClose} title="Add Person to Campaign">
      {/* Tabs */}
      <div className="flex border-b border-border mb-4 mx-0">
        <button
          type="button"
          onClick={() => setTab("new")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "new"
              ? "border-indigo-600 text-indigo-700 dark:text-indigo-400"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          New Person
        </button>
        <button
          type="button"
          onClick={() => setTab("existing")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "existing"
              ? "border-indigo-600 text-indigo-700 dark:text-indigo-400"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Existing Person
        </button>
      </div>

      {tab === "new" && (
        <div className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <Field label="Full Name" htmlFor="ap-name" required>
            <Input
              id="ap-name"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="e.g. Jane Smith"
            />
          </Field>

          <Field label="Email" htmlFor="ap-email">
            <Input
              id="ap-email"
              type="email"
              value={form.email}
              onChange={(e) => setField("email", e.target.value)}
              placeholder="jane@example.com"
            />
          </Field>

          <Field label="Current Role" htmlFor="ap-role">
            <Input
              id="ap-role"
              value={form.currentRole}
              onChange={(e) => setField("currentRole", e.target.value)}
              placeholder="e.g. Senior Engineer"
            />
          </Field>

          <Field label="Current Company" htmlFor="ap-company">
            <Input
              id="ap-company"
              value={form.currentCompany}
              onChange={(e) => setField("currentCompany", e.target.value)}
              placeholder="e.g. Acme Corp"
            />
          </Field>

          <Field label="Skills (comma-separated)" htmlFor="ap-skills">
            <Input
              id="ap-skills"
              value={form.skills}
              onChange={(e) => setField("skills", e.target.value)}
              placeholder="e.g. React, TypeScript"
            />
          </Field>

          <Field label="CV Link (URL)" htmlFor="ap-cvurl">
            <Input
              id="ap-cvurl"
              type="url"
              value={form.cvUrl}
              onChange={(e) => setField("cvUrl", e.target.value)}
              placeholder="https://drive.google.com/…"
            />
          </Field>

          <Field label="Source" htmlFor="ap-source">
            <Select
              items={SOURCE_ITEMS}
              value={form.source}
              onValueChange={(value) => setField("source", value ?? "")}
            >
              <SelectTrigger id="ap-source" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="CV File (optional)" htmlFor="ap-cvfile">
            <input
              ref={fileInputRef}
              id="ap-cvfile"
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={(e) => setCvFile(e.target.files?.[0] ?? null)}
              className="text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-border file:text-sm file:font-medium file:bg-card file:text-foreground hover:file:bg-muted"
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleAddNew} loading={saving}>
              Add to Campaign
            </Button>
          </div>
        </div>
      )}

      {tab === "existing" && (
        <div className="space-y-4">
          {existingError && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {existingError}
            </div>
          )}

          <Field label="Search by name" htmlFor="ap-search">
            <Input
              id="ap-search"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Type to search candidates…"
            />
          </Field>

          <Field label="Select Candidate" htmlFor="ap-pick">
            <Select
              items={candidateItems}
              value={selectedCandidateId}
              onValueChange={(value) => setSelectedCandidateId(value ?? "")}
            >
              <SelectTrigger id="ap-pick" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {candidateItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={addingExisting}
            >
              Cancel
            </Button>
            <Button onClick={handleAddExisting} loading={addingExisting}>
              Add to Campaign
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Person row ─────────────────────────────────────────────────────────────

interface PersonRowProps {
  app: ApplicationRow;
  stageLabel: string;
  roleId: string;
}

function PersonRow({ app, stageLabel, roleId }: PersonRowProps) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const { data: journey, isLoading: journeyLoading } = useApiQuery<{
    candidate: { name: string };
  }>(["journey", app.id], `/applications/${app.id}/journey`);

  const candidateName = journey?.candidate?.name ?? "…";

  const handleJourneyChanged = () => {
    queryClient.invalidateQueries({ queryKey: ["applications", roleId] });
    queryClient.invalidateQueries({ queryKey: ["funnel", roleId] });
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Collapsed row */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted transition-colors text-left"
      >
        <span
          className={`text-muted-foreground text-xs transition-transform ${expanded ? "rotate-90" : ""}`}
          style={{ display: "inline-block" }}
        >
          ▶
        </span>

        <div className="flex-1 min-w-0">
          {journeyLoading ? (
            <span className="text-sm text-muted-foreground">Loading…</span>
          ) : (
            <span className="font-medium text-foreground text-sm">
              {candidateName}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {stageLabel && <Badge variant="info">{stageLabel}</Badge>}
          <Badge variant={APP_STATUS_VARIANT[app.status] ?? "default"}>
            {app.status}
          </Badge>
          {app.matchScore != null && (
            <Badge
              variant={
                app.matchScore >= 70
                  ? "success"
                  : app.matchScore >= 40
                    ? "warning"
                    : "danger"
              }
            >
              {app.matchScore}%
            </Badge>
          )}
        </div>
      </button>

      {/* Expanded journey */}
      {expanded && (
        <div className="border-t border-border bg-muted/50">
          <CandidateJourney
            applicationId={app.id}
            onChanged={handleJourneyChanged}
          />
        </div>
      )}
    </div>
  );
}

// ── People list ────────────────────────────────────────────────────────────

interface PeopleListProps {
  roleId: string;
  canManage: boolean;
}

function PeopleList({ roleId, canManage }: PeopleListProps) {
  const [showAdd, setShowAdd] = useState(false);
  const queryClient = useQueryClient();

  const {
    data: applications,
    isLoading,
    error,
  } = useApiQuery<ApplicationRow[]>(
    ["applications", roleId],
    `/applications?roleId=${roleId}`,
  );

  // Load stages for labels
  const { data: stages } = useApiQuery<Stage[]>(["stages"], "/config/stages");

  const stageMap = new Map<string, string>(
    (stages ?? []).map((s) => [s.key, s.label]),
  );

  // Build a stageId->key map by loading journey lazily per row — but for the
  // collapsed summary we only have currentStageId (a DB id, not a key).
  // We'll pass stageLabel as empty string; the journey load fills names in.
  // The stageId lookup would require another endpoint; keep it simple.

  const list = applications ?? [];

  const handleAdded = () => {
    queryClient.invalidateQueries({ queryKey: ["applications", roleId] });
    queryClient.invalidateQueries({ queryKey: ["funnel", roleId] });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            People in this Campaign
            {list.length > 0 && (
              <span className="ml-2 text-muted-foreground font-normal">
                ({list.length})
              </span>
            )}
          </h2>
          {canManage && (
            <Button size="sm" onClick={() => setShowAdd(true)}>
              Add Person
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex justify-center py-8">
            <Spinner size="md" />
          </div>
        )}

        {error && !isLoading && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            Failed to load people: {error.message}
          </div>
        )}

        {!isLoading && !error && list.length === 0 && (
          <EmptyState
            title="No people added yet"
            description={
              canManage
                ? "Add the first person to start the campaign."
                : "No applications yet."
            }
            actions={
              canManage ? (
                <Button size="sm" onClick={() => setShowAdd(true)}>
                  Add Person
                </Button>
              ) : undefined
            }
          />
        )}

        {!isLoading && !error && list.length > 0 && (
          <div className="space-y-2">
            {list.map((app) => (
              <PersonRow
                key={app.id}
                app={app}
                stageLabel={stageMap.get(app.currentStageId ?? "") ?? ""}
                roleId={roleId}
              />
            ))}
          </div>
        )}
      </CardContent>

      {canManage && (
        <AddPersonModal
          open={showAdd}
          roleId={roleId}
          onClose={() => setShowAdd(false)}
          onAdded={handleAdded}
        />
      )}
    </Card>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export function RoleDetail() {
  const { id } = useParams<{ id: string }>();
  const { me } = useAuth();
  const userRole = me?.role ?? "";
  const canManage = CAN_MANAGE.has(userRole);

  const [showChangeStatus, setShowChangeStatus] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const {
    data: role,
    isLoading,
    error,
    refetch,
  } = useApiQuery<Role>(["role", id], `/roles/${id}`);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !role) {
    return (
      <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-300">
        Failed to load role: {error?.message ?? "Not found"}
      </div>
    );
  }

  const remaining =
    role.remainingCount ?? role.requiredCount - role.filledCount;
  const isClosed = role.status === "CLOSED" || role.status === "CANCELLED";

  const handleDownloadJd = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      const safeTitle =
        role.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") ||
        "role";
      await apiDownload(`/roles/${role.id}/jd.pdf`, `${safeTitle}-JD.pdf`);
    } catch (e: unknown) {
      setDownloadError(
        e instanceof Error ? e.message : "Failed to download PDF.",
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── 1. Header ── */}
      <PageHeader
        title={role.title}
        subtitle={
          role.project ? `Project: ${role.project.name}` : `Role ID: ${role.id}`
        }
        actions={
          <div className="flex gap-2">
            {role.jobDescription && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadJd}
                loading={downloading}
              >
                Download JD (PDF)
              </Button>
            )}
            {canManage && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowChangeStatus(true)}
                  disabled={isClosed}
                >
                  Change Status
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowClose(true)}
                  disabled={isClosed}
                >
                  Close Role
                </Button>
              </>
            )}
          </div>
        }
      />
      {downloadError && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {downloadError}
        </div>
      )}

      {/* ── Role overview ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <h2 className="text-sm font-semibold text-foreground">Overview</h2>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow
              label="Status"
              value={
                <Badge variant={STATUS_VARIANT[role.status] ?? "default"}>
                  {role.status.replace(/_/g, " ")}
                </Badge>
              }
            />
            <DetailRow
              label="Priority"
              value={
                <Badge variant={PRIORITY_VARIANT[role.priority] ?? "default"}>
                  {role.priority}
                </Badge>
              }
            />
            <DetailRow
              label="Department"
              value={role.department?.name ?? "—"}
            />
            <DetailRow label="Seniority" value={role.seniority?.name ?? "—"} />
            <DetailRow label="Project" value={role.project?.name ?? "—"} />
            {role.jobDescription && (
              <div className="pt-2 border-t border-border">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  Job Description
                </p>
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                  {role.jobDescription}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-foreground">Headcount</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <HeadcountBar
              required={role.requiredCount}
              filled={role.filledCount}
            />
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xl font-bold text-foreground">
                  {role.requiredCount}
                </p>
                <p className="text-xs text-muted-foreground">Required</p>
              </div>
              <div>
                <p className="text-xl font-bold text-green-600">
                  {role.filledCount}
                </p>
                <p className="text-xs text-muted-foreground">Filled</p>
              </div>
              <div>
                <p
                  className={`text-xl font-bold ${remaining > 0 ? "text-amber-600" : "text-green-600"}`}
                >
                  {remaining}
                </p>
                <p className="text-xs text-muted-foreground">Remaining</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── 2. Campaign Funnel ── */}
      <CampaignFunnelSection roleId={role.id} />

      {/* ── 3+4. People list (includes Add Person button) ── */}
      <PeopleList roleId={role.id} canManage={canManage} />

      {/* ── Modals ── */}
      {canManage && (
        <>
          <ChangeStatusModal
            open={showChangeStatus}
            currentStatus={role.status}
            roleId={role.id}
            onClose={() => setShowChangeStatus(false)}
            onChanged={() => refetch()}
          />
          <CloseRoleModal
            open={showClose}
            roleId={role.id}
            onClose={() => setShowClose(false)}
            onClosed={() => refetch()}
          />
        </>
      )}
    </div>
  );
}
