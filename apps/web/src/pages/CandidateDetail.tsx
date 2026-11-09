import { useRef, useState } from "react";
import type React from "react";
import { useParams, Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { useApiQuery } from "../api/hooks";
import { apiUpload, apiSend } from "../api/client";
import {
  PageHeader,
  Button,
  Badge,
  Card,
  CardHeader,
  CardContent,
  Spinner,
  Modal,
  Field,
  Input,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui";
import type { BadgeVariant } from "../components/ui";
import type { CandidateSource } from "./Candidates";

// ── Types ──────────────────────────────────────────────────────────────────

type CvFileStatus = "UPLOADED" | "PARSING" | "PARSED" | "FAILED";

interface CvFile {
  id: string;
  originalName: string;
  status: CvFileStatus;
  parsedJson?: Record<string, unknown>;
}

interface CandidateDetail {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  location?: string;
  currentRole?: string;
  currentCompany?: string;
  yearsExperience?: number;
  skills: string[];
  source: CandidateSource;
  tags: string[];
  cvFiles: CvFile[];
}

interface Application {
  id: string;
  roleId: string;
  candidateId: string;
  currentStage?: { key: string; label: string };
  status: string;
  matchScore?: number;
  role?: { id: string; title: string };
}

// ── Constants ──────────────────────────────────────────────────────────────

const CAN_UPLOAD = new Set(["ADMIN", "HR"]);

const CV_STATUS_VARIANT: Record<CvFileStatus, BadgeVariant> = {
  UPLOADED: "info",
  PARSING: "warning",
  PARSED: "success",
  FAILED: "danger",
};

const APP_STATUS_VARIANT: Record<string, BadgeVariant> = {
  ACTIVE: "info",
  REJECTED: "danger",
  WITHDRAWN: "default",
  HIRED: "success",
  ON_HOLD: "warning",
};

// ── Communication types ────────────────────────────────────────────────────

type CommunicationType =
  | "PHONE"
  | "EMAIL"
  | "WHATSAPP"
  | "LINKEDIN"
  | "INTERVIEW_DISCUSSION"
  | "INTERNAL_NOTE"
  | "OFFER_DISCUSSION"
  | "FOLLOW_UP";

type DraftKind =
  | "INTERVIEW_INVITE"
  | "SCREENING_REQUEST"
  | "MISSING_INFO"
  | "REJECTION"
  | "OFFER_FOLLOWUP"
  | "STATUS_UPDATE"
  | "INTERVIEW_REMINDER"
  | "FOLLOW_UP";

interface Communication {
  id: string;
  candidateId: string;
  applicationId?: string;
  type: CommunicationType;
  summary: string;
  candidateResponse?: string;
  nextAction?: string;
  followUpDate?: string;
  createdAt: string;
  owner?: { id: string; name?: string; email: string };
}

interface DraftResult {
  subject: string;
  body: string;
}

const COMM_TYPE_VARIANT: Record<CommunicationType, BadgeVariant> = {
  PHONE: "info",
  EMAIL: "default",
  WHATSAPP: "success",
  LINKEDIN: "purple",
  INTERVIEW_DISCUSSION: "info",
  INTERNAL_NOTE: "warning",
  OFFER_DISCUSSION: "success",
  FOLLOW_UP: "warning",
};

const ALL_COMM_TYPES: CommunicationType[] = [
  "PHONE",
  "EMAIL",
  "WHATSAPP",
  "LINKEDIN",
  "INTERVIEW_DISCUSSION",
  "INTERNAL_NOTE",
  "OFFER_DISCUSSION",
  "FOLLOW_UP",
];

const ALL_DRAFT_KINDS: DraftKind[] = [
  "INTERVIEW_INVITE",
  "SCREENING_REQUEST",
  "MISSING_INFO",
  "REJECTION",
  "OFFER_FOLLOWUP",
  "STATUS_UPDATE",
  "INTERVIEW_REMINDER",
  "FOLLOW_UP",
];

const COMM_TYPE_ITEMS = [
  { value: "", label: "Select type…" },
  ...ALL_COMM_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, " ") })),
];

const DRAFT_KIND_ITEMS = [
  { value: "", label: "Select kind…" },
  ...ALL_DRAFT_KINDS.map((k) => ({ value: k, label: k.replace(/_/g, " ") })),
];

const CAN_LOG_COMM = new Set(["ADMIN", "HR", "HIRING_MANAGER"]);

function fmtCommDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

