# Picode HR — Recruitment & Project Staffing Platform — Design

- **Date:** 2026-06-08
- **Owner:** Picode (internal tool)
- **Status:** Approved design, ready for implementation planning
- **Working name:** HireOps (Picode HR)

## 1. Purpose

A recruitment and project-staffing command center for Picode. It manages the full
hiring lifecycle — from role creation to candidate joining — and connects hiring
directly to project delivery needs, giving HR, hiring managers, project managers,
interviewers, and leadership real-time visibility into open roles, staffing gaps,
hiring risks, and upcoming joiners.

Two explicit goals drive every design decision:

1. **Support large-scale recruitment** — high CV/interview/role volume without the
   request path ever blocking on parsing or AI.
2. **Save HR time** — automate the manual work: CV screening, scheduling
   coordination, feedback chasing, message drafting, and status tracking.

This is a single coherent platform built for full scope. It is **not** phased into
MVP vs. target state.

## 2. Confirmed Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Tenancy | Single internal org | One company (Picode). No tenant isolation; simpler model. |
| AI layer | Full AI ON (Claude + pgvector) | AI screening is the core HR time-saver; pgvector enables talent-pool search at scale. |
| Calendar | Real Google Calendar OAuth | Free/busy checks + auto invites remove scheduling back-and-forth at volume. |
| Auth | Google SSO (OAuth) | Internal Google Workspace org; no password management. |
| Heavy work | BullMQ + Redis worker process | Bulk parsing/screening/alerts run async; API stays responsive. |
| Headcount increment | `headcountCountsOn` config, default `OFFER_ACCEPTED` | Business preference per §14.5; configurable in admin. |
| Role closure | Human-confirmed with captured summary | System suggests closure when filled ≥ required; never auto-closes (§14.9). |

## 3. Stack

- **Backend:** NestJS · Prisma · PostgreSQL (with `pgvector`) · Passport (Google OAuth) ·
  Zod (shared schemas) · BullMQ.
- **Worker:** NestJS standalone application running BullMQ consumers.
- **Frontend:** React + Vite · TypeScript · Tailwind + shadcn/ui · TanStack Query · React Router.
- **Shared:** `packages/shared` — TS types + Zod schemas, single source of truth for API contracts.
- **AI:** Claude API (Anthropic SDK) for parsing, matching, summaries, generation; pgvector
  for semantic talent-pool retrieval.
- **Storage:** `StorageService` interface — `LocalDiskStorage`/MinIO (dev), `S3Storage` (prod).
- **Infra:** Docker Compose — `api`, `web`, `worker`, `postgres` (pgvector), `redis`, `minio`.

## 4. Repository Layout

```
picode-hr/
├─ apps/
│  ├─ api/        NestJS REST API, RBAC, domain logic
│  ├─ web/        React + Vite SPA
│  └─ worker/     NestJS standalone — BullMQ consumers (parse, AI, alerts)
├─ packages/
│  └─ shared/     TS types + Zod schemas shared by api, web, worker
├─ prisma/        schema.prisma, migrations, seed
├─ docker-compose.yml
└─ docs/superpowers/specs/
```

**Boundaries:** Only the API and worker touch the DB. The web app talks only to the
API. `packages/shared` is the one place request/response shapes are defined, so
frontend and backend never drift.

## 5. Architecture Principles

- **Async everything heavy.** Bulk CV upload, parsing, AI screening, AI summaries, and
  alert sweeps are BullMQ jobs with progress + retries. The HTTP request path never
  blocks on parsing or model calls.
- **Computed, not stored, for derived values.** `remainingCount`, all gap types,
  staffing/role risk, and dashboard rollups are derived. The worker pre-computes
  rollups so dashboards are instant reads.
- **Pagination + indexing by default.** Every list endpoint is paginated and filterable;
  hot filter columns are indexed. No unbounded queries.
- **Small, focused units.** One NestJS module per bounded context, each with its own
  controller/service/repository and a clear single responsibility.
- **Immutability in domain logic.** Operations return new objects; no in-place mutation
  of domain entities.

## 6. Bounded Contexts (NestJS Modules)

