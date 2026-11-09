# Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Picode HR monorepo with Docker infra, a migrated Prisma schema, Google SSO login, role-based access control, and config CRUD — a demoable slice where an admin can log in and manage departments/skills/seniority/org settings.

**Architecture:** pnpm monorepo. `apps/api` (NestJS REST) is the only writer to PostgreSQL via Prisma. `apps/web` (React + Vite SPA) talks only to the API. `packages/shared` holds Zod schemas + TS types imported by both. Auth is Google OAuth → JWT; RBAC is a `@Roles()` decorator + guard enforced at the API. Heavy/async infra (redis, minio) is provisioned now but consumed in later plans.

**Tech Stack:** Node 20, pnpm, TypeScript, NestJS, Prisma, PostgreSQL (pgvector image), Passport (passport-google-oauth20, passport-jwt), Zod, Vitest, React + Vite, TanStack Query, React Router, Docker Compose.

---

## File Structure

```
picode-hr/
├─ package.json                      # root, workspace scripts
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ .nvmrc
├─ .env.example
├─ docker-compose.yml
├─ prisma/
│  ├─ schema.prisma                  # foundation entities
│  └─ seed.ts
├─ packages/shared/
│  ├─ package.json
│  ├─ tsconfig.json
│  ├─ vitest.config.ts
│  └─ src/
│     ├─ index.ts
│     ├─ envelope.ts                 # ApiResponse helpers
│     ├─ roles.ts                    # Role enum + helpers
│     └─ config.schemas.ts           # Zod schemas for config DTOs
└─ apps/
   ├─ api/
   │  ├─ package.json
   │  ├─ tsconfig.json
   │  ├─ vitest.config.ts
   │  └─ src/
   │     ├─ main.ts
   │     ├─ app.module.ts
   │     ├─ prisma/{prisma.service,prisma.module}.ts
   │     ├─ auth/{auth.module,auth.service,auth.controller,google.strategy,jwt.strategy,jwt-auth.guard}.ts
   │     ├─ rbac/{roles.decorator,roles.guard}.ts
   │     ├─ users/{users.module,users.service,users.controller}.ts
   │     ├─ config/{config.module,config.service,config.controller}.ts
   │     └─ health/health.controller.ts
   └─ web/
      ├─ package.json
      ├─ vite.config.ts
      ├─ index.html
      └─ src/{main.tsx,App.tsx,api/client.ts,auth/useAuth.ts,pages/Login.tsx,pages/AdminConfig.tsx}
```

---

## Task 1: Monorepo scaffold

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.nvmrc`

- [ ] **Step 1: Create `.nvmrc`**

```
20
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Create root `package.json`**

```json
{
  "name": "picode-hr",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "dev:api": "pnpm --filter @picode-hr/api dev",
    "dev:web": "pnpm --filter @picode-hr/web dev",
    "prisma:migrate": "prisma migrate dev",
    "prisma:seed": "tsx prisma/seed.ts",
    "infra:up": "docker compose up -d",
    "infra:down": "docker compose down"
  },
  "devDependencies": {
    "prisma": "^5.20.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 4: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "lib": ["ES2022"],
    "declaration": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

- [ ] **Step 5: Install pnpm and verify**

Run: `corepack enable && pnpm install`
Expected: completes; creates `pnpm-lock.yaml` and `node_modules/`.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .nvmrc pnpm-lock.yaml
git commit -m "chore: scaffold pnpm monorepo"
```

---

## Task 2: `packages/shared` — API envelope, roles, config schemas (TDD)

**Files:**
- Create: `packages/shared/package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `packages/shared/src/{index,envelope,roles,config.schemas}.ts`
- Test: `packages/shared/src/envelope.test.ts`, `packages/shared/src/config.schemas.test.ts`

- [ ] **Step 1: Create `packages/shared/package.json`**

```json
{
  "name": "@picode-hr/shared",
  "version": "0.0.0",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": { "zod": "^3.23.0" },
  "devDependencies": { "vitest": "^2.1.0", "typescript": "^5.6.0" }
}
```

- [ ] **Step 2: Create `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/shared/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node' } })
```

- [ ] **Step 4: Write the failing test for the envelope**

Create `packages/shared/src/envelope.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ok, fail } from './envelope'

describe('envelope', () => {
  it('wraps data on success', () => {
    expect(ok({ id: 1 })).toEqual({ success: true, data: { id: 1 }, error: null })
  })
  it('wraps message on failure', () => {
    expect(fail('nope')).toEqual({ success: false, data: null, error: 'nope' })
  })
})
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm --filter @picode-hr/shared exec vitest run src/envelope.test.ts`
Expected: FAIL — cannot find module `./envelope`.

- [ ] **Step 6: Implement `packages/shared/src/envelope.ts`**

```ts
export type ApiResponse<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: string }