// ── Log Communication Modal ────────────────────────────────────────────────

interface LogCommModalProps {
  open: boolean;
  candidateId: string;
  onClose: () => void;
  onLogged: () => void;
}

function LogCommModal({
  open,
  candidateId,
  onClose,
  onLogged,
}: LogCommModalProps) {
  const [type, setType] = useState<CommunicationType | "">("");
  const [summary, setSummary] = useState("");
  const [candidateResponse, setCandidateResponse] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setType("");
    setSummary("");
    setCandidateResponse("");
    setNextAction("");
    setFollowUpDate("");
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!type) {
      setError("Select a communication type.");
      return;
    }
    if (!summary.trim()) {
      setError("Summary is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiSend("/communications", "POST", {
        candidateId,
        type,
        summary: summary.trim(),
        candidateResponse: candidateResponse.trim() || undefined,
        nextAction: nextAction.trim() || undefined,
        followUpDate: followUpDate || undefined,
      });
      reset();
      onLogged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to log communication.");
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Log Communication">
      <div className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <Field label="Type" htmlFor="comm-type" required>
          <Select
            items={COMM_TYPE_ITEMS}
            value={type}
            onValueChange={(value) =>
              setType((value ?? "") as CommunicationType)
            }
          >
            <SelectTrigger id="comm-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMM_TYPE_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Summary" htmlFor="comm-summary" required>
          <Textarea
            id="comm-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Describe what was discussed…"
          />
        </Field>

        <Field label="Candidate Response" htmlFor="comm-response">
          <Textarea
            id="comm-response"
            value={candidateResponse}
            onChange={(e) => setCandidateResponse(e.target.value)}
            placeholder="How did the candidate respond?"
          />
        </Field>

        <Field label="Next Action" htmlFor="comm-next-action">
          <Input
            id="comm-next-action"
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            placeholder="e.g. Send offer letter"
          />
        </Field>

        <Field label="Follow-up Date" htmlFor="comm-followup">
          <Input
            id="comm-followup"
            type="date"
            value={followUpDate}
            onChange={(e) => setFollowUpDate(e.target.value)}
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={saving}>
            Log
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Draft Message Modal ────────────────────────────────────────────────────

interface DraftModalProps {
  open: boolean;
  candidateName: string;
  onClose: () => void;
}

