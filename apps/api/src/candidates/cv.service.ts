import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import type { Queue } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { STORAGE, type Storage } from "../storage/storage.interface";
import { CV_PARSE_QUEUE } from "../queue/queue.module";
import { Groq } from "groq-sdk";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { parsedCvSchema, type ParsedCv } from "@picode-hr/shared";

@Injectable()
export class CvService {
  private groqClient?: Groq;

  private getGroqClient(): Groq {
    if (this.groqClient) return this.groqClient;

    const apiKey = process.env["GROQ_API_KEY"];
    if (!apiKey) {
      throw new Error("GROQ_API_KEY is required for resume parsing.");
    }

    this.groqClient = new Groq({ apiKey });
    return this.groqClient;
  }
  constructor(
    private prisma: PrismaService,
    @Inject(STORAGE) private storage: Storage,
    @Inject(CV_PARSE_QUEUE) private cvParseQueue: Queue,
  ) {}

  async uploadCv(
    candidateId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string },
  ) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id: candidateId },
    });
    if (!candidate)
      throw new NotFoundException(`Candidate ${candidateId} not found`);

    const timestamp = Date.now();
    const storageKey = `cvs/${candidateId}/${timestamp}-${file.originalname}`;

    await this.storage.put(storageKey, file.buffer, file.mimetype);

    const cvFile = await this.prisma.cvFile.create({
      data: {
        candidateId,
        storageKey,
        originalName: file.originalname,
        mimeType: file.mimetype,
        status: "UPLOADED",
      },
    });

    await this.cvParseQueue.add("parse", { cvFileId: cvFile.id });

    return cvFile;
  }

  async parseResume(file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
  }): Promise<ParsedCv> {
    const extension = file.originalname.split(".").pop()?.toLowerCase();

    let text: string;
    if (extension === "pdf") {
      const result = await pdfParse(file.buffer);
      text = result.text;
    } else if (extension === "docx") {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      text = result.value;
    } else {
      throw new BadRequestException("Only PDF and DOCX resumes are supported.");
    }

    if (!text.trim()) {
      throw new BadRequestException(
        "No readable text found in the resume. Scanned resumes are not supported yet.",
      );
    }

    const response = await this.getGroqClient().chat.completions.create({
      model: process.env["GROQ_MODEL"] ?? "openai/gpt-oss-120b",
      max_completion_tokens: 1024,
      stream: false,
      messages: [
        {
          role: "system",
          content:
            "Extract candidate information from the resume. Return only a JSON object with optional fields: name, email, phone, location, currentTitle, currentEmployer, totalYearsExperience, skills. Use strings for text fields, a whole number for totalYearsExperience (round to the nearest year), and arrays of strings for list fields.",
        },
        {
          role: "user",
          content: `Parse this resume text:\n\n${text}`,
        },
      ],
    });

    const content = response.choices[0]?.message.content;
    if (typeof content !== "string") {
      throw new Error("Resume parser returned an empty response.");
    }

    const cleaned = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("Resume parser returned invalid JSON.");
    }

    const result = parsedCvSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `Parsed resume failed validation: ${result.error.message}`,
      );
    }

    return result.data;
  }
}
