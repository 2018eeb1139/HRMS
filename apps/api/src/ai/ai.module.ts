import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { GROQ_LLM, LLM, ROLE_BUILDER_LLM } from "./llm.port";
import { ClaudeLlm } from "./claude.llm";
import { GroqLlm } from "./groq.llm";
import { AiCacheService } from "./ai-cache.service";
import { SCREENING } from "./screening/screening.service";
import { RuleBasedScreeningService } from "./screening/rule-based.screening";
import { ClaudeScreeningService } from "./screening/claude.screening";
import { GroqScreeningService } from "./screening/groq.screening";
import { AiController } from "./ai.controller";
import { RoleBuilderService } from "./generators/role-builder.service";
import { InterviewGuideService } from "./generators/interview-guide.service";
import { FeedbackSummarizerService } from "./generators/feedback-summarizer.service";
import { RiskDetectorService } from "./generators/risk-detector.service";
import { AiGeneratorsController } from "./generators/ai-generators.controller";

/**
 * Provider selection for ScreeningService:
 *
 * Default (no env var): RuleBasedScreeningService — pure deterministic logic,
 * boots without ANTHROPIC_API_KEY, zero cost, suitable for CI and dev.
 *
 * Set SCREENING_IMPL=claude or SCREENING_IMPL=groq to select an LLM-backed
 * screening service. API keys are checked lazily when the provider is called.
 */
const screeningImplementation = process.env.SCREENING_IMPL;
const screeningProvider = {
  provide: SCREENING,
  useClass: screeningImplementation === "claude"
    ? ClaudeScreeningService
    : screeningImplementation === "groq"
      ? GroqScreeningService
      : RuleBasedScreeningService,
};

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    { provide: LLM, useClass: ClaudeLlm },
    { provide: GROQ_LLM, useClass: GroqLlm },
    { provide: ROLE_BUILDER_LLM, useExisting: GROQ_LLM },
    AiCacheService,
    screeningProvider,
    RoleBuilderService,
    InterviewGuideService,
    FeedbackSummarizerService,
    RiskDetectorService,
  ],
  exports: [
    LLM,
    AiCacheService,
    SCREENING,
    RoleBuilderService,
    InterviewGuideService,
    FeedbackSummarizerService,
    RiskDetectorService,
  ],
  controllers: [AiController, AiGeneratorsController],
})
export class AiModule {}