| Module | Responsibility |
|---|---|
| `auth` | Google OAuth login, sessions/JWT, current-user resolution. |
| `users` | User records, the 6 roles, admin invites, activation. |
| `config` | Departments, skills, seniority levels, pipeline-stage templates, feedback templates, alert rules, `headcountCountsOn`. |
| `projects` | Projects + computed staffing rollups and risk. |
| `roles` | Requisitions, headcount, statuses, fulfillment, closure. |
| `candidates` | Profiles, CV upload (single + bulk), dedup, talent pool, embeddings. |
| `applications` | Candidate↔role link, current stage, screening result, outcome. Unique (candidate, role). |
| `screening` | `ScreeningService` interface; `ClaudeScreeningService` default, `RuleBasedScreeningService` fallback. |
| `pipeline` | Stage transitions, stage history, duration, bottleneck data, bulk movement. |
| `ai` | Claude-backed CV parser, match scorer, screening summary, role builder, interview-guide generator, feedback summarizer, talent-pool matcher, hiring-risk detector. |
| `communications` | Logged comms + AI-drafted templated messages. |
| `interviews` | Google Calendar OAuth, free/busy availability, auto slot suggestions, invites + Meet links, status. |
| `feedback` | Structured forms bound to templates + AI cross-interviewer summary. |
| `offers` | Offer status + joining tracker; drives filled-count automation. |
| `dashboards` | Read-only aggregation: executive, HR-ops, project-staffing, role-level, joining tracker, gap analysis. |
| `notifications` | Rule-driven alerts → in-app + email; Teams/Slack pluggable. |

## 7. AI Layer

- **CV parsing:** PDF/DOCX → text (`pdf-parse` / `mammoth`) → Claude extracts the §7.5
  structured fields → stored as `CvFile.parsedJson`. Runs as a queue job.
- **Match scoring:** Claude scores each application against role criteria, producing the
  §6.6 output (overall match, skills/experience/seniority/industry/location fit,
  strengths, gaps, risk flags, suggested questions, recommended next step).
- **Talent-pool matching at scale:** pgvector embeddings produce a cheap semantic
  top-K shortlist across the full candidate pool; Claude then precisely scores only the
  top-K. Keeps cost and latency bounded as the pool grows.
- **Generation:** AI role builder, interview guides, feedback summaries, draft candidate
  messages — all behind typed service methods.
- **Guardrail (§6.6):** AI is advisory only. It never auto-rejects or auto-selects;
  every output attaches to a human decision point.
