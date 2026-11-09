import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiDelete, apiUpload } from "@/api/client";
import { useAuth } from "../context/AuthContext";
import { useApiQuery, useApiMutation } from "../api/hooks";
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
  Textarea,
} from "../components/ui";
import type { BadgeVariant } from "../components/ui";
import { FileText, Loader2, Sparkles, Trash2, Upload } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";

// ── Types ──────────────────────────────────────────────────────────────────

export type CandidateSource =
  | "HR_UPLOAD"
  | "REFERRAL"
  | "LINKEDIN"
  | "JOB_PORTAL"
  | "AGENCY"
  | "DIRECT"
  | "TALENT_POOL"
  | "INTERNAL";

export interface Candidate {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  location?: string;
  currentRole?: string;
  currentCompany?: string;
  yearsExperience?: number;
  skills: string[];
  source: CandidateSource;
  tags: string[];
}

interface NewCandidateForm {
  name: string;
  email: string;
  phone: string;
  address: string;
  location: string;
  currentRole: string;
  currentCompany: string;
  yearsExperience: string;
  skills: string;
  currentSalary: string;
  expectedSalary: string;
  noticePeriod: string;
  source: CandidateSource | "";
}

interface ParsedResume {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  currentTitle?: string;
  currentEmployer?: string;
  totalYearsExperience?: number;
  skills: string[];
}

// ── Constants ──────────────────────────────────────────────────────────────

const CAN_CREATE = new Set(["ADMIN", "HR"]);

const SOURCE_OPTIONS: CandidateSource[] = [
  "HR_UPLOAD",
  "REFERRAL",
  "LINKEDIN",
  "JOB_PORTAL",
  "AGENCY",
  "DIRECT",
  "TALENT_POOL",
  "INTERNAL",
];

const SOURCE_VARIANT: Record<CandidateSource, BadgeVariant> = {
  HR_UPLOAD: "default",
  REFERRAL: "success",
  LINKEDIN: "info",
  JOB_PORTAL: "info",
  AGENCY: "warning",
  DIRECT: "purple",
  TALENT_POOL: "default",
  INTERNAL: "success",
};

const SOURCE_LABEL: Record<CandidateSource, string> = {
  HR_UPLOAD: "HR Upload",
  REFERRAL: "Referral",
  LINKEDIN: "LinkedIn",
  JOB_PORTAL: "Job Portal",
  AGENCY: "Agency",
  DIRECT: "Direct",
  TALENT_POOL: "Talent Pool",
  INTERNAL: "Internal",
};

const SOURCE_FORM_ITEMS = [
  { value: "", label: "Select source…" },
  ...SOURCE_OPTIONS.map((s) => ({ value: s, label: SOURCE_LABEL[s] })),
];

const SOURCE_FILTER_ITEMS = [
  { value: "", label: "All Sources" },
  ...SOURCE_OPTIONS.map((s) => ({ value: s, label: SOURCE_LABEL[s] })),
];

const EMPTY_FORM: NewCandidateForm = {
  name: "",
  email: "",
  phone: "",
  address: "",
  location: "",
  currentRole: "",
  currentCompany: "",
  yearsExperience: "",
  skills: "",
  currentSalary: "",
  expectedSalary: "",
  noticePeriod: "",
  source: "",
};

// ── New Candidate Modal ────────────────────────────────────────────────────

interface NewCandidateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