export const ok = <T>(data: T): ApiResponse<T> => ({ success: true, data, error: null })
export const fail = (error: string): ApiResponse<never> => ({ success: false, data: null, error })
```

- [ ] **Step 7: Implement `packages/shared/src/roles.ts`**

```ts
export const ROLES = [
  'HR', 'HIRING_MANAGER', 'PROJECT_MANAGER', 'INTERVIEWER', 'LEADERSHIP', 'ADMIN',
] as const
export type Role = (typeof ROLES)[number]
export const isRole = (v: unknown): v is Role => ROLES.includes(v as Role)
```

- [ ] **Step 8: Write the failing test for config schemas**

Create `packages/shared/src/config.schemas.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createDepartmentSchema, headcountCountsOnSchema, inviteUserSchema } from './config.schemas'

describe('config schemas', () => {
  it('accepts a valid department', () => {
    expect(createDepartmentSchema.parse({ name: 'Engineering' })).toEqual({ name: 'Engineering' })
  })
  it('rejects an empty department name', () => {
    expect(createDepartmentSchema.safeParse({ name: '' }).success).toBe(false)
  })
  it('restricts headcountCountsOn to the two allowed values', () => {
    expect(headcountCountsOnSchema.safeParse('OFFER_ACCEPTED').success).toBe(true)
    expect(headcountCountsOnSchema.safeParse('SOMETHING').success).toBe(false)
  })
  it('rejects an invite with an unknown role', () => {
    expect(inviteUserSchema.safeParse({ email: 'a@b.com', name: 'A', role: 'WIZARD' }).success).toBe(false)
  })
})
```

- [ ] **Step 9: Run test to verify it fails**

Run: `pnpm --filter @picode-hr/shared exec vitest run src/config.schemas.test.ts`
Expected: FAIL — cannot find module `./config.schemas`.

- [ ] **Step 10: Implement `packages/shared/src/config.schemas.ts`**

```ts
import { z } from 'zod'
import { ROLES } from './roles'

export const createDepartmentSchema = z.object({ name: z.string().min(1).max(120) })
export type CreateDepartment = z.infer<typeof createDepartmentSchema>

export const createSkillSchema = z.object({ name: z.string().min(1).max(120) })
export type CreateSkill = z.infer<typeof createSkillSchema>

export const createSenioritySchema = z.object({
  name: z.string().min(1).max(120),
  rank: z.number().int().min(0),
})
export type CreateSeniority = z.infer<typeof createSenioritySchema>

export const headcountCountsOnSchema = z.enum(['OFFER_ACCEPTED', 'JOINED'])
export const updateOrgSettingSchema = z.object({ headcountCountsOn: headcountCountsOnSchema })
export type UpdateOrgSetting = z.infer<typeof updateOrgSettingSchema>

export const inviteUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(160),
  role: z.enum(ROLES),
})
export type InviteUser = z.infer<typeof inviteUserSchema>
```

- [ ] **Step 11: Implement `packages/shared/src/index.ts`**

```ts
export * from './envelope'
export * from './roles'
export * from './config.schemas'
```

- [ ] **Step 12: Run all shared tests (pass)**

Run: `pnpm --filter @picode-hr/shared test`
Expected: PASS — both test files green.

- [ ] **Step 13: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): api envelope, roles, config zod schemas"
```

---

## Task 3: Docker Compose + env example

**Files:**
- Create: `docker-compose.yml`, `.env.example`

- [ ] **Step 1: Create `.env.example`**

```
DATABASE_URL=postgresql://picode:picode@localhost:5432/picode_hr?schema=public
REDIS_URL=redis://localhost:6379
JWT_SECRET=change-me-in-prod
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
WEB_ORIGIN=http://localhost:5173
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=cvs
ADMIN_EMAIL=admin@picode.example
```

- [ ] **Step 2: Create `docker-compose.yml`**

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: picode
      POSTGRES_PASSWORD: picode
      POSTGRES_DB: picode_hr
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U picode"]
      interval: 5s
      timeout: 3s
      retries: 10
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports: ["9000:9000", "9001:9001"]
    volumes: ["miniodata:/data"]
volumes:
  pgdata:
  miniodata:
```

- [ ] **Step 3: Start infra and verify Postgres is healthy**

Run: `cp .env.example .env && docker compose up -d && docker compose ps`
Expected: `postgres` shows `healthy`, `redis` and `minio` `running`.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "chore: docker compose (postgres+pgvector, redis, minio)"
```

---

## Task 4: Prisma schema + migration + seed

**Files:**
- Create: `prisma/schema.prisma`, `prisma/seed.ts`

