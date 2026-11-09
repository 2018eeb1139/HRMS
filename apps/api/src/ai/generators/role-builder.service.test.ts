import { describe, it, expect, vi } from "vitest";
import { RoleBuilderService } from "./role-builder.service";
import { roleDraftSchema } from "@picode-hr/shared";
import type { RoleDraft, RoleBuilderInput } from "@picode-hr/shared";
import { BadGatewayException } from "@nestjs/common";

const validDraft: RoleDraft = {
  jobDescription: "We are seeking a senior TypeScript engineer...",
  responsibilities: ["Design APIs", "Lead code reviews"],
  requiredSkills: ["TypeScript", "NestJS"],
  preferredSkills: ["GraphQL", "Redis"],
  interviewCriteria: ["System design", "Code quality"],
  screeningQuestions: ["Describe a complex system you built."],
};

const sampleInput: RoleBuilderInput = {
  title: "Senior Backend Engineer",
  seniority: "SENIOR",
  mustHaves: "TypeScript, NestJS",
  context: "Building a recruitment platform",
};

const makeFakeCache = () => ({
  getOrCompute: vi.fn(
    async <T>(args: {
      type: string;
      inputHash: string;
      model: string;
      promptVersion: string;
      compute: () => Promise<T>;
    }) => args.compute(),
  ),
  hashInput: (obj: unknown) => JSON.stringify(obj),
});

describe("RoleBuilderService", () => {
  it("returns parsed RoleDraft when FakeLlm returns valid JSON", async () => {
    const fakeLlm = {
      complete: vi.fn().mockResolvedValue(JSON.stringify(validDraft)),
    };
    const fakeCache = makeFakeCache();
    const svc = new RoleBuilderService(fakeLlm as never, fakeCache as never);
    const result = await svc.build(sampleInput);
    expect(() => roleDraftSchema.parse(result)).not.toThrow();
    expect(result.jobDescription).toBe(validDraft.jobDescription);
    expect(result.requiredSkills).toEqual(["TypeScript", "NestJS"]);
  });

  it("strips ```json fences before parsing", async () => {
    const fenced = "```json\n" + JSON.stringify(validDraft) + "\n```";
    const fakeLlm = { complete: vi.fn().mockResolvedValue(fenced) };
    const fakeCache = makeFakeCache();
    const svc = new RoleBuilderService(fakeLlm as never, fakeCache as never);
    const result = await svc.build(sampleInput);
    expect(result.responsibilities).toEqual(validDraft.responsibilities);
  });

  it("strips plain ``` fences before parsing", async () => {
    const fenced = "```\n" + JSON.stringify(validDraft) + "\n```";
    const fakeLlm = { complete: vi.fn().mockResolvedValue(fenced) };
    const fakeCache = makeFakeCache();
    const svc = new RoleBuilderService(fakeLlm as never, fakeCache as never);
    const result = await svc.build(sampleInput);
    expect(result.preferredSkills).toEqual(validDraft.preferredSkills);
  });

  it("calls getOrCompute with type role_builder and a hashed input", async () => {
    const fakeLlm = {
      complete: vi.fn().mockResolvedValue(JSON.stringify(validDraft)),
    };
    const fakeCache = makeFakeCache();
    const svc = new RoleBuilderService(fakeLlm as never, fakeCache as never);
    await svc.build(sampleInput);
    expect(fakeCache.getOrCompute).toHaveBeenCalledOnce();
    const callArgs = fakeCache.getOrCompute.mock.calls[0][0];
    expect(callArgs.type).toBe("role_builder");
    expect(typeof callArgs.inputHash).toBe("string");
    expect(callArgs.inputHash.length).toBeGreaterThan(0);
  });

  it("throws when FakeLlm returns garbage JSON", async () => {
    const fakeLlm = {
      complete: vi.fn().mockResolvedValue("not valid json!!!"),
    };
    const fakeCache = makeFakeCache();
    const svc = new RoleBuilderService(fakeLlm as never, fakeCache as never);
    await expect(svc.build(sampleInput)).rejects.toThrow(BadGatewayException);
  });

  it("throws when FakeLlm returns JSON that fails schema validation", async () => {
    const bad = { ...validDraft, jobDescription: 123 };
    const fakeLlm = {
      complete: vi.fn().mockResolvedValue(JSON.stringify(bad)),
    };
    const fakeCache = makeFakeCache();
    const svc = new RoleBuilderService(fakeLlm as never, fakeCache as never);
    await expect(svc.build(sampleInput)).rejects.toThrow(BadGatewayException);
  });

  it("does not call LLM on cache hit", async () => {
    const fakeLlm = { complete: vi.fn() };
    const hitCache = {
      getOrCompute: async <T>() => validDraft as unknown as T,
      hashInput: (obj: unknown) => JSON.stringify(obj),
    };
    const svc = new RoleBuilderService(fakeLlm as never, hitCache as never);
    const result = await svc.build(sampleInput);
    expect(result.jobDescription).toBe(validDraft.jobDescription);
    expect(fakeLlm.complete).not.toHaveBeenCalled();
  });
});
