# Picode HR (HireOps) — Plan Roadmap

> The platform (spec: `docs/superpowers/specs/2026-06-08-hireops-design.md`) is built as a
> sequence of plans, each producing working, testable software. Plans are written
> **one at a time against real existing code** — when a plan finishes, the next is
> written so its file paths and code are accurate, not speculative.

| # | Plan | Delivers (demoable exit criteria) | Depends on |
|---|---|---|---|
| 01 | **Foundation** | Monorepo + Docker (postgres/pgvector, redis, minio) up; Prisma migrated; Google SSO login works; users + RBAC guard; config CRUD (departments, skills, seniority, org settings); minimal web shell with login + admin config page. | — |
| 02 | **Projects & Roles** | Create/edit projects and roles (requisitions) with headcount, statuses, priorities; computed `remainingCount`; role list/detail screens; closure flow with captured summary. | 01 |
| 03 | **Candidates & CV ingestion** | Candidate profiles + talent pool; single + bulk CV upload to storage; worker parses PDF/DOCX text; dedup; candidate list/profile screens; upload progress. | 01 |
| 04 | **AI layer** | `ai` module: Claude CV-field extraction, match scorer, screening summary; `ScreeningService` (Claude default + rule-based fallback); pgvector embeddings + top-K talent search; `AiResult` caching; fixtures for tests. | 03, 02 |
| 05 | **Applications & Pipeline** | Application (candidate↔role, unique); configurable pipeline-stage templates; Kanban board with drag-and-drop + bulk move; stage history + duration; bottleneck data. | 02, 03, 04 |
| 06 | **Communications** | Logged communications (all types); follow-up reminders; AI-drafted editable message templates (invite, rejection, follow-up, etc.). | 05, 04 |
| 07 | **Interviews & Google Calendar** | Google Calendar OAuth per interviewer (encrypted tokens); free/busy availability; suggested slots; auto invite + Meet link; reschedule/cancel; interview statuses; `.ics` fallback. | 05 |
| 08 | **Feedback** | Configurable feedback templates (by role/seniority/stage, weighted); dynamic feedback form; submission tracking (pending/delayed/conflicting); AI cross-interviewer summary. | 07, 04 |
| 09 | **Offers & Joining** | Offer lifecycle + statuses; joining tracker; `headcountCountsOn`-driven filled-count automation (increment/decrement); closure suggestion when filled ≥ required. | 05, 02 |
| 10 | **Dashboards & Gap Analysis** | Worker-precomputed rollups; executive / HR-ops / project-staffing / role-level / joining-tracker dashboards; six gap types; saved views; filters. | 02–09 |
| 11 | **Alerts & Notifications** | `AlertRule` engine in worker; in-app bell + email; the §9 alert set; pluggable Teams/Slack seam. | 02–10 |

## Conventions every plan follows
- **TDD:** failing test → run (fail) → minimal impl → run (pass) → commit. Bite-sized steps.
- **Shapes** live in `packages/shared` (Zod + types); API and web import from there.
- **API envelope:** `{ success, data, error }` everywhere.
- **RBAC** enforced at the API (`@Roles()` + ownership checks); UI only hides.
- **Heavy work** (parse/AI/alerts/bulk) runs in the `worker` via BullMQ, never inline.
- **Commits** are frequent and conventional (`feat:`, `test:`, `chore:`).

## Status — all backend modules executed on branch `feat/foundation` (34 commits; 453 tests green; shared/api/worker/web typechecks clean)
- [x] Spec approved & committed
- [x] **Plan 01 — Foundation** (+ security-review hardening): monorepo, Docker, Google SSO, RBAC, config CRUD, global error filter.
- [x] **Plan 02 — Projects & Roles**: requisitions, headcount, statuses, closure, project staffing summary.
- [x] **Plan 03 — Candidates & CV**: candidates/talent pool, CV upload, storage port, queue producer + worker text extraction.
- [x] **Plan 04 — AI layer**: LLM port + cache, ScreeningService (rule-based + Claude), CV structured parse + enrichment, generators (role builder, interview guide, feedback summary, risk report).
- [x] **Plan 05 — Applications & Pipeline**: applications (unique candidate↔role), configurable stages, transitions/history, kanban grouping, screening integration.
- [x] **Plan 06 — Communications**: logged comms (all channels), follow-ups, AI message drafting.
- [x] **Plan 07a — Interviews**: scheduling, `.ics` generation, calendar port (fake default), slot suggestion.
- [x] **Plan 08 — Feedback**: configurable templates, structured feedback, pending/delayed/conflicting tracking, AI cross-interviewer summary.
- [x] **Plan 09 — Offers & Joining**: offer lifecycle, joining tracker, `headcountCountsOn`-driven filled-count automation (+ decrement on reversal).
- [x] **Plan 10 — Dashboards & Gap Analysis**: executive / HR-ops / project-staffing / role / joining dashboards, six gap types, saved views.
- [x] **Plan 11 — Alerts & Notifications**: 8-rule pure alert engine, notifications API, scheduled worker sweep with dedup.

### Web UI — built (React + Vite SPA, all spec §12 screens)
- [x] **UI foundation**: Tailwind, hand-rolled UI kit, React Router, role-aware app shell + nav, TanStack Query data hooks, notifications bell.
- [x] **Dashboard** (role-aware: executive + HR-ops), **Roles** (list/detail/close), **Projects** (+ live staffing risk).
- [x] **Candidates** (list/profile/CV upload + parsed fields) and **Pipeline** kanban (move/screen/reject/add).
- [x] **Interviews** (schedule, slot suggestions, status, reschedule/cancel) and **Feedback** (dynamic template form, tracking, AI summary).
- [x] **Offers**, **Joining tracker**, **Notifications** centre, **Communications** log + AI draft (on candidate profile).

### Deferred (explicit — not yet built)
- [ ] **Plan 07b — Google Calendar adapter** (live OAuth + free/busy + token encryption) — needs Google Workspace creds. Calendar runs behind a fake port today.
- [ ] **pgvector talent-pool semantic matcher** — needs an embeddings provider/key (Claude has no embeddings API).
- [ ] **Live keys / manual smoke tests** — real `ANTHROPIC_API_KEY` (AI features default to rule-based/no-op without it), Google SSO browser round-trip in a browser, real email delivery (LogNotifier stub today).
- [ ] **UI component test coverage** — pages verified via `tsc` + `vite build`; only the nav filter + API client have unit tests. No browser/E2E pass yet.
- [ ] **Branch not merged** — work sits on `feat/foundation`.