- [ ] **Step 1: Create `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  HR
  HIRING_MANAGER
  PROJECT_MANAGER
  INTERVIEWER
  LEADERSHIP
  ADMIN
}

enum HeadcountCountsOn {
  OFFER_ACCEPTED
  JOINED
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String
  googleId  String?  @unique
  role      Role     @default(INTERVIEWER)
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
}

model Department {
  id   String @id @default(cuid())
  name String @unique
}

model Skill {
  id   String @id @default(cuid())
  name String @unique
}

model SeniorityLevel {
  id   String @id @default(cuid())
  name String @unique
  rank Int
}

model OrgSetting {
  id                String            @id @default("singleton")
  headcountCountsOn HeadcountCountsOn @default(OFFER_ACCEPTED)
}
```

- [ ] **Step 2: Create `prisma/seed.ts`**

```ts
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  await prisma.orgSetting.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton', headcountCountsOn: 'OFFER_ACCEPTED' },
  })
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@picode.example'
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: 'ADMIN', isActive: true },
    create: { email: adminEmail, name: 'Picode Admin', role: 'ADMIN' },
  })
}

main().then(() => prisma.$disconnect())
```

- [ ] **Step 3: Add Prisma client dep and create the initial migration**

Run:
```bash
pnpm add -w @prisma/client && \
pnpm prisma migrate dev --name init && \
pnpm prisma generate
```
Expected: migration `*_init` created and applied; client generated. Postgres (Task 3) must be up.

- [ ] **Step 4: Run the seed and verify the admin row**

Run: `pnpm prisma:seed && pnpm prisma studio` (open Users table, confirm one ADMIN)
Expected: one `OrgSetting` (`singleton`) and one ADMIN user. Close studio with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add prisma
git commit -m "feat(db): foundation prisma schema, init migration, seed"
```

---

## Task 5: NestJS API bootstrap + health endpoint (TDD)

**Files:**
- Create: `apps/api/package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `apps/api/src/{main,app.module}.ts`, `apps/api/src/health/health.controller.ts`
- Test: `apps/api/src/health/health.controller.test.ts`

- [ ] **Step 1: Create `apps/api/package.json`**

```json
{
  "name": "@picode-hr/api",
  "version": "0.0.0",
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "@nestjs/common": "^10.4.0",
    "@nestjs/core": "^10.4.0",
    "@nestjs/jwt": "^10.2.0",
    "@nestjs/passport": "^10.0.0",
    "@nestjs/platform-express": "^10.4.0",
    "@picode-hr/shared": "workspace:*",
    "@prisma/client": "^5.20.0",
    "passport": "^0.7.0",
    "passport-google-oauth20": "^2.0.0",
    "passport-jwt": "^4.0.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@nestjs/testing": "^10.4.0",
    "@types/passport-google-oauth20": "^2.0.16",
    "@types/passport-jwt": "^4.0.1",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `apps/api/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src", "baseUrl": "." },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `apps/api/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node', globals: true } })
```

- [ ] **Step 4: Write the failing test**

Create `apps/api/src/health/health.controller.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { HealthController } from './health.controller'

describe('HealthController', () => {
  it('returns ok envelope', () => {
    expect(new HealthController().check()).toEqual({ success: true, data: { status: 'ok' }, error: null })
  })
})
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm --filter @picode-hr/api install && pnpm --filter @picode-hr/api exec vitest run src/health/health.controller.test.ts`
Expected: FAIL — cannot find module `./health.controller`.

- [ ] **Step 6: Implement `apps/api/src/health/health.controller.ts`**

```ts
import { Controller, Get } from '@nestjs/common'
import { ok } from '@picode-hr/shared'

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return ok({ status: 'ok' as const })
  }
}
```

- [ ] **Step 7: Implement `apps/api/src/app.module.ts`**

```ts
import { Module } from '@nestjs/common'
import { HealthController } from './health/health.controller'

@Module({ controllers: [HealthController] })
export class AppModule {}
```

- [ ] **Step 8: Implement `apps/api/src/main.ts`**

```ts
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173', credentials: true })
  await app.listen(3000)
}
bootstrap()
```

- [ ] **Step 9: Run test (pass) and smoke-test the server**

Run: `pnpm --filter @picode-hr/api test`
Expected: PASS.
Run: `pnpm --filter @picode-hr/api dev` then in another shell `curl localhost:3000/health`
Expected: `{"success":true,"data":{"status":"ok"},"error":null}`. Stop the server.

- [ ] **Step 10: Commit**

```bash
git add apps/api
git commit -m "feat(api): nestjs bootstrap + health endpoint"
```

---

## Task 6: PrismaService module (TDD)

**Files:**
- Create: `apps/api/src/prisma/prisma.service.ts`, `apps/api/src/prisma/prisma.module.ts`
- Test: `apps/api/src/prisma/prisma.service.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/prisma/prisma.service.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { PrismaService } from './prisma.service'

