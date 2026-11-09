import { ServiceUnavailableException } from "@nestjs/common";
import type { LlmPort } from "./llm.port";

export class OllamaLlm implements LlmPort {
  async complete(args: {
    system?: string;
    user: string;
    maxTokens?: number;
    model?: string;
  }): Promise<string> {
    const baseUrl = (
      process.env.OLLAMA_BASE_URL ?? "http://localhost:11434"
    ).replace(/\/+$/, "");
    const model = args.model ?? process.env.OLLAMA_MODEL ?? "qwen2.5:3b";

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        messages: [
          ...(args.system ? [{ role: "system", content: args.system }] : []),
          { role: "user", content: args.user },
        ],
      }),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Ollama request failed with status ${response.status}`,
      );
    }

    const result: unknown = await response.json();
    if (
      typeof result !== "object" ||
      result === null ||
      !("message" in result) ||
      typeof result.message !== "object" ||
      result.message === null ||
      !("content" in result.message) ||
      typeof result.message.content !== "string"
    ) {
      throw new ServiceUnavailableException(
        "Ollama returned an invalid response",
      );
    }

    return result.message.content;
  }
}
