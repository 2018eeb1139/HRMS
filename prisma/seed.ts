import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const DEFAULT_SKILLS = [
  "JavaScript",
  "TypeScript",
  "React",
  "Next.js",
  "Node.js",
  "NestJS",
  "Python",
  "Django",
  "Java",
  "Spring Boot",
  "Go",
  "GraphQL",
  "REST APIs",
  "PostgreSQL",
  "MongoDB",
  "Redis",
  "AWS",
  "Docker",
  "Kubernetes",
  "CI/CD",
  "Git",
  "Figma",
  "Manual Testing",
  "Playwright",
  "Agile/Scrum",
];

const DEFAULT_DEPARTMENTS = [
  "Engineering",
  "Product",
  "Design",
  "Data",
  "Quality Assurance",
  "Human Resources",
  "Finance",
  "Sales",
  "Marketing",
  "Operations",
];

const DEFAULT_SENIORITY_LEVELS = [
  "Intern",
  "Junior",
  "Mid-Level",
  "Senior",
  "Lead",
  "Principal",
  "Manager",
  "Director",
  "Executive",
];

const DEFAULT_PROJECTS = [
  "Recruitment Platform Revamp",
  "Candidate Experience Portal",
  "Interview Scheduling Automation",
  "Talent Analytics Dashboard",
  "HR Operations Workflow",
];

const DEFAULT_STAGES = [
  { key: "CV_RECEIVED", label: "CV Received", order: 0, isTerminal: false },
  { key: "AI_SCREENING", label: "AI Screening", order: 1, isTerminal: false },
  { key: "HR_REVIEW", label: "HR Review", order: 2, isTerminal: false },
  { key: "SHORTLISTED", label: "Shortlisted", order: 3, isTerminal: false },
  { key: "HR_SCREEN", label: "HR Screen", order: 4, isTerminal: false },
  {
    key: "TECH_INTERVIEW",
    label: "Tech Interview",
    order: 5,
    isTerminal: false,
  },
  { key: "HM_INTERVIEW", label: "HM Interview", order: 6, isTerminal: false },
  {
    key: "FINAL_INTERVIEW",
    label: "Final Interview",
    order: 7,
    isTerminal: false,
  },
  { key: "SELECTED", label: "Selected", order: 8, isTerminal: false },
  { key: "OFFER", label: "Offer", order: 9, isTerminal: false },
  { key: "JOINED", label: "Joined", order: 10, isTerminal: true },
  { key: "REJECTED", label: "Rejected", order: 11, isTerminal: true },
  { key: "WITHDRAWN", label: "Withdrawn", order: 12, isTerminal: true },
  { key: "ON_HOLD", label: "On Hold", order: 13, isTerminal: false },
];

// Demo users for dev-login (DEV_LOGIN_ENABLED=true only).
// NEVER modify isActive or add real users here for production.
const DEMO_USERS = [
  { email: "admin@picode.example", name: "Picode Admin", role: "ADMIN" },
  { email: "amanpratapchandra1999@gmail.com", name: "Hana HR", role: "HR" },
  { email: "hm@picode.example", name: "Hiro Manager", role: "HIRING_MANAGER" },
  { email: "pm@picode.example", name: "Pat PM", role: "PROJECT_MANAGER" },
  {
    email: "interviewer@picode.example",
    name: "Ivy Interviewer",
    role: "INTERVIEWER",
  },
  { email: "lead@picode.example", name: "Lee Leadership", role: "LEADERSHIP" },
];

async function main() {
  await prisma.orgSetting.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton", headcountCountsOn: "OFFER_ACCEPTED" },
  });

  // Upsert all demo users idempotently (admin email can be overridden via env).
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@picode.example";
  for (const user of DEMO_USERS) {
    const email =
      user.email === "admin@picode.example" ? adminEmail : user.email;
    await prisma.user.upsert({
      where: { email },
      update: { role: user.role as never, isActive: true },
      create: { email, name: user.name, role: user.role as never },
    });
  }

  for (const stage of DEFAULT_STAGES) {
    await prisma.pipelineStage.upsert({
      where: { key: stage.key },
      update: {
        label: stage.label,
        order: stage.order,
        isTerminal: stage.isTerminal,
      },
      create: stage,
    });
  }

  for (const name of DEFAULT_SKILLS) {
    await prisma.skill.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  for (const name of DEFAULT_DEPARTMENTS) {
    await prisma.department.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  for (const [index, name] of DEFAULT_SENIORITY_LEVELS.entries()) {
    await prisma.seniorityLevel.upsert({
      where: { name },
      update: {},
      create: { name, rank: index + 1 },
    });
  }

  for (const name of DEFAULT_PROJECTS) {
    const existing = await prisma.project.findFirst({ where: { name } });
    if (!existing) {
      await prisma.project.create({
        data: { name, status: "PLANNED" },
      });
    }
  }

  console.log(`Seeded ${DEFAULT_SKILLS.length} skills`);
  console.log(`Seeded ${DEFAULT_DEPARTMENTS.length} departments`);
  console.log(`Seeded ${DEFAULT_SENIORITY_LEVELS.length} seniority levels`);
  console.log(`Seeded ${DEFAULT_PROJECTS.length} default projects`);
  console.log(`Seeded ${DEFAULT_STAGES.length} pipeline stages`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