describe('PrismaService', () => {
  it('connects on module init', async () => {
    const svc = new PrismaService()
    const spy = vi.spyOn(svc, '$connect').mockResolvedValue(undefined as never)
    await svc.onModuleInit()
    expect(spy).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @picode-hr/api exec vitest run src/prisma/prisma.service.test.ts`
Expected: FAIL — cannot find module `./prisma.service`.

- [ ] **Step 3: Implement `apps/api/src/prisma/prisma.service.ts`**

```ts
import { Injectable, OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect()
  }
}
```

- [ ] **Step 4: Implement `apps/api/src/prisma/prisma.module.ts`**

```ts
import { Global, Module } from '@nestjs/common'
import { PrismaService } from './prisma.service'

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
```

- [ ] **Step 5: Wire PrismaModule into AppModule**

Modify `apps/api/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { HealthController } from './health/health.controller'
import { PrismaModule } from './prisma/prisma.module'

@Module({ imports: [PrismaModule], controllers: [HealthController] })
export class AppModule {}
```

- [ ] **Step 6: Run test (pass)**

Run: `pnpm --filter @picode-hr/api exec vitest run src/prisma/prisma.service.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/prisma apps/api/src/app.module.ts
git commit -m "feat(api): global prisma module"
```

---

## Task 7: RBAC — `@Roles()` decorator + `RolesGuard` (TDD)

**Files:**
- Create: `apps/api/src/rbac/roles.decorator.ts`, `apps/api/src/rbac/roles.guard.ts`
- Test: `apps/api/src/rbac/roles.guard.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/rbac/roles.guard.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { Reflector } from '@nestjs/core'
import { ExecutionContext } from '@nestjs/common'
import { RolesGuard } from './roles.guard'

function ctx(user: unknown, required: string[] | undefined): ExecutionContext {
  const handler = () => {}
  if (required) Reflect.defineMetadata('roles', required, handler)
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector())
  it('allows when no roles are required', () => {
    expect(guard.canActivate(ctx({ role: 'INTERVIEWER' }, undefined))).toBe(true)
  })
  it('allows when user role is in the required set', () => {
    expect(guard.canActivate(ctx({ role: 'ADMIN' }, ['ADMIN']))).toBe(true)
  })
  it('denies when user role is not in the required set', () => {
    expect(guard.canActivate(ctx({ role: 'INTERVIEWER' }, ['ADMIN']))).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @picode-hr/api exec vitest run src/rbac/roles.guard.test.ts`
Expected: FAIL — cannot find module `./roles.guard`.

- [ ] **Step 3: Implement `apps/api/src/rbac/roles.decorator.ts`**

```ts
import { SetMetadata } from '@nestjs/common'
import type { Role } from '@picode-hr/shared'

export const ROLES_KEY = 'roles'
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles)
```

- [ ] **Step 4: Implement `apps/api/src/rbac/roles.guard.ts`**

```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Role } from '@picode-hr/shared'
import { ROLES_KEY } from './roles.decorator'

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!required || required.length === 0) return true
    const { user } = context.switchToHttp().getRequest()
    return !!user && required.includes(user.role)
  }
}
```

- [ ] **Step 5: Run test (pass)**

Run: `pnpm --filter @picode-hr/api exec vitest run src/rbac/roles.guard.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/rbac
git commit -m "feat(api): rbac roles decorator + guard"
```

---

## Task 8: Auth — Google OAuth → JWT (TDD on the testable seams)

**Files:**
- Create: `apps/api/src/auth/{auth.service,auth.controller,google.strategy,jwt.strategy,jwt-auth.guard,auth.module}.ts`
- Test: `apps/api/src/auth/auth.service.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/auth/auth.service.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { AuthService } from './auth.service'

const jwt = { sign: vi.fn(() => 'signed.jwt.token') }