- **Cost control & auditability:** `AiResult` records cache outputs keyed by input hash
  (re-screening doesn't re-call), store model + prompt version, and the rule-based
  fallback covers Claude outages or offline mode.

## 8. Screening Seam

```ts
interface ScreeningService {
  score(application: Application, role: Role, parsedCv: ParsedCv): Promise<ScreeningResult>
}

type ScreeningResult = {
  matchScore: number            // 0–100
  skillsMatch: number
  experienceMatch: number
  seniorityFit: number
  industryRelevance: number
  locationFit: number
  strengths: string[]
  gaps: string[]
  riskFlags: string[]
  suggestedHrQuestions: string[]
  suggestedInterviewerQuestions: string[]
  recommendationCategory:
    | 'STRONG_SHORTLIST' | 'SHORTLIST_MINOR_CONCERNS'
    | 'NEEDS_HR_CLARIFICATION' | 'NOT_SUITABLE' | 'BETTER_FIT_OTHER_ROLE'
}
```

Default impl `ClaudeScreeningService`; `RuleBasedScreeningService` (skill overlap %,
experience-vs-required, seniority match, weighted) is the fallback. Swapping is a DI
change; pipeline, UI, and DB shapes do not move.

## 9. Data Model (Prisma / PostgreSQL)

Core entities follow brief §19, with supporting tables and scale additions.

- **User** — id, email, name, googleId, role (`HR | HIRING_MANAGER | PROJECT_MANAGER | INTERVIEWER | LEADERSHIP | ADMIN`), isActive.
- **Department**, **Skill**, **SeniorityLevel** — config lookups.
- **Project** — id, name, client, projectManagerId, startDate, endDate, status. Staffing counts/risk computed.
- **Role** — id, projectId, title, departmentId, seniority, requiredCount, **filledCount**, location, employmentType, jobDescription, responsibilities, requiredSkills[], preferredSkills[], requiredYearsExperience, education, certifications, languages, salaryRange, targetJoiningDate, targetClosureDate, priority, status (`DRAFT | PENDING_APPROVAL | OPEN | IN_PROGRESS | ON_HOLD | FILLED | CANCELLED | CLOSED`), hiringManagerId, hrOwnerId, pipelineTemplateId. `remainingCount` derived = required − filled.
- **Candidate** — id, name, email, phone, location, currentCompany, currentRole, yearsExperience, skills[], education, certifications, noticePeriod, expectedSalary, currentSalary, linkedinUrl, portfolioUrl, source, tags[], createdAt, **embedding (pgvector)**.
- **CvFile** — id, candidateId, storageKey, parsedJson, uploadedAt.
- **Application** — id, candidateId, roleId, currentStageId, matchScore, screeningSummary, hrRecommendation, interviewStatus, feedbackStatus, offerStatus, status, rejectionReason. **Unique (candidateId, roleId).**
- **PipelineStageTemplate** — configurable stages per role type. **StageTransition** — applicationId, fromStage, toStage, at, byUserId (history + duration).
- **Interview** — id, applicationId, stage, interviewerIds[], scheduledAt, durationMin, meetingLink, icsUid, googleEventId, status (`SCHEDULED | COMPLETED | RESCHEDULED | CANCELLED | CANDIDATE_NO_SHOW | INTERVIEWER_NO_SHOW`).
- **FeedbackTemplate** — configurable fields, mandatory/optional questions, rating weights, by role type/seniority/stage. **Feedback** — id, interviewId, interviewerId, scores (json), strengths, concerns, notes, recommendation (`STRONG_HIRE | HIRE | HOLD | REJECT | CONSIDER_OTHER_ROLE`), submittedAt.
- **CommunicationLog** — id, candidateId, applicationId?, type, ownerId, summary, candidateResponse, nextAction, followUpDate, attachmentKey?, createdAt.
- **Offer** — id, applicationId, offeredSalary, offerDate, status (`TO_BE_PREPARED | SENT | UNDER_NEGOTIATION | ACCEPTED | REJECTED | JOINED`), expectedJoiningDate, confirmedJoiningDate, noticePeriod, documentsPending, joiningRisk, notes.
- **Notification** — id, userId, type, payload, readAt. **AlertRule** — config (threshold, target roles).
- **AiResult** — id, type, inputHash, model, promptVersion, output (json), createdAt (cache + audit).
- **AuditLog** — actorId, action, entity, entityId, metadata, at.
- **CalendarCredential** — userId, encrypted Google refresh token, scopes.
- **OrgSetting** — singleton incl. `headcountCountsOn` (`OFFER_ACCEPTED | JOINED`).

**Indexes:** Application(roleId, currentStageId, status), Role(projectId, status, priority),
Offer(status, confirmedJoiningDate), Candidate(email), Interview(scheduledAt, status),
CommunicationLog(followUpDate). pgvector index on Candidate.embedding.

## 10. Business Rules (from §14)

1. Every role has an HR owner and a hiring manager.
2. A role can have multiple required positions.
3. One candidate may be linked to multiple roles (independent outcomes per role).
4. Candidate selection does not by itself fill the role.
5. `filledCount` increments when an application reaches the stage configured by
   `headcountCountsOn` (default `OFFER_ACCEPTED`); decrements on reversal.
6. AI recommends but never makes final hiring decisions.
7. Interview feedback is required before final selection unless HR explicitly overrides
   (override is logged).
8. All communication is logged.
9. A role closes only when required count is fulfilled, cancelled, or manually closed
   with a captured reason + closure summary.
10. Project staffing risk updates automatically from role gaps and joining timelines.
11. Candidate data is access-controlled per §15.
12. Sensitive fields visible only to authorized roles.

## 11. RBAC (from §15)

`@Roles()` guard plus per-resource ownership checks, enforced at the API:

- **HR** — full recruitment workflow access.
- **Hiring Manager** — only roles/candidates tied to their roles.
- **Project Manager** — project staffing + linked role progress.
- **Interviewer** — only assigned interviews and the candidate data needed for them.
- **Leadership** — read-only dashboards and reports.
- **Admin** — full configuration and user management.

The UI hides what the API would reject; the API is the source of truth.

## 12. Cross-Cutting Concerns

- **Validation:** Zod schemas in `packages/shared` validate every request body; reject
  with clear per-field errors.
- **Error handling:** consistent `{ success, data, error }` envelope; full server-side
  context logged; friendly client messages; no swallowed errors.
- **File access:** CVs served only through an authz check, never directly.
- **Calendar tokens:** Google refresh tokens encrypted at rest per interviewer.
- **Alerts engine (§9):** worker evaluates `AlertRule`s (feedback pending > 24h; role
  with no shortlist after N days; offer not sent after selection; project starting with
  open gaps; candidate joining with documents pending; required count fulfilled;
  candidate unresponsive after follow-up; high-priority role delayed) → writes
  `Notification` rows + sends email. In-app bell + email; Teams/Slack pluggable.

## 13. Dashboards (§8)

Read-only aggregation endpoints, backed by worker-precomputed rollups:

- **Executive** — open roles, required/filled/gap, high-priority + high-risk roles,
  offers in progress, upcoming joiners, delayed roles, project staffing risks.
- **HR operational** — CVs pending review, candidates per stage, interviews
  scheduled / to schedule, feedback pending, offers pending, follow-ups due, joining
  soon, delayed candidates, roles with no shortlist.
- **Project staffing** — per project: required/filled/gap, in-progress candidates,
  confirmed joiners, expected dates, risk.
- **Role-level** — required/filled/remaining, CVs uploaded, AI strong matches,
  shortlisted, interviews completed, offers in progress, expected joiners, days open,
  target closure, risk.
- **Joining tracker** — who/role/project/date/offer status/onboarding/docs/risk.
- **Gap analysis** — role, skill, timeline, pipeline, offer, and feedback gaps (§8.6),
  all computed.

## 14. Key Screens (§12)

Login (SSO), home dashboard, role list, role detail, candidate list, candidate profile,
pipeline board (Kanban, drag-and-drop, bulk move), interview calendar, dynamic feedback
form, joining tracker, project staffing view, reports, admin configuration.

## 15. Testing Strategy

- **Unit:** screening math, headcount/closure/risk/gap calculators, .ics + calendar slot
  logic, AI output parsers. TDD on pure logic.
- **Integration:** every endpoint against a test Postgres, including RBAC denials and the
  full application lifecycle.
- **E2E:** the §13 critical journeys — role creation, candidate screening, interview,
  selection/offer, project staffing.
- **AI:** services tested against recorded fixtures; tests never hit the live model.
- **Coverage:** 80%+ on domain logic.

## 16. Build Order

Sequence (one platform, not phases):

1. Foundation — auth/users/config, repo + Docker scaffold, Prisma schema.
2. Projects + roles (headcount, statuses, closure).
3. Candidates + bulk CV upload + parsing (worker).
4. AI layer — parser, match scorer, screening (Claude + pgvector).
5. Applications + pipeline (stages, history, bulk move).
6. Communications (logging + AI message drafts).
7. Interviews + Google Calendar (OAuth, free/busy, invites).
8. Feedback + AI cross-interviewer summary.
9. Offers + joining tracker + filled-count automation.
10. Dashboards + gap analysis.
11. Alerts + notifications.

## 17. Success Metrics (§20)

Time to fill; CV-upload→shortlist time; interview→feedback time; selection→offer time;
roles closed on time; offer acceptance + joining rates; project staffing gaps and
high-risk roles; CVs screened per recruiter; manual screening time reduced; follow-up
completion.

## 18. Out of Scope (deferred)

Candidate self-service portal; public job-board/LinkedIn integrations; recruitment-agency
portal; predictive time-to-fill; cost-per-hire; offer-letter generation + e-signature;
background verification; full onboarding workflow; workforce planning; AI demand
forecasting. The architecture leaves clean seams (pluggable notifications, storage,
screening, calendar providers) for these.
