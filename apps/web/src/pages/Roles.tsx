import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useApiQuery, useApiMutation } from "../api/hooks";
import { apiDelete, apiSend } from "@/api/client";
import type { RoleDraft } from "@picode-hr/shared";
import { Trash2 } from "lucide-react";
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
  Textarea,
  Spinner,
  EmptyState,
  Card,
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

export interface Role {
  id: string;
  title: string;
  status: RoleStatus;
  priority: Priority;
  requiredCount: number;
  filledCount: number;
  projectId?: string;
  department?: string;
  seniority?: string;
  jobDescription?: string;
}

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

interface Project {
  id: string;
  name: string;
}

interface Department {
  id: string;
  name: string;
}

interface Seniority {
  id: string;
  name: string;
}

interface Skill {
  id: string;
  name: string;
}

interface NewRoleForm {
  title: string;
  department: string;
  seniority: string;
  requiredCount: string;
  priority: Priority | "";
  jobDescription: string;
  responsibilities: string;
  projectId: string;
  requiredSkills: string[];
}

// ── Badge helpers ──────────────────────────────────────────────────────────

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

const PRIORITY_OPTIONS: Priority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

const PRIORITY_FORM_ITEMS = [
  { value: "", label: "Select priority…" },
  ...PRIORITY_OPTIONS.map((p) => ({ value: p, label: p })),
];

const STATUS_FILTER_ITEMS = [
  { value: "", label: "All Statuses" },
  ...STATUS_OPTIONS.map((s) => ({ value: s, label: s.replace("_", " ") })),
];

const PRIORITY_FILTER_ITEMS = [
  { value: "", label: "All Priorities" },
  ...PRIORITY_OPTIONS.map((p) => ({ value: p, label: p })),
];

const CAN_CREATE_ROLES = new Set(["ADMIN", "HR", "HIRING_MANAGER"]);

const EMPTY_FORM: NewRoleForm = {
  title: "",
  department: "",
  seniority: "",
  requiredCount: "1",
  priority: "",
  jobDescription: "",
  responsibilities: "",
  projectId: "",
  requiredSkills: [],
};

// ── New Role Modal ─────────────────────────────────────────────────────────

interface NewRoleModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

