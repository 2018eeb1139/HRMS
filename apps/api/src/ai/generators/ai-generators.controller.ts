import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import {
  roleBuilderInputSchema,
  interviewGuideInputSchema,
  feedbackSummaryInputSchema,
  riskReportInputSchema,
  ok,
} from '@picode-hr/shared'
import { JwtAuthGuard } from '../../auth/jwt-auth.guard'
import { RolesGuard } from '../../rbac/roles.guard'
import { Roles } from '../../rbac/roles.decorator'
import { RoleBuilderService } from './role-builder.service'
import { InterviewGuideService } from './interview-guide.service'
import { FeedbackSummarizerService } from './feedback-summarizer.service'
import { RiskDetectorService } from './risk-detector.service'

@Controller('ai')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AiGeneratorsController {
  constructor(
    private readonly roleBuilder: RoleBuilderService,
    private readonly interviewGuide: InterviewGuideService,
    private readonly feedbackSummarizer: FeedbackSummarizerService,
    private readonly riskDetector: RiskDetectorService,
  ) {}

  @Post('role-builder')
  @Roles('ADMIN', 'HR', 'HIRING_MANAGER')
  async buildRole(@Body() body: unknown) {
    const input = roleBuilderInputSchema.parse(body)
    return ok(await this.roleBuilder.build(input))
  }

  @Post('interview-guide')
  @Roles('ADMIN', 'HR', 'HIRING_MANAGER', 'INTERVIEWER')
  async generateInterviewGuide(@Body() body: unknown) {
    const input = interviewGuideInputSchema.parse(body)
    return ok(await this.interviewGuide.generate(input))
  }

  @Post('feedback-summary')
  @Roles('ADMIN', 'HR', 'HIRING_MANAGER')
  async summarizeFeedback(@Body() body: unknown) {
    const input = feedbackSummaryInputSchema.parse(body)
    return ok(await this.feedbackSummarizer.summarize(input))
  }

  @Post('risk-report')
  @Roles('ADMIN', 'HR', 'LEADERSHIP')
  async detectRisk(@Body() body: unknown) {
    const input = riskReportInputSchema.parse(body)
    return ok(await this.riskDetector.detect(input))
  }
}
