import {
  BadGatewayException,
  Logger,
  Inject,
  Injectable,
} from "@nestjs/common";
import { roleDraftSchema } from "@picode-hr/shared";
import type { RoleBuilderInput, RoleDraft } from "@picode-hr/shared";
import { ROLE_BUILDER_LLM } from "../llm.port";
import type { LlmPort } from "../llm.port";
import { AiCacheService } from "../ai-cache.service";

const PROMPT_VERSION = "2";
const DEFAULT_MODEL = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";

const SYSTEM_PROMPT =
  'You are an expert recruiter. Write a concise role overview for the jobDescription field. Return only valid JSON with exactly these fields: "jobDescription" (string), "responsibilities" (string array of concise actions), "requiredSkills" (string array), "preferredSkills" (string array), "interviewCriteria" (string array), and "screeningQuestions" (string array). Do not include headings, markdown, or prose outside the JSON.';

function stripFences(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

@Injectable()
export class RoleBuilderService {
  private readonly logger = new Logger(RoleBuilderService.name);
  constructor(
    @Inject(ROLE_BUILDER_LLM) private readonly llm: LlmPort,
    private readonly cache: AiCacheService,
  ) {}

  async build(input: RoleBuilderInput): Promise<RoleDraft> {
    const model = DEFAULT_MODEL;
    const inputHash = this.cache.hashInput(input);

    return this.cache.getOrCompute<RoleDraft>({
      type: "role_builder",
      inputHash,
      model,
      promptVersion: PROMPT_VERSION,
      compute: async () => {
        const userPrompt = [
          `Title: ${input.title}`,
          input.seniority ? `Seniority: ${input.seniority}` : null,
          input.mustHaves ? `Must-haves: ${input.mustHaves}` : null,
          input.context ? `Context: ${input.context}` : null,
        ]
          .filter(Boolean)
          .join("\n");

        const raw = await this.llm.complete({
          system: SYSTEM_PROMPT,
          user: userPrompt,
          maxTokens: 2048,
          model,
        });

        let parsed: unknown;
        try {
          parsed = JSON.parse(stripFences(raw));
        } catch {
          this.logger.warn(`LLM returned non-JSON: ${raw.slice(0, 200)}`);
          throw new BadGatewayException(
            "AI returned an invalid draft — please try again",
          );
        }

        const result = roleDraftSchema.safeParse(parsed);
        if (!result.success) {
          this.logger.warn(
            `LLM JSON did not match RoleDraft: ${result.error.message}`,
          );
          throw new BadGatewayException(
            "AI returned an invalid draft — please try again",
          );
        }
        return result.data;
      },
    });
  }
}