describe('AuthService.validateGoogleUser', () => {
  it('links googleId to an existing invited user and returns it', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'u1', email: 'a@picode.example', role: 'HR', isActive: true, googleId: null }),
        update: vi.fn().mockResolvedValue({ id: 'u1', email: 'a@picode.example', role: 'HR', isActive: true, googleId: 'g1' }),
      },
    }
    const svc = new AuthService(prisma as never, jwt as never)
    const user = await svc.validateGoogleUser({ email: 'a@picode.example', googleId: 'g1', name: 'A' })
    expect(user.role).toBe('HR')
    expect(prisma.user.update).toHaveBeenCalled()
  })

  it('rejects a user who was never invited', async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(null) } }
    const svc = new AuthService(prisma as never, jwt as never)
    await expect(svc.validateGoogleUser({ email: 'x@nope.example', googleId: 'g2', name: 'X' }))
      .rejects.toThrow('Not authorized')
  })

  it('issues a JWT for a user', () => {
    const svc = new AuthService({} as never, jwt as never)
    expect(svc.issueToken({ id: 'u1', email: 'a@picode.example', role: 'HR' })).toBe('signed.jwt.token')
    expect(jwt.sign).toHaveBeenCalledWith({ sub: 'u1', email: 'a@picode.example', role: 'HR' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @picode-hr/api exec vitest run src/auth/auth.service.test.ts`
Expected: FAIL — cannot find module `./auth.service`.

- [ ] **Step 3: Implement `apps/api/src/auth/auth.service.ts`**

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../prisma/prisma.service'

export type GoogleProfile = { email: string; googleId: string; name: string }
export type AuthedUser = { id: string; email: string; role: string }

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async validateGoogleUser(profile: GoogleProfile) {
    const existing = await this.prisma.user.findUnique({ where: { email: profile.email } })
    if (!existing || !existing.isActive) throw new UnauthorizedException('Not authorized')
    if (existing.googleId === profile.googleId) return existing
    return this.prisma.user.update({
      where: { id: existing.id },
      data: { googleId: profile.googleId },
    })
  }

  issueToken(user: AuthedUser): string {
    return this.jwt.sign({ sub: user.id, email: user.email, role: user.role })
  }
}
```

- [ ] **Step 4: Run test (pass)**

Run: `pnpm --filter @picode-hr/api exec vitest run src/auth/auth.service.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement `apps/api/src/auth/google.strategy.ts`**

```ts
import { Injectable } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { Strategy, Profile, VerifyCallback } from 'passport-google-oauth20'
import { AuthService } from './auth.service'

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private auth: AuthService) {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: process.env.GOOGLE_CALLBACK_URL!,
      scope: ['email', 'profile'],
    })
  }

  async validate(_at: string, _rt: string, profile: Profile, done: VerifyCallback) {
    try {
      const user = await this.auth.validateGoogleUser({
        email: profile.emails?.[0]?.value ?? '',
        googleId: profile.id,
        name: profile.displayName ?? 'Unknown',
      })
      done(null, { id: user.id, email: user.email, role: user.role })
    } catch (e) {
      done(e as Error, undefined)
    }
  }
}
```

- [ ] **Step 6: Implement `apps/api/src/auth/jwt.strategy.ts`**

```ts
import { Injectable } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET!,
    })
  }

  validate(payload: { sub: string; email: string; role: string }) {
    return { id: payload.sub, email: payload.email, role: payload.role }
  }
}
```

- [ ] **Step 7: Implement `apps/api/src/auth/jwt-auth.guard.ts`**

```ts
import { Injectable } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

- [ ] **Step 8: Implement `apps/api/src/auth/auth.controller.ts`**

```ts
import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import type { Request, Response } from 'express'
import { AuthService, AuthedUser } from './auth.service'
import { JwtAuthGuard } from './jwt-auth.guard'
import { ok } from '@picode-hr/shared'

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Get('google')
  @UseGuards(AuthGuard('google'))
  login() {
    /* passport redirects to Google */
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  callback(@Req() req: Request, @Res() res: Response) {
    const token = this.auth.issueToken(req.user as AuthedUser)
    const web = process.env.WEB_ORIGIN ?? 'http://localhost:5173'
    res.redirect(`${web}/login#token=${token}`)
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: Request) {
    return ok(req.user)
  }
}
```

- [ ] **Step 9: Implement `apps/api/src/auth/auth.module.ts`**

```ts
import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { AuthService } from './auth.service'
import { AuthController } from './auth.controller'
import { GoogleStrategy } from './google.strategy'
import { JwtStrategy } from './jwt.strategy'

@Module({
  imports: [
    PassportModule,
    JwtModule.register({ secret: process.env.JWT_SECRET, signOptions: { expiresIn: '12h' } }),
  ],
  controllers: [AuthController],
  providers: [AuthService, GoogleStrategy, JwtStrategy],
})
export class AuthModule {}
```

- [ ] **Step 10: Wire AuthModule into AppModule**

Modify `apps/api/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { HealthController } from './health/health.controller'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './auth/auth.module'

@Module({ imports: [PrismaModule, AuthModule], controllers: [HealthController] })
export class AppModule {}
```

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/auth apps/api/src/app.module.ts
git commit -m "feat(api): google oauth login + jwt auth"
```

---

## Task 9: Users module — list + invite (TDD)

**Files:**
- Create: `apps/api/src/users/{users.service,users.controller,users.module}.ts`
- Test: `apps/api/src/users/users.service.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/users/users.service.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { UsersService } from './users.service'

describe('UsersService.invite', () => {
  it('creates an invited user with the given role', async () => {
    const prisma = { user: { create: vi.fn().mockResolvedValue({ id: 'u2', email: 'hr@picode.example', role: 'HR' }) } }
    const svc = new UsersService(prisma as never)
    const user = await svc.invite({ email: 'hr@picode.example', name: 'HR One', role: 'HR' })
    expect(user.role).toBe('HR')
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { email: 'hr@picode.example', name: 'HR One', role: 'HR' },
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @picode-hr/api exec vitest run src/users/users.service.test.ts`
Expected: FAIL — cannot find module `./users.service`.

