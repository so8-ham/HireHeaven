export const getDevCareerResponse = (skills: string[]) => ({
  summary: `Based on your skills (${skills.join(", ")}), you have a solid foundation for tech roles. This is sample guidance because Mistral is not configured yet.`,
  jobOptions: [
    {
      title: "Full Stack Developer",
      responsibilities:
        "Build and maintain web applications using frontend and backend technologies.",
      why: `Your skills in ${skills.slice(0, 2).join(" and ") || "development"} align well with full stack work.`,
    },
    {
      title: "Backend Developer",
      responsibilities:
        "Design APIs, databases, and server-side logic for scalable applications.",
      why: "Backend roles are a strong match when you are comfortable with logic, data, and system design.",
    },
  ],
  skillsToLearn: [
    {
      category: "Deepen Your Stack",
      skills: [
        {
          title: "System Design Basics",
          why: "Helps you grow from building features to designing reliable services.",
          how: "Study REST APIs, databases, caching, and one cloud platform.",
        },
      ],
    },
  ],
  learningApproach: {
    title: "How to Approach Learning",
    points: [
      "Build one small project per skill you add.",
      "Contribute to open source or clone a real app architecture.",
      "Practice interview-style problem solving weekly.",
    ],
  },
  devMode: true,
});

export const getQuotaFallbackResumeResponse = () => ({
  ...getDevResumeResponse(),
  devMode: true,
  quotaExceeded: true,
  notice:
    "Mistral quota is used up for now. This is sample ATS guidance — wait ~1 minute and try again, or add billing / a new API key.",
  summary:
    "Sample ATS report (Mistral quota exceeded). Your PDF was received; configure billing or retry later for AI analysis of this specific resume.",
});

export const getDevResumeResponse = () => ({
  atsScore: 78,
  scoreBreakdown: {
    formatting: {
      score: 80,
      feedback: "Layout is readable; sample analysis (configure Mistral for real results).",
    },
    keywords: {
      score: 75,
      feedback: "Add more role-specific keywords from job descriptions you target.",
    },
    structure: {
      score: 82,
      feedback: "Standard sections are present; keep headings simple for ATS parsers.",
    },
    readability: {
      score: 76,
      feedback: "Use concise bullet points and measurable achievements.",
    },
  },
  suggestions: [
    {
      category: "Keywords",
      issue: "Some skills may not match common ATS keyword lists.",
      recommendation:
        "Mirror important terms from job postings in your skills and experience sections.",
      priority: "high" as const,
    },
    {
      category: "Content",
      issue: "Impact could be stronger with metrics.",
      recommendation: 'Add numbers where possible (e.g. "Improved load time by 30%").',
      priority: "medium" as const,
    },
  ],
  strengths: [
    "PDF format is suitable for ATS upload",
    "Clear section structure",
    "Professional tone",
  ],
  summary:
    "This is a demo ATS report. Add a valid Mistral API key in services/utils/.env for AI-powered resume analysis.",
  devMode: true,
});