function NewCandidateModal({
  open,
  onClose,
  onCreated,
}: NewCandidateModalProps) {
  const [form, setForm] = useState<NewCandidateForm>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof NewCandidateForm, string>>
  >({});
  const [formError, setFormError] = useState<string | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [isDraggingResume, setIsDraggingResume] = useState(false);
  const [parsingResume, setParsingResume] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [createdCandidateId, setCreatedCandidateId] = useState<string | null>(
    null,
  );
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const resumeParseRequestRef = useRef(0);

  const mutation = useApiMutation<Candidate>("/candidates", "POST", [
    ["candidates"],
  ]);

  const setField = <K extends keyof NewCandidateForm>(
    key: K,
    value: NewCandidateForm[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setFormError(null);
  };

  const handleSubmit = async () => {
    if (!createdCandidateId) {
      const requiredFields: Array<[keyof NewCandidateForm, string]> = [
        ["name", "Full Name"],
        ["email", "Email"],
        ["phone", "Phone"],
        ["address", "Residential Address"],
        ["location", "Location"],
        ["currentRole", "Current Role"],
        ["currentCompany", "Current Company"],
        ["yearsExperience", "Years of Experience"],
        ["skills", "Skills"],
        ["currentSalary", "Current CTC"],
        ["expectedSalary", "Expected CTC"],
        ["noticePeriod", "Notice period"],
        ["source", "Source"],
      ];
      const errors = requiredFields.reduce<
        Partial<Record<keyof NewCandidateForm, string>>
      >((result, [key, label]) => {
        if (!form[key].trim()) result[key] = `${label} is required.`;
        return result;
      }, {});
      setFieldErrors(errors);
      setFormError(null);
      setResumeError(resumeFile ? null : "Resume is required.");

      if (Object.keys(errors).length > 0 || !resumeFile) return;
    } else if (!resumeFile) {
      setResumeError("Choose a resume to retry the upload.");
      return;
    }

    setFieldErrors({});
    setResumeError(null);
    setFormError(null);
    setSaving(true);
    let candidateId = createdCandidateId;

    try {
      if (!candidateId) {
        const candidate = await mutation.mutateAsync({
          name: form.name.trim(),
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          address: form.address.trim() || undefined,
          location: form.location.trim() || undefined,
          currentRole: form.currentRole.trim() || undefined,
          currentCompany: form.currentCompany.trim() || undefined,
          yearsExperience: form.yearsExperience
            ? parseFloat(form.yearsExperience)
            : undefined,
          currentSalary: form.currentSalary.trim(),
          expectedSalary: form.expectedSalary.trim(),
          noticePeriod: form.noticePeriod.trim(),
          skills: form.skills
            ? form.skills
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined,
          source: form.source || undefined,
        });
        candidateId = candidate.id;
        setCreatedCandidateId(candidateId);
        onCreated();
      }

      if (resumeFile) {
        await apiUpload(`/candidates/${candidateId}/cv`, resumeFile);
      }

      setForm(EMPTY_FORM);
      setFieldErrors({});
      setCreatedCandidateId(null);
      clearResume();
      onClose();
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : "An unexpected error occurred.";
      if (
        !candidateId &&
        message === "A candidate with this phone number already exists."
      ) {
        setFieldErrors((previous) => ({
          ...previous,
          phone: message,
        }));
      } else {
        setFormError(
          candidateId
            ? `Candidate was created, but the resume upload failed. Retry to upload it, or upload it from the candidate's detail page. ${message}`
            : `Failed to create candidate. ${message}`,
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const handleResumeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;

    acceptResumeFile(file);
    event.currentTarget.value = "";
  };

  const parseResume = async (file: File, requestId: number) => {
    setParsingResume(true);
    setParseError(null);

    try {
      const parsed = await apiUpload<ParsedResume>(
        "/candidates/parse-cv",
        file,
      );

      if (requestId !== resumeParseRequestRef.current) return;

      setForm((previous) => ({
        ...previous,
        name: previous.name.trim() ? previous.name : (parsed.name ?? ""),
        email: previous.email.trim() ? previous.email : (parsed.email ?? ""),
        phone: previous.phone.trim() ? previous.phone : (parsed.phone ?? ""),
        location: previous.location.trim()
          ? previous.location
          : (parsed.location ?? ""),
        currentRole: previous.currentRole.trim()
          ? previous.currentRole
          : (parsed.currentTitle ?? ""),
        currentCompany: previous.currentCompany.trim()
          ? previous.currentCompany
          : (parsed.currentEmployer ?? ""),
        yearsExperience: previous.yearsExperience.trim()
          ? previous.yearsExperience
          : parsed.totalYearsExperience != null
            ? String(parsed.totalYearsExperience)
            : "",
        skills: previous.skills.trim()
          ? previous.skills
          : (parsed.skills ?? []).join(", "),
      }));
      setFieldErrors((previous) => {
        const next = { ...previous };
        const values: Partial<Record<keyof NewCandidateForm, string>> = {
          name: parsed.name,
          email: parsed.email,
          phone: parsed.phone,
          location: parsed.location,
          currentRole: parsed.currentTitle,
          currentCompany: parsed.currentEmployer,
          yearsExperience:
            parsed.totalYearsExperience != null
              ? String(parsed.totalYearsExperience)
              : undefined,
          skills: parsed.skills?.join(", "),
        };
        for (const key of Object.keys(values) as Array<
          keyof NewCandidateForm
        >) {
          if (values[key]?.trim()) delete next[key];
        }
        return next;
      });
    } catch (error: unknown) {
      if (requestId === resumeParseRequestRef.current) {
        setParseError(
          error instanceof Error
            ? error.message
            : "Failed to parse the resume.",
        );
      }
    } finally {
      if (requestId === resumeParseRequestRef.current) {
        setParsingResume(false);
      }
    }
  };

  const acceptResumeFile = (file: File) => {
    const allowedExtensions = ["pdf", "doc", "docx"];
    const extension = file.name.split(".").pop()?.toLowerCase();

    if (!extension || !allowedExtensions.includes(extension)) {
      setResumeError("Choose a PDF, DOC, or DOCX resume.");
      return;
    }

    setResumeError(null);
    setParseError(null);
    setResumeFile(file);
    const requestId = ++resumeParseRequestRef.current;
    void parseResume(file, requestId);
  };

  const handleResumeDrop = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDraggingResume(false);
    const file = event.dataTransfer.files[0];
    if (file) acceptResumeFile(file);
  };

  const clearResume = () => {
    resumeParseRequestRef.current += 1;
    setResumeFile(null);
    setResumeError(null);
    setParseError(null);
    setParsingResume(false);

    if (resumeInputRef.current) {
      resumeInputRef.current.value = "";
    }
  };

  const handleClose = () => {
    if (saving) return;
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError(null);
    setCreatedCandidateId(null);
    clearResume();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="New Candidate"
      maxWidth="3xl"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {formError && (
          <div className="col-span-full rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {formError}
          </div>
        )}

        <Field
          label="Resume"
          htmlFor="cand-resume"
          required
          className="sm:col-span-2"
        >
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={resumeInputRef}
              id="cand-resume"
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={handleResumeChange}
              disabled={saving}
              required
              className="sr-only"
            />

            <button
              type="button"
              onClick={() => resumeInputRef.current?.click()}
              disabled={saving}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDraggingResume(true);
              }}
              onDragLeave={(event) => {
                if (event.currentTarget === event.target) {
                  setIsDraggingResume(false);
                }
              }}
              onDrop={handleResumeDrop}
              aria-describedby={
                resumeError ? "cand-resume-error" : "cand-resume-hint"
              }
              aria-invalid={Boolean(resumeError)}
              className={`flex min-h-60 w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 ${
                isDraggingResume
                  ? "border-indigo-500 bg-indigo-100/70 dark:bg-indigo-900/40"
                  : "border-indigo-300 bg-indigo-50/50 hover:border-indigo-400 hover:bg-indigo-100/50 dark:border-indigo-500/70 dark:bg-indigo-950/30 dark:hover:bg-indigo-900/30"
              }`}
            >
              {resumeFile ? (
                parsingResume ? (
                  <Loader2
                    aria-hidden="true"
                    className="size-16 animate-spin rounded-2xl bg-indigo-100 p-4 text-indigo-600 dark:bg-indigo-900/70 dark:text-indigo-300"
                  />
                ) : (
                  <FileText
                    aria-hidden="true"
                    className="size-16 rounded-2xl bg-indigo-100 p-4 text-indigo-600 dark:bg-indigo-900/70 dark:text-indigo-300"
                  />
                )
              ) : (
                <Upload
                  aria-hidden="true"
                  className="size-16 rounded-2xl bg-indigo-100 p-4 text-indigo-600 dark:bg-indigo-900/70 dark:text-indigo-300"
                />
              )}
              {resumeFile ? (
                <>
                  <span className="max-w-full break-all text-base font-semibold text-foreground">
                    {resumeFile.name}
                  </span>
                  {parsingResume && (
                    <span
                      className="text-sm font-medium text-indigo-600 dark:text-indigo-300"
                      role="status"
                      aria-live="polite"
                    >
                      Parsing resume and filling in details…
                    </span>
                  )}
                  <span
                    id="cand-resume-hint"
                    className="text-sm text-muted-foreground"
                  >
                    Drop another resume here, or{" "}
                    <span className="font-semibold text-indigo-600 underline underline-offset-2 dark:text-indigo-300">
                      browse files
                    </span>{" "}
                    to replace it
                  </span>
                </>
              ) : (
                <>
                  <span className="text-base font-semibold text-foreground">
                    Drag &amp; drop your resume here, or{" "}
                    <span className="text-indigo-600 underline underline-offset-2 dark:text-indigo-300">
                      browse files
                    </span>
                  </span>
                  <span
                    id="cand-resume-hint"
                    className="text-sm text-muted-foreground"
                  >
                    PDF, DOC, or DOCX
                  </span>
                  <span className="mt-1 inline-flex items-center gap-2 rounded-full bg-indigo-100 px-4 py-2 text-sm font-medium text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-200">
                    <Sparkles aria-hidden="true" className="size-4" />
                    We’ll auto-fill the form from your resume
                  </span>
                </>
              )}
            </button>

            {resumeFile && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={clearResume}
                  disabled={saving}
                  aria-label="Remove selected resume"
                >
                  <Trash2 className="text-red-500" />
                </Button>
              </>
            )}

            {parseError && (
              <p className="mt-1 text-sm text-destructive">{parseError}</p>
            )}
          </div>

          {resumeError && (
            <p id="cand-resume-error" className="mt-1 text-sm text-destructive">
              {resumeError}
            </p>
          )}
        </Field>

        <Field
          label="Full Name"
          htmlFor="cand-name"
          required
          error={fieldErrors.name}
        >
          <Input
            id="cand-name"
            error={fieldErrors.name}
            value={form.name}
            onChange={(e) => setField("name", e.target.value)}
            placeholder="e.g. Jane Smith"
            required
          />
        </Field>

        <Field
          label="Email"
          htmlFor="cand-email"
          required
          error={fieldErrors.email}
        >
          <Input
            id="cand-email"
            type="email"
            error={fieldErrors.email}
            value={form.email}
            onChange={(e) => setField("email", e.target.value)}
            placeholder="jane@example.com"
            required
          />
        </Field>

        <Field
          label="Phone"
          htmlFor="cand-phone"
          required
          error={fieldErrors.phone}
        >
          <Input
            id="cand-phone"
            error={fieldErrors.phone}
            value={form.phone}
            onChange={(e) => setField("phone", e.target.value)}
            placeholder="+1 555 000 0000"
            required
          />
        </Field>

        <Field
          label="Location"
          htmlFor="cand-location"
          required
          error={fieldErrors.location}
        >
          <Input
            id="cand-location"
            error={fieldErrors.location}
            value={form.location}
            onChange={(e) => setField("location", e.target.value)}
            placeholder="e.g. Noida, India"
            required
          />
        </Field>

        <Field
          label="Residential Address"
          htmlFor="cand-address"
          required
          className="col-span-full"
          error={fieldErrors.address}
        >
          <Textarea
            id="cand-address"
            error={fieldErrors.address}
            value={form.address}
            onChange={(e) => setField("address", e.target.value)}
            placeholder="Full residential address"
            rows={2}
            required
          />
        </Field>

        <Field
          label="Current Role"
          htmlFor="cand-role"
          required
          error={fieldErrors.currentRole}
        >
          <Input
            id="cand-role"
            error={fieldErrors.currentRole}
            value={form.currentRole}
            onChange={(e) => setField("currentRole", e.target.value)}
            placeholder="e.g. Senior Engineer"
            required
          />
        </Field>

        <Field
          label="Current Company"
          htmlFor="cand-company"
          required
          error={fieldErrors.currentCompany}
        >
          <Input
            id="cand-company"
            error={fieldErrors.currentCompany}
            value={form.currentCompany}
            onChange={(e) => setField("currentCompany", e.target.value)}
            placeholder="e.g. Acme Corp"
            required
          />
        </Field>

        <Field
          label="Years of Experience"
          htmlFor="cand-exp"
          required
          error={fieldErrors.yearsExperience}
        >
          <Input
            id="cand-exp"
            type="number"
            error={fieldErrors.yearsExperience}
            min="0"
            step="0.5"
            value={form.yearsExperience}
            onChange={(e) => setField("yearsExperience", e.target.value)}
            placeholder="e.g. 5"
            required
          />
        </Field>

        <Field
          label="Skills (comma-separated)"
          htmlFor="cand-skills"
          required
          error={fieldErrors.skills}
        >
          <Input
            id="cand-skills"
            error={fieldErrors.skills}
            value={form.skills}
            onChange={(e) => setField("skills", e.target.value)}
            placeholder="e.g. React, TypeScript, Node.js"
            required
          />
        </Field>

        <Field
          label="Current CTC"
          htmlFor="cand-current-ctc"
          required
          error={fieldErrors.currentSalary}
        >
          <Input
            id="cand-current-ctc"
            error={fieldErrors.currentSalary}
            value={form.currentSalary}
            onChange={(e) => setField("currentSalary", e.target.value)}
            placeholder="e.g. 12 LPA"
            required
          />
        </Field>

        <Field
          label="Expected CTC"
          htmlFor="cand-expected-ctc"
          required
          error={fieldErrors.expectedSalary}
        >
          <Input
            id="cand-expected-ctc"
            error={fieldErrors.expectedSalary}
            value={form.expectedSalary}
            onChange={(e) => setField("expectedSalary", e.target.value)}
            placeholder="e.g. 15 LPA"
            required
          />
        </Field>

        <Field
          label="Notice period"
          htmlFor="cand-notice-period"
          required
          error={fieldErrors.noticePeriod}
        >
          <Input
            id="cand-notice-period"
            error={fieldErrors.noticePeriod}
            value={form.noticePeriod}
            onChange={(e) => setField("noticePeriod", e.target.value)}
            placeholder="e.g. 30 days"
            required
          />
        </Field>

        <Field
          label="Source"
          htmlFor="cand-source"
          required
          error={fieldErrors.source}
        >
          <Select
            items={SOURCE_FORM_ITEMS}
            value={form.source}
            onValueChange={(value) =>
              setField("source", (value ?? "") as CandidateSource | "")
            }
          >
            <SelectTrigger
              id="cand-source"
              className={`w-full ${fieldErrors.source ? "border-red-400" : ""}`}
              aria-required
              aria-invalid={Boolean(fieldErrors.source)}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SOURCE_FORM_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <div className="col-span-full flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            loading={saving}
            disabled={saving || parsingResume}
          >
            {createdCandidateId ? "Retry Resume Upload" : "Create Candidate"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

interface Filters {
  q: string;
  source: string;
}

export function Candidates() {
  const { me } = useAuth();
  const userRole = me?.role ?? "";
  const canCreate = CAN_CREATE.has(userRole);

  const [filters, setFilters] = useState<Filters>({ q: "", source: "" });
  const [showNew, setShowNew] = useState(false);
  const [candidateToDelete, setCandidateToDelete] = useState<Candidate | null>(
    null,
  );
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const queryParams = new URLSearchParams();
  if (filters.q) queryParams.set("q", filters.q);
  if (filters.source) queryParams.set("source", filters.source);
  const queryString = queryParams.toString();

  const handleDeleteCandidate = async () => {
    if (!candidateToDelete) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      await apiDelete(`/candidates/${candidateToDelete.id}`);
      setCandidateToDelete(null);
      await refetch();
    } catch (error: unknown) {
      setDeleteError(
        error instanceof Error ? error.message : "Failed to delete candidate.",
      );
    } finally {
      setDeletePending(false);
    }
  };

  const {
    data: candidates,
    isLoading,
    error,
    refetch,
  } = useApiQuery<Candidate[]>(
    ["candidates", filters.q, filters.source],
    `/candidates${queryString ? "?" + queryString : ""}`,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Candidates"
        subtitle="All candidates in the system"
        actions={
          canCreate ? (
            <Button onClick={() => setShowNew(true)}>New Candidate</Button>
          ) : undefined
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          placeholder="Search candidates…"
          className="w-64"
        />
        <Select
          items={SOURCE_FILTER_ITEMS}
          value={filters.source}
          onValueChange={(value) =>
            setFilters((f) => ({ ...f, source: value ?? "" }))
          }
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_FILTER_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      )}

      {error && !isLoading && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-300">
          Failed to load candidates: {error.message}
        </div>
      )}

      {!isLoading && !error && (candidates ?? []).length === 0 && (
        <EmptyState
          title="No candidates found"
          description="Try adjusting filters or add a new candidate."
          actions={
            canCreate ? (
              <Button onClick={() => setShowNew(true)}>New Candidate</Button>
            ) : undefined
          }
        />
      )}

      {!isLoading && !error && (candidates ?? []).length > 0 && (
        <Card>
          <Table>
            <Thead>
              <Tr>
                <Th>Name</Th>
                <Th>Current Role / Company</Th>
                <Th>Exp (yrs)</Th>
                <Th>Skills</Th>
                <Th>Source</Th>
                <Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {(candidates ?? []).map((c) => (
                <Tr key={c.id}>
                  <Td className="font-medium text-foreground">{c.name}</Td>
                  <Td className="text-muted-foreground">
                    {[c.currentRole, c.currentCompany]
                      .filter(Boolean)
                      .join(" @ ") || "—"}
                  </Td>
                  <Td className="text-muted-foreground text-center">
                    {c.yearsExperience != null ? c.yearsExperience : "—"}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {(c.skills ?? []).slice(0, 3).map((sk) => (
                        <Badge key={sk} variant="default">
                          {sk}
                        </Badge>
                      ))}
                      {(c.skills ?? []).length > 3 && (
                        <Badge variant="default">+{c.skills.length - 3}</Badge>
                      )}
                    </div>
                  </Td>
                  <Td>
                    {c.source ? (
                      <Badge variant={SOURCE_VARIANT[c.source] ?? "default"}>
                        {SOURCE_LABEL[c.source] ?? c.source}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/candidates/${c.id}`}
                        className="text-indigo-600 hover:text-indigo-800 text-sm font-medium hover:underline"
                      >
                        View
                      </Link>
                      {canCreate && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive"
                          aria-label={`Remove ${c.name}`}
                          title={`Remove ${c.name}`}
                          onClick={() => {
                            setDeleteError(null);
                            setCandidateToDelete(c);
                          }}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Card>
      )}

      <NewCandidateModal
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={() => refetch()}
      />
      <AlertDialog
        open={candidateToDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deletePending) {
            setCandidateToDelete(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this candidate?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes “{candidateToDelete?.name}”, their
              uploaded CV files, applications, interviews, feedback, and
              communications. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p role="alert" className="text-sm text-destructive">
              Failed to remove candidate: {deleteError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deletePending}
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteCandidate();
              }}
            >
              {deletePending ? "Removing…" : "Remove candidate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