function NewRoleModal({ open, onClose, onCreated }: NewRoleModalProps) {
  const [form, setForm] = useState<NewRoleForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [createdSkills, setCreatedSkills] = useState<Skill[]>([]);

  const { data: departments } = useApiQuery<Department[]>(
    ["config", "departments"],
    "/config/departments",
  );
  const { data: seniorities } = useApiQuery<Seniority[]>(
    ["config", "seniority"],
    "/config/seniority",
  );
  const { data: projects } = useApiQuery<Project[]>(["projects"], "/projects");
  const { data: skills } = useApiQuery<Skill[]>(
    ["config", "skills"],
    "/config/skills",
  );
  const allSkills = [...(skills ?? []), ...createdSkills];

  const mutation = useApiMutation<Role>("/roles", "POST", [["roles"]]);

  const setField = <K extends keyof NewRoleForm>(
    key: K,
    value: NewRoleForm[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleGenerate = async () => {
    if (!form.title.trim()) {
      setFormError("Enter a title first.");
      return;
    }
    // Don't silently throw away text the user already wrote.
    if (
      form.jobDescription.trim() &&
      !window.confirm("Replace the current job description with an AI draft?")
    ) {
      return;
    }
    setGenerating(true);
    setFormError(null);
    try {
      // The form stores the seniority ID; the AI needs the readable name.
      const seniorityName = seniorities?.find(
        (s) => s.id === form.seniority,
      )?.name;
      const draft = await apiSend<RoleDraft>("/ai/role-builder", "POST", {
        title: form.title.trim(),
        seniority: seniorityName,
        mustHaves: form.requiredSkills.length
          ? form.requiredSkills.join(", ")
          : undefined,
      });
      setField("jobDescription", draft.jobDescription);
      setField("responsibilities", draft.responsibilities.join("\n"));
      setAiNote("AI draft — review and edit before saving.");
    } catch (e: unknown) {
      setFormError(
        e instanceof Error ? e.message : "Failed to generate job description.",
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      setFormError("Title is required.");
      return;
    }
    if (!form.priority) {
      setFormError("Priority is required.");
      return;
    }
    setFormError(null);
    try {
      await mutation.mutateAsync({
        title: form.title.trim(),
        departmentId: form.department || undefined,
        seniorityId: form.seniority || undefined,
        requiredCount: parseInt(form.requiredCount, 10) || 1,
        priority: form.priority,
        jobDescription: form.jobDescription || undefined,
        responsibilities: form.responsibilities || undefined,
        projectId: form.projectId || undefined,
        requiredSkills: form.requiredSkills,
      });
      setForm(EMPTY_FORM);
      setAiNote(null);

      onCreated();
      onClose();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to create role.");
    }
  };

  const handleClose = () => {
    setForm(EMPTY_FORM);
    setAiNote(null);

    setFormError(null);
    onClose();
  };

  const handlCreateSkill = async (name: string) => {
    const normalizedName = name.trim();

    // Prevent duplicates in the current list.
    const existing = allSkills.find(
      (skill) => skill.name.toLowerCase() === normalizedName.toLowerCase(),
    );

    if (existing) {
      setField("requiredSkills", [
        ...new Set([...form.requiredSkills, existing.name]),
      ]);
      return;
    }

    try {
      // Replace with your actual API client method.
      const response = await apiSend<Skill>("/config/skills", "POST", {
        name: normalizedName,
      });

      const newSkill = response;

      setCreatedSkills((previous) => [...previous, newSkill]);

      setField("requiredSkills", [
        ...new Set([...form.requiredSkills, newSkill.name]),
      ]);
    } catch (error) {
      // Display your application's toast/error message here.
      console.error("Failed to create skill:", error);
    }
  };

  const departmentItems = [
    { value: "", label: "Select department…" },
    ...(departments ?? []).map((d) => ({ value: d.id, label: d.name })),
  ];
  const seniorityItems = [
    { value: "", label: "Select seniority…" },
    ...(seniorities ?? []).map((s) => ({ value: s.id, label: s.name })),
  ];
  const projectItems = [
    { value: "", label: "No project" },
    ...(projects ?? []).map((p) => ({ value: p.id, label: p.name })),
  ];

  return (
    <Modal open={open} onClose={handleClose} title="New Role">
      <div className="space-y-4">
        {formError && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {formError}
          </div>
        )}

        <Field label="Title" htmlFor="role-title" required>
          <Input
            id="role-title"
            value={form.title}
            onChange={(e) => setField("title", e.target.value)}
            placeholder="e.g. Senior Backend Engineer"
          />
        </Field>

        <Field label="Priority" htmlFor="role-priority" required>
          <Select
            items={PRIORITY_FORM_ITEMS}
            value={form.priority}
            onValueChange={(value) =>
              setField("priority", (value ?? "") as Priority | "")
            }
          >
            <SelectTrigger id="role-priority" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_FORM_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Department" htmlFor="role-department">
          <Select
            items={departmentItems}
            value={form.department}
            onValueChange={(value) => setField("department", value ?? "")}
          >
            <SelectTrigger id="role-department" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {departmentItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Seniority" htmlFor="role-seniority">
          <Select
            items={seniorityItems}
            value={form.seniority}
            onValueChange={(value) => setField("seniority", value ?? "")}
          >
            <SelectTrigger id="role-seniority" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {seniorityItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Required Headcount" htmlFor="role-count">
          <Input
            id="role-count"
            type="number"
            min="1"
            value={form.requiredCount}
            onChange={(e) => setField("requiredCount", e.target.value)}
          />
        </Field>

        <Field label="Project" htmlFor="role-project">
          <Select
            items={projectItems}
            value={form.projectId}
            onValueChange={(value) => setField("projectId", value ?? "")}
          >
            <SelectTrigger id="role-project" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {projectItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {/* <Field label="Job Description" htmlFor="role-jd">
          <Textarea
            id="role-jd"
            value={form.jobDescription}
            onChange={(e) => setField('jobDescription', e.target.value)}
            placeholder="Describe the role…"
            rows={4}
          />
        </Field> */}

        <Field label="Skills" htmlFor="role-skills">
          <MultiSelect
            values={form.requiredSkills}
            onValuesChange={(values) => setField("requiredSkills", values)}
          >
            <MultiSelectTrigger id="role-skills" className="w-full">
              <MultiSelectValue placeholder="Select skills…" />
            </MultiSelectTrigger>
            <MultiSelectContent
              search={{
                placeholder: "Search skills…",
                emptyMessage: `No skills found. Add `,
              }}
              onCreateItem={handlCreateSkill}
            >
              <MultiSelectGroup>
                {(allSkills ?? []).map((s) => (
                  <MultiSelectItem key={s.id} value={s.name}>
                    {s.name}
                  </MultiSelectItem>
                ))}
              </MultiSelectGroup>
            </MultiSelectContent>
          </MultiSelect>
        </Field>

        <Field label="Job Description" htmlFor="role-jd">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Generate from title, seniority and skills — then edit.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleGenerate}
                loading={generating}
                disabled={generating || !form.title.trim()}
              >
                Generate with AI
              </Button>
            </div>
            <Textarea
              id="role-jd"
              value={form.jobDescription}
              onChange={(e) => setField("jobDescription", e.target.value)}
              placeholder="Describe the role…"
              rows={8}
            />
            {aiNote && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {aiNote}
              </p>
            )}
          </div>
        </Field>

        <Field label="Key Responsibilities" htmlFor="role-responsibilities">
          <Textarea
            id="role-responsibilities"
            value={form.responsibilities}
            onChange={(e) => setField("responsibilities", e.target.value)}
            placeholder="Add one responsibility per line…"
            rows={5}
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={mutation.isPending}>
            Create Role
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Filters ────────────────────────────────────────────────────────────────

interface Filters {
  status: string;
  priority: string;
}

// ── Page ───────────────────────────────────────────────────────────────────

export function Roles() {
  const { me } = useAuth();
  const role = me?.role ?? "";
  const canCreate = CAN_CREATE_ROLES.has(role);

  const [filters, setFilters] = useState<Filters>({ status: "", priority: "" });
  const [showNewRole, setShowNewRole] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const queryParams = new URLSearchParams();
  if (filters.status) queryParams.set("status", filters.status);
  if (filters.priority) queryParams.set("priority", filters.priority);
  const queryString = queryParams.toString();

  const {
    data: roles,
    isLoading,
    error,
    refetch,
  } = useApiQuery<Role[]>(
    ["roles", filters.status, filters.priority],
    `/roles${queryString ? "?" + queryString : ""}`,
  );

  const { data: projects } = useApiQuery<Project[]>(["projects"], "/projects");

  const projectMap = new Map((projects ?? []).map((p) => [p.id, p.name]));

  const handleDeleteRole = async () => {
    if (!roleToDelete) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      await apiDelete(`/roles/${roleToDelete.id}`);
      setRoleToDelete(null);
      await refetch();
    } catch (error: unknown) {
      setDeleteError(
        error instanceof Error ? error.message : "Failed to delete role.",
      );
    } finally {
      setDeletePending(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles"
        subtitle="Open and closed hiring roles"
        actions={
          canCreate ? (
            <Button onClick={() => setShowNewRole(true)}>New Role</Button>
          ) : undefined
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select
          items={STATUS_FILTER_ITEMS}
          value={filters.status}
          onValueChange={(value) =>
            setFilters((f) => ({ ...f, status: value ?? "" }))
          }
        >
          <SelectTrigger className="w-44">
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
        <Select
          items={PRIORITY_FILTER_ITEMS}
          value={filters.priority}
          onValueChange={(value) =>
            setFilters((f) => ({ ...f, priority: value ?? "" }))
          }
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRIORITY_FILTER_ITEMS.map((item) => (
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
          Failed to load roles: {error.message}
        </div>
      )}

      {!isLoading && !error && (roles ?? []).length === 0 && (
        <EmptyState
          title="No roles found"
          description="Try adjusting filters or create a new role."
          actions={
            canCreate ? (
              <Button onClick={() => setShowNewRole(true)}>New Role</Button>
            ) : undefined
          }
        />
      )}

      {!isLoading && !error && (roles ?? []).length > 0 && (
        <Card>
          <Table>
            <Thead>
              <Tr>
                <Th>Title</Th>
                <Th>Project</Th>
                <Th>Status</Th>
                <Th>Priority</Th>
                <Th>Required</Th>
                <Th>Filled</Th>
                <Th>Remaining</Th>
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody>
              {(roles ?? []).map((r) => {
                const remaining = r.requiredCount - r.filledCount;
                return (
                  <Tr key={r.id}>
                    <Td className="font-medium text-foreground">{r.title}</Td>
                    <Td className="text-muted-foreground">
                      {r.projectId
                        ? (projectMap.get(r.projectId) ?? r.projectId)
                        : "—"}
                    </Td>
                    <Td>
                      <Badge variant={STATUS_VARIANT[r.status] ?? "default"}>
                        {r.status.replace("_", " ")}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge
                        variant={PRIORITY_VARIANT[r.priority] ?? "default"}
                      >
                        {r.priority}
                      </Badge>
                    </Td>
                    <Td className="text-center">{r.requiredCount}</Td>
                    <Td className="text-center">{r.filledCount}</Td>
                    <Td className="text-center">
                      <span
                        className={
                          remaining > 0
                            ? "text-amber-600 font-medium"
                            : "text-green-600 font-medium"
                        }
                      >
                        {remaining}
                      </span>
                    </Td>
                    <Td>
                      <Link
                        to={`/roles/${r.id}`}
                        className="text-indigo-600 hover:text-indigo-800 text-sm font-medium hover:underline"
                      >
                        View
                      </Link>
                      {canCreate && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="ml-2 text-destructive"
                          aria-label={`Delete ${r.title}`}
                          title={`Delete ${r.title}`}
                          onClick={() => {
                            setDeleteError(null);
                            setRoleToDelete(r);
                          }}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </Card>
      )}

      <NewRoleModal
        open={showNewRole}
        onClose={() => setShowNewRole(false)}
        onCreated={() => refetch()}
      />
      <AlertDialog
        open={roleToDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deletePending) {
            setRoleToDelete(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this role?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes “{roleToDelete?.title}” and its
              applications and related hiring records. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p role="alert" className="text-sm text-destructive">
              Failed to delete role: {deleteError}
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
                void handleDeleteRole();
              }}
            >
              {deletePending ? "Deleting…" : "Delete role"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
