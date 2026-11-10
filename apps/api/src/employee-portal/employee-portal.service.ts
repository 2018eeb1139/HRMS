import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class EmployeePortalService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(userId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
      include: {
        attendance: { orderBy: { date: 'desc' }, take: 5 },
        leaveBalance: true,
        timesheets: { orderBy: { weekStart: 'desc' }, take: 5 },
        holidays: { where: { date: { gte: new Date() } }, orderBy: { date: 'asc' }, take: 5 },
        announcements: { orderBy: { publishedAt: 'desc' }, take: 5 },
      },
    })

    if (!employee) throw new NotFoundException('Employee profile not found')

    const pendingActions = [
      ...employee.timesheets.filter((timesheet) => timesheet.status === 'DRAFT').map((timesheet) => ({ type: 'TIMESHEET', label: `Submit timesheet for ${timesheet.weekStart.toISOString().slice(0, 10)}`, href: '/employee/timesheets' })),
      ...(!employee.emergencyContactName ? [{ type: 'PROFILE', label: 'Add an emergency contact', href: '/employee/profile' }] : []),
    ]

    return {
      profile: { id: employee.id, name: employee.name, email: employee.email, department: employee.department, jobTitle: employee.jobTitle, employmentDate: employee.employmentDate },
      attendance: { today: employee.attendance[0] ?? null, recent: employee.attendance },
      leave: employee.leaveBalance,
      timesheets: { recent: employee.timesheets, pendingCount: employee.timesheets.filter((item) => item.status === 'DRAFT').length },
      performance: { status: employee.performanceStatus, reviewDueAt: employee.reviewDueAt, goals: employee.goals },
      pendingActions,
      holidays: employee.holidays,
      announcements: employee.announcements,
    }
  }
}
