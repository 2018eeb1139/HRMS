export const LLM = Symbol("LLM");
export const ROLE_BUILDER_LLM = Symbol("ROLE_BUILDER_LLM");
export const GROQ_LLM = Symbol("GROQ_LLM");

export interface LlmPort {
  complete(args: {
    system?: string;
    user: string;
    maxTokens?: number;
    model?: string;
    jsonMode?: boolean;
  }): Promise<string>;
}
