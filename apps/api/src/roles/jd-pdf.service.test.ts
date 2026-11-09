import { describe, it, expect } from "vitest";
import { JdPdfService } from "./jd-pdf.service";

describe("JdPdfService", () => {
  const svc = new JdPdfService();

  it("renders a PDF with all fields", async () => {
    const pdf = await svc.render({
      title: "Senior Backend Engineer",
      experience: "5+ Years",
      location: "Bangalore",
      employmentType: "Full-Time",
      responsibilities: "Design APIs\nLead code reviews",
      requiredSkills: ["Node.js", "PostgreSQL"],
      education: "Bachelor's degree in Computer Science",
      jobDescription: "Build and run our APIs.\n\nWork closely with product.",
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-"); // every PDF file starts with this
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.toString("latin1")).toContain("/Subtype /Image");
  });

  it("renders with only the required fields", async () => {
    const pdf = await svc.render({
      title: "QA Engineer",
      requiredSkills: [],
      jobDescription: "Test things.",
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("renders job descriptions across multiple pages", async () => {
    const pdf = await svc.render({
      title: "QA Engineer",
      requiredSkills: [],
      jobDescription: Array(250)
        .fill("Test the application and document the results.")
        .join("\n"),
    });

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const pageCount = (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
    expect(pageCount).toBeGreaterThan(1);
  });
});