- [ ] **Step 3: Implement `apps/api/src/users/users.service.ts`**

```ts
import { Injectable } from '@nestjs/common'
import type { InviteUser } from '@picode-hr/shared'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({ orderBy: { createdAt: 'desc' } })
  }

  invite(input: InviteUser) {
    return this.prisma.user.create({ data: input })
  }
}
```

- [ ] **Step 4: Run test (pass)**

Run: `pnpm --filter @picode-hr/api exec vitest run src/users/users.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `apps/api/src/users/users.controller.ts`**

```ts
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { inviteUserSchema, ok } from '@picode-hr/shared'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../rbac/roles.guard'
import { Roles } from '../rbac/roles.decorator'
import { UsersService } from './users.service'

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  async list() {
    return ok(await this.users.list())
  }

  @Post('invite')
  async invite(@Body() body: unknown) {
    return ok(await this.users.invite(inviteUserSchema.parse(body)))
  }
}
```

- [ ] **Step 6: Implement `apps/api/src/users/users.module.ts` and wire it in**

Create `apps/api/src/users/users.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { UsersService } from './users.service'
import { UsersController } from './users.controller'

@Module({ providers: [UsersService], controllers: [UsersController] })
export class UsersModule {}
```

Modify `apps/api/src/app.module.ts` to add `UsersModule` to `imports` (keep `PrismaModule`, `AuthModule`).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/users apps/api/src/app.module.ts
git commit -m "feat(api): users list + admin invite"
```

---

## Task 10: Config module — departments / skills / seniority / org setting (TDD)

**Files:**
- Create: `apps/api/src/config/{config.service,config.controller,config.module}.ts`
- Test: `apps/api/src/config/config.service.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/config/config.service.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { ConfigService } from './config.service'

describe('ConfigService', () => {
  it('creates a department', async () => {
    const prisma = { department: { create: vi.fn().mockResolvedValue({ id: 'd1', name: 'Engineering' }) } }
    const svc = new ConfigService(prisma as never)
    expect(await svc.createDepartment({ name: 'Engineering' })).toEqual({ id: 'd1', name: 'Engineering' })
  })

  it('updates the singleton org setting', async () => {
    const prisma = {
      orgSetting: { upsert: vi.fn().mockResolvedValue({ id: 'singleton', headcountCountsOn: 'JOINED' }) },
    }
    const svc = new ConfigService(prisma as never)
    const res = await svc.updateOrgSetting({ headcountCountsOn: 'JOINED' })
    expect(res.headcountCountsOn).toBe('JOINED')
    expect(prisma.orgSetting.upsert).toHaveBeenCalledWith({
      where: { id: 'singleton' },
      update: { headcountCountsOn: 'JOINED' },
      create: { id: 'singleton', headcountCountsOn: 'JOINED' },
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @picode-hr/api exec vitest run src/config/config.service.test.ts`
Expected: FAIL — cannot find module `./config.service`.

- [ ] **Step 3: Implement `apps/api/src/config/config.service.ts`**

```ts
import { Injectable } from '@nestjs/common'
import type { CreateDepartment, CreateSkill, CreateSeniority, UpdateOrgSetting } from '@picode-hr/shared'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class ConfigService {
  constructor(private prisma: PrismaService) {}

  listDepartments() { return this.prisma.department.findMany({ orderBy: { name: 'asc' } }) }
  createDepartment(input: CreateDepartment) { return this.prisma.department.create({ data: input }) }

  listSkills() { return this.prisma.skill.findMany({ orderBy: { name: 'asc' } }) }
  createSkill(input: CreateSkill) { return this.prisma.skill.create({ data: input }) }

  listSeniority() { return this.prisma.seniorityLevel.findMany({ orderBy: { rank: 'asc' } }) }
  createSeniority(input: CreateSeniority) { return this.prisma.seniorityLevel.create({ data: input }) }

  getOrgSetting() {
    return this.prisma.orgSetting.upsert({
      where: { id: 'singleton' }, update: {}, create: { id: 'singleton' },
    })
  }
  updateOrgSetting(input: UpdateOrgSetting) {
    return this.prisma.orgSetting.upsert({
      where: { id: 'singleton' },
      update: { headcountCountsOn: input.headcountCountsOn },
      create: { id: 'singleton', headcountCountsOn: input.headcountCountsOn },
    })
  }
}
```

- [ ] **Step 4: Run test (pass)**

