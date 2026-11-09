export type Role =
  | 'HR'
  | 'HIRING_MANAGER'
  | 'PROJECT_MANAGER'
  | 'INTERVIEWER'
  | 'LEADERSHIP'
  | 'ADMIN'
  | 'EMPLOYEE'

export interface NavItem {
  label: string
  path: string
  roles: Role[]
}

const ALL_ROLES: Role[] = ['HR', 'HIRING_MANAGER', 'PROJECT_MANAGER', 'INTERVIEWER', 'LEADERSHIP', 'ADMIN', 'EMPLOYEE']

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
  { label: 'Employees',      path: '/employees',      roles: ['ADMIN', 'HR', 'HIRING_MANAGER', 'PROJECT_MANAGER', 'LEADERSHIP'] },
  { label: 'Attendance & Timesheets', path: '/attendance', roles: ['ADMIN', 'HR', 'HIRING_MANAGER', 'PROJECT_MANAGER', 'LEADERSHIP'] },
  { label: 'Leave Management', path: '/leave',         roles: ['ADMIN', 'HR', 'HIRING_MANAGER', 'PROJECT_MANAGER', 'LEADERSHIP'] },
  { label: 'Performance & Goals', path: '/performance', roles: ['ADMIN', 'HR', 'HIRING_MANAGER', 'PROJECT_MANAGER', 'LEADERSHIP'] },
  { label: 'Service Requests', path: '/service-requests', roles: ALL_ROLES },
  { label: 'Documents',      path: '/documents',      roles: ALL_ROLES },
  { label: 'Employee Directory', path: '/employee-directory', roles: ALL_ROLES },
  { label: 'Holidays',       path: '/holidays',       roles: ALL_ROLES },
  { label: 'Notifications',  path: '/notifications', roles: ALL_ROLES },
  { label: 'Admin',          path: '/admin',         roles: ['ADMIN'] },
]

export function visibleNavItems(role: string): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role as Role))
}
