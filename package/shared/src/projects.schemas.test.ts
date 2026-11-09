import { describe, it, expect } from 'vitest'
import {
  createProjectSchema,
  updateProjectSchema,
  createRoleSchema,
  updateRoleSchema,
  closeRoleSchema,
  projectStatusSchema,
  roleStatusSchema,
  prioritySchema,
} from './projects.schemas'

describe('projectStatusSchema', () => {
  it('accepts all valid statuses', () => {
    const statuses = ['PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED']
    statuses.forEach((s) => expect(projectStatusSchema.safeParse(s).success).toBe(true))
  })
  it('rejects an unknown status', () => {
    expect(projectStatusSchema.safeParse('UNKNOWN').success).toBe(false)
  })
})

describe('roleStatusSchema', () => {
  it('accepts all valid statuses', () => {
    const statuses = ['DRAFT', 'PENDING_APPROVAL', 'OPEN', 'IN_PROGRESS', 'ON_HOLD', 'FILLED', 'CANCELLED', 'CLOSED']
    statuses.forEach((s) => expect(roleStatusSchema.safeParse(s).success).toBe(true))
  })
  it('rejects an unknown status', () => {
    expect(roleStatusSchema.safeParse('INVALID').success).toBe(false)
  })
})

describe('prioritySchema', () => {
  it('accepts all valid priorities', () => {
    const priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
    priorities.forEach((p) => expect(prioritySchema.safeParse(p).success).toBe(true))
  })
  it('rejects an unknown priority', () => {
    expect(prioritySchema.safeParse('URGENT').success).toBe(false)
  })
})

describe('createProjectSchema', () => {
  it('accepts a minimal valid project', () => {
    const result = createProjectSchema.parse({ name: 'Alpha Project' })
    expect(result.name).toBe('Alpha Project')
  })
  it('accepts a full project', () => {
    const result = createProjectSchema.parse({
      name: 'Beta Project',
      client: 'Acme Corp',
      status: 'ACTIVE',
      startDate: '2026-01-01T00:00:00.000Z',
    })
    expect(result.client).toBe('Acme Corp')
    expect(result.status).toBe('ACTIVE')
  })
  it('rejects missing name', () => {
    expect(createProjectSchema.safeParse({}).success).toBe(false)
  })
  it('rejects empty name', () => {
    expect(createProjectSchema.safeParse({ name: '' }).success).toBe(false)
  })
  it('rejects invalid status', () => {
    expect(createProjectSchema.safeParse({ name: 'X', status: 'WEIRD' }).success).toBe(false)
  })
})

describe('updateProjectSchema', () => {
  it('accepts partial update with only name', () => {
    const result = updateProjectSchema.parse({ name: 'Updated Name' })
    expect(result.name).toBe('Updated Name')
  })
  it('accepts empty object (no-op update)', () => {
    const result = updateProjectSchema.parse({})
    expect(result).toEqual({})
  })
})

describe('createRoleSchema', () => {
  it('accepts a minimal valid role', () => {
    const result = createRoleSchema.parse({ title: 'Backend Engineer', requiredCount: 2 })
    expect(result.title).toBe('Backend Engineer')
    expect(result.requiredCount).toBe(2)
  })
  it('defaults arrays to empty', () => {
    const result = createRoleSchema.parse({ title: 'Designer', requiredCount: 1 })
    expect(result.requiredSkills).toEqual([])
    expect(result.preferredSkills).toEqual([])
    expect(result.languages).toEqual([])
  })
  it('rejects requiredCount of 0', () => {
    expect(createRoleSchema.safeParse({ title: 'Dev', requiredCount: 0 }).success).toBe(false)
  })
  it('rejects requiredCount of -1', () => {
    expect(createRoleSchema.safeParse({ title: 'Dev', requiredCount: -1 }).success).toBe(false)
  })
  it('rejects missing title', () => {
    expect(createRoleSchema.safeParse({ requiredCount: 1 }).success).toBe(false)
  })
  it('rejects empty title', () => {
    expect(createRoleSchema.safeParse({ title: '', requiredCount: 1 }).success).toBe(false)
  })
  it('rejects invalid priority', () => {
    expect(createRoleSchema.safeParse({ title: 'Dev', requiredCount: 1, priority: 'EXTREME' }).success).toBe(false)
  })
  it('rejects invalid status', () => {
    expect(createRoleSchema.safeParse({ title: 'Dev', requiredCount: 1, status: 'UNKNOWN' }).success).toBe(false)
  })
  it('accepts all optional fields', () => {
    const result = createRoleSchema.parse({
      title: 'Senior Engineer',
      requiredCount: 3,
      projectId: 'proj1',
      departmentId: 'dept1',
      seniorityId: 'sen1',
      location: 'Remote',
      employmentType: 'Full-time',
      jobDescription: 'Description here',
      requiredSkills: ['TypeScript', 'Node.js'],
      preferredSkills: ['React'],
      requiredYearsExperience: 5,
      priority: 'HIGH',
      status: 'OPEN',
    })
    expect(result.requiredSkills).toEqual(['TypeScript', 'Node.js'])
    expect(result.priority).toBe('HIGH')
  })
})

describe('updateRoleSchema', () => {
  it('accepts a partial update', () => {
    const result = updateRoleSchema.parse({ title: 'New Title' })
    expect(result.title).toBe('New Title')
  })
  it('accepts empty object', () => {
    expect(updateRoleSchema.parse({})).toEqual({})
  })
  it('rejects requiredCount of 0 when provided', () => {
    expect(updateRoleSchema.safeParse({ requiredCount: 0 }).success).toBe(false)
  })
})

describe('closeRoleSchema', () => {
  it('accepts reason with no notes', () => {
    const result = closeRoleSchema.parse({ reason: 'Position cancelled' })
    expect(result.reason).toBe('Position cancelled')
    expect(result.notes).toBeUndefined()
  })
  it('accepts reason with notes', () => {
    const result = closeRoleSchema.parse({ reason: 'Filled externally', notes: 'Budget frozen' })
    expect(result.notes).toBe('Budget frozen')
  })
  it('rejects empty reason', () => {
    expect(closeRoleSchema.safeParse({ reason: '' }).success).toBe(false)
  })
  it('rejects missing reason', () => {
    expect(closeRoleSchema.safeParse({}).success).toBe(false)
  })
})