Run: `pnpm --filter @picode-hr/api exec vitest run src/config/config.service.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement `apps/api/src/config/config.controller.ts`**

```ts
import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common'
import {
  createDepartmentSchema, createSkillSchema, createSenioritySchema,
  updateOrgSettingSchema, ok,
} from '@picode-hr/shared'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../rbac/roles.guard'
import { Roles } from '../rbac/roles.decorator'
import { ConfigService } from './config.service'

@Controller('config')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ConfigController {
  constructor(private config: ConfigService) {}

  @Get('departments')
  async listDepartments() { return ok(await this.config.listDepartments()) }

  @Post('departments')
  @Roles('ADMIN')
  async createDepartment(@Body() body: unknown) {
    return ok(await this.config.createDepartment(createDepartmentSchema.parse(body)))
  }

  @Get('skills')
  async listSkills() { return ok(await this.config.listSkills()) }

  @Post('skills')
  @Roles('ADMIN')
  async createSkill(@Body() body: unknown) {
    return ok(await this.config.createSkill(createSkillSchema.parse(body)))
  }

  @Get('seniority')
  async listSeniority() { return ok(await this.config.listSeniority()) }

  @Post('seniority')
  @Roles('ADMIN')
  async createSeniority(@Body() body: unknown) {
    return ok(await this.config.createSeniority(createSenioritySchema.parse(body)))
  }

  @Get('org-setting')
  async getOrgSetting() { return ok(await this.config.getOrgSetting()) }

  @Put('org-setting')
  @Roles('ADMIN')
  async updateOrgSetting(@Body() body: unknown) {
    return ok(await this.config.updateOrgSetting(updateOrgSettingSchema.parse(body)))
  }
}
```

- [ ] **Step 6: Implement `apps/api/src/config/config.module.ts` and wire it in**

Create `apps/api/src/config/config.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { ConfigService } from './config.service'
import { ConfigController } from './config.controller'

@Module({ providers: [ConfigService], controllers: [ConfigController] })
export class ConfigModule {}
```

Modify `apps/api/src/app.module.ts` to add `ConfigModule` to `imports`. Final `app.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { HealthController } from './health/health.controller'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './auth/auth.module'
import { UsersModule } from './users/users.module'
import { ConfigModule } from './config/config.module'

@Module({
  imports: [PrismaModule, AuthModule, UsersModule, ConfigModule],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 7: Full api test run + typecheck**

Run: `pnpm --filter @picode-hr/api test && pnpm --filter @picode-hr/api exec tsc --noEmit`
Expected: all tests PASS; no type errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/config apps/api/src/app.module.ts
git commit -m "feat(api): config crud (departments, skills, seniority, org setting)"
```

---

## Task 11: Web shell — login + admin config page (TDD on the API client)

**Files:**
- Create: `apps/web/package.json`, `vite.config.ts`, `index.html`, `src/{main,App}.tsx`
- Create: `apps/web/src/api/client.ts`, `src/auth/useAuth.ts`, `src/pages/{Login,AdminConfig}.tsx`
- Test: `apps/web/src/api/client.test.ts`

- [ ] **Step 1: Create `apps/web/package.json`**

```json
{
  "name": "@picode-hr/web",
  "version": "0.0.0",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "@picode-hr/shared": "workspace:*",
    "@tanstack/react-query": "^5.59.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.27.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^25.0.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `apps/web/vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', globals: true },
  server: { port: 5173 },
})
```

- [ ] **Step 3: Create `apps/web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8" /><title>Picode HR</title></head>
  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
</html>
```

- [ ] **Step 4: Write the failing test for the API client token handling**

Create `apps/web/src/api/client.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { saveTokenFromHash, getToken, clearToken } from './client'

describe('token handling', () => {
  beforeEach(() => { localStorage.clear() })

  it('extracts and stores a token from the login hash', () => {
    saveTokenFromHash('#token=abc.def.ghi')
    expect(getToken()).toBe('abc.def.ghi')
  })
  it('returns null when no token is present', () => {
    expect(getToken()).toBeNull()
  })
  it('clears the token', () => {
    saveTokenFromHash('#token=xyz')
    clearToken()
    expect(getToken()).toBeNull()
  })
})
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm --filter @picode-hr/web install && pnpm --filter @picode-hr/web exec vitest run src/api/client.test.ts`
Expected: FAIL — cannot find module `./client`.

- [ ] **Step 6: Implement `apps/web/src/api/client.ts`**

```ts
import type { ApiResponse } from '@picode-hr/shared'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
const TOKEN_KEY = 'picode_hr_token'

export function saveTokenFromHash(hash: string): void {
  const match = hash.match(/token=([^&]+)/)
  if (match) localStorage.setItem(TOKEN_KEY, match[1])
}
export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY)
export const clearToken = (): void => localStorage.removeItem(TOKEN_KEY)

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
  })
  const body = (await res.json()) as ApiResponse<T>
  if (!body.success) throw new Error(body.error)
  return body.data
}