function DraftModal({ open, candidateName, onClose }: DraftModalProps) {
  const [kind, setKind] = useState<DraftKind | "">("");
  const [roleTitle, setRoleTitle] = useState("");
  const [context, setContext] = useState("");
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setKind("");
    setRoleTitle("");
    setContext("");
    setDraft(null);
    setDraftSubject("");
    setDraftBody("");
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleGenerate = async () => {
    if (!kind) {
      setError("Select a message kind.");
      return;
    }
    setGenerating(true);
    setError(null);
    setDraft(null);
    try {
      const result = await apiSend<DraftResult>(
        "/communications/draft",
        "POST",
        {
          kind,
          candidateName,
          roleTitle: roleTitle.trim() || undefined,
          context: context.trim() || undefined,
        },
      );
      setDraft(result);
      setDraftSubject(result.subject);
      setDraftBody(result.body);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to generate draft.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Draft Message"
      className="max-w-2xl"
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <Field label="Message Kind" htmlFor="draft-kind" required>
          <Select
            items={DRAFT_KIND_ITEMS}
            value={kind}
            onValueChange={(value) => {
              setKind((value ?? "") as DraftKind);
              setDraft(null);
            }}
          >
            <SelectTrigger id="draft-kind" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DRAFT_KIND_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Role Title (optional)" htmlFor="draft-role">
          <Input
            id="draft-role"
            value={roleTitle}
            onChange={(e) => setRoleTitle(e.target.value)}
            placeholder="e.g. Senior Engineer"
          />
        </Field>

        <Field label="Context (optional)" htmlFor="draft-context">
          <Textarea
            id="draft-context"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Any extra context for the AI…"
          />
        </Field>

        <div className="flex justify-end">
          <Button
            onClick={handleGenerate}
            loading={generating}
            disabled={generating}
          >
            Generate Draft
          </Button>
        </div>

        {draft && (
          <div className="space-y-3 pt-2 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Generated Draft — edit before copying
            </p>
            <Field label="Subject" htmlFor="draft-subject">
              <Input
                id="draft-subject"
                value={draftSubject}
                onChange={(e) => setDraftSubject(e.target.value)}
              />
            </Field>
            <Field label="Body" htmlFor="draft-body">
              <Textarea
                id="draft-body"
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                className="min-h-[160px]"
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              Copy the text above to send via your preferred channel. No message
              is sent automatically.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Communication Log Card ─────────────────────────────────────────────────

interface CommLogCardProps {
  candidateId: string;
  candidateName: string;
  canLog: boolean;
}

function CommLogCard({ candidateId, candidateName, canLog }: CommLogCardProps) {
  const queryClient = useQueryClient();
  const [showLog, setShowLog] = useState(false);
  const [showDraft, setShowDraft] = useState(false);

  const { data: comms, isLoading } = useApiQuery<Communication[]>(
    ["communications", candidateId],
    `/communications?candidateId=${candidateId}`,
  );

  const handleLogged = () => {
    queryClient.invalidateQueries({
      queryKey: ["communications", candidateId],
    });
    setShowLog(false);
  };

  const list = comms ?? [];

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              Communication Log
            </h2>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowDraft(true)}
              >
                Draft Message
              </Button>
              {canLog && (
                <Button size="sm" onClick={() => setShowLog(true)}>
                  Log Communication
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex justify-center py-6">
              <Spinner size="md" />
            </div>
          )}
          {!isLoading && list.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No communications logged yet.
            </p>
          )}
          {!isLoading && list.length > 0 && (
            <div className="space-y-3">
              {list.map((comm) => (
                <div
                  key={comm.id}
                  className="rounded-md border border-border bg-muted px-3 py-2.5 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant={COMM_TYPE_VARIANT[comm.type] ?? "default"}
                      >
                        {comm.type.replace(/_/g, " ")}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {fmtCommDate(comm.createdAt)}
                      </span>
                      {comm.owner && (
                        <span className="text-xs text-muted-foreground">
                          by {comm.owner.name ?? comm.owner.email}
                        </span>
                      )}
                    </div>
                    {comm.followUpDate && (
                      <span className="text-xs text-amber-600 font-medium">
                        Follow-up: {fmtCommDate(comm.followUpDate)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-foreground">{comm.summary}</p>
                  {comm.candidateResponse && (
                    <p className="text-xs text-muted-foreground italic">
                      Response: {comm.candidateResponse}
                    </p>
                  )}
                  {comm.nextAction && (
                    <p className="text-xs text-indigo-600 font-medium">
                      Next: {comm.nextAction}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {showLog && (
        <LogCommModal
          open={showLog}
          candidateId={candidateId}
          onClose={() => setShowLog(false)}
          onLogged={handleLogged}
        />
      )}

      {showDraft && (
        <DraftModal
          open={showDraft}
          candidateName={candidateName}
          onClose={() => setShowDraft(false)}
        />
      )}
    </>
  );
}

// ── Detail row helper ──────────────────────────────────────────────────────

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

// ── CV Upload section ──────────────────────────────────────────────────────

interface CvUploadProps {
  candidateId: string;
}

function CvUpload({ candidateId }: CvUploadProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setUploadError(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setUploadError(null);
    try {
      await apiUpload(`/candidates/${candidateId}/cv`, selectedFile);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await queryClient.invalidateQueries({
        queryKey: ["candidate", candidateId],
      });
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx"
          onChange={handleFileChange}
          className="w-full min-w-0  flex-1 text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-border file:text-sm file:font-medium file:bg-card file:text-foreground hover:file:bg-muted"
        />
        <Button
          size="sm"
          onClick={handleUpload}
          disabled={!selectedFile || uploading}
          loading={uploading}
          className="shrink-0 self-start sm:self-auto"
        >
          Upload
        </Button>
      </div>
      {uploadError && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {uploadError}
        </div>
      )}
    </div>
  );
}

// ── Parsed CV fields ───────────────────────────────────────────────────────

function ParsedCvFields({ parsed }: { parsed: Record<string, unknown> }) {
  const entries = Object.entries(parsed).filter(
    ([, v]) => v != null && v !== "",
  );
  if (entries.length === 0)
    return (
      <p className="text-sm text-muted-foreground">No extracted fields.</p>
    );

  return (
    <div className="mt-3 rounded-md border border-border bg-muted p-3 space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Extracted Fields
      </p>
      <div className="space-y-1">
        {entries.map(([key, val]) => (
          <div key={key} className="flex gap-2 text-sm">
            <span className="font-medium text-muted-foreground capitalize w-32 shrink-0">
              {key.replace(/([A-Z])/g, " $1").trim()}:
            </span>
            <span className="text-foreground wrap-break-word">
              {Array.isArray(val) ? val.join(", ") : String(val)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export function CandidateDetail() {
  const { id } = useParams<{ id: string }>();
  const { me } = useAuth();
  const userRole = me?.role ?? "";
  const canUpload = CAN_UPLOAD.has(userRole);
  const canLog = CAN_LOG_COMM.has(userRole);

  const {
    data: candidate,
    isLoading,
    error,
  } = useApiQuery<CandidateDetail>(["candidate", id], `/candidates/${id}`);

  const { data: applications, isLoading: appsLoading } = useApiQuery<
    Application[]
  >(["applications", "candidate", id], `/applications?candidateId=${id}`);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !candidate) {
    return (
      <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-300">
        Failed to load candidate: {error?.message ?? "Not found"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={candidate.name}
        subtitle={
          [candidate.currentRole, candidate.currentCompany]
            .filter(Boolean)
            .join(" @ ") || "Candidate Profile"
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Profile Details */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <h2 className="text-sm font-semibold text-foreground">Profile</h2>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Email" value={candidate.email} />
            <DetailRow label="Phone" value={candidate.phone} />
            <DetailRow label="Location" value={candidate.location} />
            <DetailRow label="Current Role" value={candidate.currentRole} />
            <DetailRow label="Company" value={candidate.currentCompany} />
            <DetailRow
              label="Experience"
              value={
                candidate.yearsExperience != null
                  ? `${candidate.yearsExperience} yrs`
                  : undefined
              }
            />
            <DetailRow
              label="Source"
              value={
                candidate.source ? (
                  <Badge variant="info">
                    {candidate.source.replace(/_/g, " ")}
                  </Badge>
                ) : undefined
              }
            />
            {(candidate.skills ?? []).length > 0 && (
              <DetailRow
                label="Skills"
                value={
                  <div className="flex flex-wrap gap-1">
                    {candidate.skills.map((sk) => (
                      <Badge key={sk} variant="default">
                        {sk}
                      </Badge>
                    ))}
                  </div>
                }
              />
            )}
            {(candidate.tags ?? []).length > 0 && (
              <DetailRow
                label="Tags"
                value={
                  <div className="flex flex-wrap gap-1">
                    {candidate.tags.map((tag) => (
                      <Badge key={tag} variant="purple">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                }
              />
            )}
          </CardContent>
        </Card>

        {/* CV Files */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-foreground">
                CV / Résumé
              </h2>
            </CardHeader>
            <CardContent className="space-y-4">
              {(candidate.cvFiles ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No CV files uploaded yet.
                </p>
              )}
              {(candidate.cvFiles ?? []).map((cv) => (
                <div key={cv.id} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-foreground truncate">
                      {cv.originalName}
                    </span>
                    <Badge variant={CV_STATUS_VARIANT[cv.status] ?? "default"}>
                      {cv.status}
                    </Badge>
                  </div>
                  {cv.parsedJson && <ParsedCvFields parsed={cv.parsedJson} />}
                </div>
              ))}

              {canUpload && (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Upload New CV
                  </p>
                  <CvUpload candidateId={candidate.id} />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Applications */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-foreground">
            Applications
          </h2>
        </CardHeader>
        <CardContent>
          {appsLoading && (
            <div className="flex justify-center py-6">
              <Spinner size="md" />
            </div>
          )}
          {!appsLoading && (applications ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">
              No applications yet.
            </p>
          )}
          {!appsLoading && (applications ?? []).length > 0 && (
            <div className="space-y-2">
              {(applications ?? []).map((app) => (
                <div
                  key={app.id}
                  className="flex items-center justify-between gap-4 rounded-md border border-border bg-muted px-3 py-2"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-medium text-foreground text-sm truncate">
                      {app.role?.title ?? app.roleId}
                    </span>
                    {app.currentStage && (
                      <Badge variant="info">{app.currentStage.label}</Badge>
                    )}
                    <Badge
                      variant={APP_STATUS_VARIANT[app.status] ?? "default"}
                    >
                      {app.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
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
                    <Link
                      to={`/roles/${app.roleId}`}
                      className="text-indigo-600 hover:text-indigo-800 text-sm font-medium hover:underline"
                    >
                      View Campaign →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Communication Log */}
      <CommLogCard
        candidateId={candidate.id}
        candidateName={candidate.name}
        canLog={canLog}
      />
    </div>
  );
}
