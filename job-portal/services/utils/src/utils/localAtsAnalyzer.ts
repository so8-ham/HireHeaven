import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse") as (
  buffer: Buffer
) => Promise<{ text: string }>;

const SECTION_KEYWORDS = [
  "experience",
  "education",
  "skills",
  "summary",
  "objective",
  "projects",
  "certifications",
  "work history",
  "employment",
];

const ACTION_VERBS = [
  "achieved",
  "built",
  "created",
  "delivered",
  "designed",
  "developed",
  "implemented",
  "improved",
  "increased",
  "led",
  "managed",
  "optimized",
  "reduced",
  "resolved",
];

const TECH_KEYWORDS = [
  "javascript",
  "typescript",
  "python",
  "java",
  "react",
  "node",
  "sql",
  "aws",
  "docker",
  "kubernetes",
  "api",
  "git",
  "html",
  "css",
  "mongodb",
  "postgresql",
  "express",
  "next",
  "angular",
  "vue",
  "c++",
  "c#",
  ".net",
  "linux",
  "agile",
  "scrum",
];

export type LocalAtsReport = {
  atsScore: number;
  scoreBreakdown: {
    formatting: { score: number; feedback: string };
    keywords: { score: number; feedback: string };
    structure: { score: number; feedback: string };
    readability: { score: number; feedback: string };
  };
  suggestions: Array<{
    category: string;
    issue: string;
    recommendation: string;
    priority: "high" | "medium" | "low";
  }>;
  strengths: string[];
  summary: string;
  localAnalysis?: boolean;
  notice?: string;
};

const clamp = (n: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, Math.round(n)));

export const extractPdfText = async (pdfBase64: string): Promise<string> => {
  const data = pdfBase64.replace(/^data:application\/pdf;base64,/, "");
  const buffer = Buffer.from(data, "base64");
  const parsed = await pdfParse(buffer);
  return (parsed.text || "").replace(/\s+/g, " ").trim();
};

