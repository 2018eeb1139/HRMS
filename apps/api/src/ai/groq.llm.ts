import { Groq } from "groq-sdk";
import { ServiceUnavailableException } from "@nestjs/common";
import type { LlmPort } from "./llm.port";

export class GroqLlm implements LlmPort {
  private client: Groq | null = null;

  private getClient(): Groq {
    if (!this.client) {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) {
        throw new ServiceUnavailableException(
          "AI is not configured - set GROQ_API_KEY",
        );
      }
      this.client = new Groq({ apiKey });
    }
    return this.client;
  }

  async complete(args: {
    system?: string;
    user: string;
    maxTokens?: number;
    model?: string;
    jsonMode?: boolean;
  }): Promise<string> {
    const response = await this.getClient().chat.completions.create({
      model: args.model ?? process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
      max_completion_tokens: args.maxTokens ?? 1024,
      reasoning_effort: "medium",
      stream: false,
      ...(args.jsonMode && { response_format: { type: "json_object" as const } }),
      messages: [
        ...(args.system
          ? [{ role: "system" as const, content: args.system }]
          : []),
        { role: "user", content: args.user },
      ],
    });

    const content = response.choices[0]?.message.content;
    if (typeof content !== "string") {
      throw new ServiceUnavailableException(
        "Groq returned an empty completion",
      );
    }
    return content;
  }
}
