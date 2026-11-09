export type Role =
  | 'HR'
  | 'HIRING_MANAGER'
  | 'PROJECT_MANAGER'
  | 'INTERVIEWER'
  | 'LEADERSHIP'
  | 'ADMIN'

export interface NavItem {
  label: string
  path: string
  roles: Role[]
}

const ALL_ROLES: Role[] = ['HR', 'HIRING_MANAGER', 'PROJECT_MANAGER', 'INTERVIEWER', 'LEADERSHIP', 'ADMIN']

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',      path: '/',              roles: ALL_ROLES },
  { label: 'Roles',          path: '/roles',         roles: ALL_ROLES },
  { label: 'Candidates',     path: '/candidates',    roles: ['ADMIN', 'HR', 'HIRING_MANAGER'] },
  { label: 'Interviews',     path: '/interviews',    roles: ALL_ROLES },
  { label: 'Feedback',       path: '/feedback',      roles: ['ADMIN', 'HR', 'HIRING_MANAGER', 'INTERVIEWER'] },
  { label: 'Offers',         path: '/offers',        roles: ['ADMIN', 'HR', 'HIRING_MANAGER', 'LEADERSHIP'] },
  { label: 'Projects',       path: '/projects',      roles: ['ADMIN', 'HR', 'PROJECT_MANAGER', 'LEADERSHIP'] },
  { label: 'Joining',        path: '/joining',       roles: ['ADMIN', 'HR', 'HIRING_MANAGER', 'PROJECT_MANAGER', 'LEADERSHIP'] },
  { label: 'Offboarding',    path: '/offboarding',   roles: ['ADMIN', 'HR'] },
  { label: 'Notifications',  path: '/notifications', roles: ALL_ROLES },
  { label: 'Admin',          path: '/admin',         roles: ['ADMIN'] },
]

export function visibleNavItems(role: string): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role as Role))
}