export const analyzeResumeText = (rawText: string): LocalAtsReport => {
  const text = rawText.trim();
  const lower = text.toLowerCase();
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  const hasEmail = /\S+@\S+\.\S+/.test(text);
  const hasPhone = /(\+?\d[\d\s\-().]{8,}\d)/.test(text);
  const hasLinkedIn = /linkedin\.com/i.test(text);

  const sectionsFound = SECTION_KEYWORDS.filter((s) => lower.includes(s));
  const actionVerbCount = ACTION_VERBS.filter((v) =>
    new RegExp(`\\b${v}\\b`, "i").test(text)
  ).length;
  const techKeywordCount = TECH_KEYWORDS.filter((k) =>
    lower.includes(k)
  ).length;
  const hasMetrics = /\d+%|\$\d+|\d+\+|\d{1,3}(,\d{3})+/.test(text);
  const bulletCount = (text.match(/[•\-*]\s/g) || []).length;

  let formattingScore = 70;
  if (wordCount >= 150) formattingScore += 10;
  if (wordCount >= 300 && wordCount <= 900) formattingScore += 10;
  if (wordCount > 1200) formattingScore -= 15;
  if (hasEmail) formattingScore += 5;
  if (hasPhone) formattingScore += 5;

  let keywordsScore = 45;
  keywordsScore += Math.min(techKeywordCount * 6, 30);
  if (actionVerbCount >= 3) keywordsScore += 10;
  if (hasMetrics) keywordsScore += 15;

  let structureScore = 40;
  structureScore += Math.min(sectionsFound.length * 12, 48);
  if (sectionsFound.includes("experience")) structureScore += 8;
  if (sectionsFound.includes("skills")) structureScore += 5;

  let readabilityScore = 50;
  if (bulletCount >= 4) readabilityScore += 15;
  if (actionVerbCount >= 5) readabilityScore += 15;
  if (wordCount >= 200 && wordCount <= 800) readabilityScore += 10;
  if (hasMetrics) readabilityScore += 10;

  const scoreBreakdown = {
    formatting: {
      score: clamp(formattingScore),
      feedback: hasEmail && hasPhone
        ? "Contact details detected. Keep a simple single-column layout for ATS parsers."
        : "Add clear email and phone at the top in plain text (no images).",
    },
    keywords: {
      score: clamp(keywordsScore),
      feedback:
        techKeywordCount >= 5
          ? `Found ${techKeywordCount} relevant skill/tech terms. Align more keywords with each job posting you apply to.`
          : "Add more role-specific skills and tools from target job descriptions.",
    },
    structure: {
      score: clamp(structureScore),
      feedback:
        sectionsFound.length >= 3
          ? `Detected sections: ${sectionsFound.slice(0, 5).join(", ")}. Use standard headings like Experience, Education, Skills.`
          : "Use standard section headings (Experience, Education, Skills) so ATS can parse your resume.",
    },
    readability: {
      score: clamp(readabilityScore),
      feedback:
        bulletCount >= 3
          ? "Bullet points help scanability. Lead bullets with strong action verbs and measurable results."
          : "Use bullet points with action verbs (built, led, improved) and numbers where possible.",
    },
  };

  const atsScore = clamp(
    (scoreBreakdown.formatting.score +
      scoreBreakdown.keywords.score +
      scoreBreakdown.structure.score +
      scoreBreakdown.readability.score) /
      4
  );

  const suggestions: LocalAtsReport["suggestions"] = [];

  if (!hasEmail) {
    suggestions.push({
      category: "Contact",
      issue: "No email address detected in the PDF text.",
      recommendation: "Add a professional email in the header as plain text.",
      priority: "high",
    });
  }
  if (!hasPhone) {
    suggestions.push({
      category: "Contact",
      issue: "No phone number detected.",
      recommendation: "Include a phone number near your name and email.",
      priority: "medium",
    });
  }
  if (sectionsFound.length < 3) {
    suggestions.push({
      category: "Structure",
      issue: "Few standard resume sections were found.",
      recommendation:
        "Add clearly labeled sections: Summary, Experience, Education, and Skills.",
      priority: "high",
    });
  }
  if (techKeywordCount < 4) {
    suggestions.push({
      category: "Keywords",
      issue: "Limited technical keywords for ATS matching.",
      recommendation:
        "Include tools and technologies from job listings (e.g. React, SQL, AWS).",
      priority: "high",
    });
  }
  if (!hasMetrics) {
    suggestions.push({
      category: "Content",
      issue: "Few measurable achievements detected.",
      recommendation:
        'Quantify impact (e.g. "Reduced load time by 30%" or "Managed team of 5").',
      priority: "medium",
    });
  }
  if (actionVerbCount < 3) {
    suggestions.push({
      category: "Content",
      issue: "Limited action-oriented language.",
      recommendation:
        "Start experience bullets with verbs like developed, led, implemented, improved.",
      priority: "medium",
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      category: "Polish",
      issue: "Resume is in good shape for ATS.",
      recommendation:
        "Tailor keywords per job posting and keep formatting simple (no tables or text boxes).",
      priority: "low",
    });
  }

  const strengths: string[] = ["Uploaded as PDF — compatible with most ATS systems"];
  if (hasEmail) strengths.push("Email contact found");
  if (hasPhone) strengths.push("Phone contact found");
  if (hasLinkedIn) strengths.push("LinkedIn profile link detected");
  if (sectionsFound.length >= 3) strengths.push("Multiple standard sections detected");
  if (techKeywordCount >= 5) strengths.push("Good coverage of technical keywords");
  if (hasMetrics) strengths.push("Quantified achievements included");
  if (actionVerbCount >= 4) strengths.push("Strong use of action verbs");

  return {
    atsScore,
    scoreBreakdown,
    suggestions: suggestions.slice(0, 6),
    strengths,
    summary: `Local ATS scan complete (score ${atsScore}/100). Analysis is based on text extracted from your PDF — Mistral AI was unavailable due to API quota.`,
    localAnalysis: true,
    notice:
      "Analyzed locally from your resume PDF. For deeper AI feedback, wait for Mistral quota to reset or enable billing.",
  };
};

export const analyzeResumeFromPdf = async (
  pdfBase64: string
): Promise<LocalAtsReport> => {
  const text = await extractPdfText(pdfBase64);

  if (!text || text.length < 40) {
    throw new Error(
      "Could not extract enough text from PDF. Use a text-based PDF (not a scanned image)."
    );
  }

  return analyzeResumeText(text);
};