export async function apiSend<T>(path: string, method: 'POST' | 'PUT', payload: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: JSON.stringify(payload),
  })
  const body = (await res.json()) as ApiResponse<T>
  if (!body.success) throw new Error(body.error)
  return body.data
}

export const loginUrl = `${API}/auth/google`
```

- [ ] **Step 7: Run test (pass)**

Run: `pnpm --filter @picode-hr/web exec vitest run src/api/client.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 8: Implement `apps/web/src/auth/useAuth.ts`**

```ts
import { useEffect, useState } from 'react'
import { apiGet, saveTokenFromHash, getToken, clearToken } from '../api/client'

export type Me = { id: string; email: string; role: string }

export function useAuth() {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (window.location.hash.includes('token=')) {
      saveTokenFromHash(window.location.hash)
      window.location.hash = ''
    }
    if (!getToken()) { setLoading(false); return }
    apiGet<Me>('/auth/me').then(setMe).catch(() => clearToken()).finally(() => setLoading(false))
  }, [])

  return { me, loading, logout: () => { clearToken(); setMe(null) } }
}
```

- [ ] **Step 9: Implement `apps/web/src/pages/Login.tsx`**

```tsx
import { loginUrl } from '../api/client'

export function Login() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}>
      <div>
        <h1>Picode HR</h1>
        <a href={loginUrl}><button>Sign in with Google</button></a>
      </div>
    </div>
  )
}
```

- [ ] **Step 10: Implement `apps/web/src/pages/AdminConfig.tsx`**

```tsx
import { useState, useEffect } from 'react'
import { apiGet, apiSend } from '../api/client'

type Department = { id: string; name: string }

export function AdminConfig() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [name, setName] = useState('')

  const load = () => apiGet<Department[]>('/config/departments').then(setDepartments)
  useEffect(() => { load() }, [])

  const add = async () => {
    if (!name.trim()) return
    await apiSend<Department>('/config/departments', 'POST', { name })
    setName('')
    load()
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>Departments</h2>
      <ul>{departments.map((d) => <li key={d.id}>{d.name}</li>)}</ul>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New department" />
      <button onClick={add}>Add</button>
    </div>
  )
}
```

- [ ] **Step 11: Implement `apps/web/src/App.tsx` and `main.tsx`**

`apps/web/src/App.tsx`:

```tsx
import { useAuth } from './auth/useAuth'
import { Login } from './pages/Login'
import { AdminConfig } from './pages/AdminConfig'

export default function App() {
  const { me, loading, logout } = useAuth()
  if (loading) return <p>Loading…</p>
  if (!me) return <Login />
  return (
    <div>
      <header style={{ display: 'flex', justifyContent: 'space-between', padding: 12 }}>
        <strong>Picode HR</strong>
        <span>{me.email} ({me.role}) <button onClick={logout}>Logout</button></span>
      </header>
      {me.role === 'ADMIN' ? <AdminConfig /> : <p style={{ padding: 24 }}>Welcome. (Role: {me.role})</p>}
    </div>
  )
}
```

`apps/web/src/main.tsx`:

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
)
```

- [ ] **Step 12: Manual end-to-end smoke test**

Run (separate shells): `pnpm dev:api` and `pnpm dev:web`. With valid Google credentials in `.env`, open `http://localhost:5173`, sign in with the seeded `ADMIN_EMAIL` Google account, confirm you land on the Departments page, add "Engineering", and see it listed.
Expected: login round-trips, JWT stored, department persists and reloads.

- [ ] **Step 13: Commit**

```bash
git add apps/web
git commit -m "feat(web): login shell + admin config page"
```

---

## Self-Review

- **Spec coverage:** Google SSO (§2/§11), users + 6 roles (§5/§15), RBAC guard enforced at API (§11), config CRUD incl. `headcountCountsOn` default `OFFER_ACCEPTED` (§2/§10.5), Prisma foundation entities (§9), Docker infra incl. redis/minio/pgvector image provisioned for later plans (§3/§5). Projects, roles, candidates, AI, pipeline, interviews, feedback, offers, dashboards, alerts are intentionally deferred to plans 02–11 per the roadmap.
- **Placeholder scan:** none — every code step contains complete, typed code; every run step has an exact command and expected result.
- **Type consistency:** `ok`/`fail` envelope, `Role` enum/`ROLES`, and schema export names (`createDepartmentSchema`, `createSkillSchema`, `createSenioritySchema`, `updateOrgSettingSchema`, `inviteUserSchema`) plus their inferred types (`CreateDepartment`, `CreateSkill`, `CreateSeniority`, `UpdateOrgSetting`, `InviteUser`) are used identically across shared, api, and web tasks. `AuthedUser` is exported from `auth.service.ts` and imported by `auth.controller.ts`.
```
