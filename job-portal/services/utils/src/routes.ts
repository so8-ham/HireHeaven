import express from "express";
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import {
  generateMistralContent,
  getMistralClient,
  isMistralConfigured,
  isMistralModelNotFoundError,
  isMistralQuotaError,
  parseMistralError,
  parseModelJson,
} from "./utils/mistral.js";
import {
  getDevCareerResponse,
  getDevResumeResponse,
  getQuotaFallbackResumeResponse,
} from "./utils/devAiResponses.js";
import { analyzeResumeFromPdf } from "./utils/localAtsAnalyzer.js";

dotenv.config();

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "../uploads");

const isCloudinaryConfigured = () => {
  const secret = process.env.API_SECRET?.trim();
  return Boolean(
    secret &&
      !secret.includes("*") &&
      secret.toLowerCase() !== "your secret"
  );
};

const uploadLocally = async (buffer: string) => {
  const match = buffer.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid file buffer format");
  }

  await fs.promises.mkdir(uploadsDir, { recursive: true });

  const mime = match[1];
  const ext = mime.includes("pdf")
    ? ".pdf"
    : mime.includes("png")
      ? ".png"
      : mime.includes("jpeg") || mime.includes("jpg")
        ? ".jpg"
        : ".bin";
  const fileName = `${Date.now()}${ext}`;
  const filePath = path.join(uploadsDir, fileName);

  await fs.promises.writeFile(filePath, Buffer.from(match[2], "base64"));

  return {
    url: `http://localhost:${process.env.PORT}/uploads/${fileName}`,
    public_id: fileName,
  };
};

router.post("/upload", async (req, res) => {
  try {
    const { buffer, public_id } = req.body;

    if (!buffer) {
      return res.status(400).json({ message: "buffer is required" });
    }

    if (isCloudinaryConfigured()) {
      try {
        if (public_id) {
          await cloudinary.uploader.destroy(public_id);
        }

        const cloud = await cloudinary.uploader.upload(buffer);

        return res.json({
          url: cloud.secure_url,
          public_id: cloud.public_id,
        });
      } catch (error: any) {
        console.warn(
          "Cloudinary upload failed, using local storage:",
          error.message
        );
      }
    }

    const local = await uploadLocally(buffer);
    res.json(local);
  } catch (error: any) {
    res.status(500).json({
      message: error.message,
    });
  }
});

router.post("/career", async (req, res) => {
  const { skills } = req.body;

  if (!skills || (Array.isArray(skills) && skills.length === 0)) {
    return res.status(400).json({
      message: "Skills Required",
    });
  }

  const skillList = Array.isArray(skills) ? skills : [skills];

  try {

    if (!isMistralConfigured()) {
      return res.json(getDevCareerResponse(skillList));
    }

    const ai = getMistralClient();
    if (!ai) {
      return res.status(503).json({
        message:
          "Mistral API key is not configured. Set API_KEY_MISTRAL in services/utils/.env",
      });
    }

    const prompt = ` 
Based on the following skills: ${skillList.join(", ")}. 
 
Please act as a career advisor and generate a career path suggestion. 
Your entire response must be in a valid JSON format. Do not include any text or markdown 
formatting outside of the JSON structure. 
 
The JSON object should have the following structure: 
{ 
 "summary": "A brief, encouraging summary of the user's skill set and their general job 
title.", 
 "jobOptions": [ 
 { 
"title": "The name of the job role.", 
"responsibilities": "A description of what the user would do in this role.", 
"why": "An explanation of why this role is a good fit for their skills." 
 } 
 ], 
 "skillsToLearn": [ 
 { 
"category": "A general category for skill improvement (e.g., 'Deepen Your Existing Stack 
Mastery', 'DevOps & Cloud').", 
"skills": [ 
 { 
 "title": "The name of the skill to learn.", 
 "why": "Why learning this skill is important.", 
 "how": "Specific examples of how to learn or apply this skill." 
 } 
] 
 } 
 ], 
 "learningApproach": { 
"title": "How to Approach Learning", 
"points": ["A bullet point list of actionable advice for learning."] 
 } 
} 
 `;

    const response = await generateMistralContent(ai, { contents: prompt });

    try {
      const jsonResponse = parseModelJson(response.text);
      res.json(jsonResponse);
    } catch (error) {
      return res.status(500).json({
        message: "AI returned a response that was not valid JSON",
        rawResponse: response.text,
      });
    }
  } catch (error: unknown) {
    if (isMistralQuotaError(error) || isMistralModelNotFoundError(error)) {
      return res.json(getDevCareerResponse(skillList));
    }
    res.status(500).json({
      message: parseMistralError(error),
    });
  }
});

router.post("/resume-analyser", async (req, res) => {
  const { pdfBase64 } = req.body;

  if (!pdfBase64) {
    return res.status(400).json({ message: "PDF data is required" });
  }

  if (
    process.env.ATS_USE_LOCAL === "true" ||
    !isMistralConfigured()
  ) {
    try {
      return res.json(await analyzeResumeFromPdf(pdfBase64));
    } catch {
      return res.json(getDevResumeResponse());
    }
  }

  try {

    const ai = getMistralClient();
    if (!ai) {
      return res.status(503).json({
        message:
          "Mistral API key is not configured. Set API_KEY_MISTRAL in services/utils/.env",
      });
    }

    const prompt = ` 
You are an expert ATS (Applicant Tracking System) analyzer. Analyze the following resume 
and provide: 
1. An ATS compatibility score (0-100) 
2. Detailed suggestions to improve the resume for better ATS performance 
 
Your entire response must be in valid JSON format. Do not include any text or markdown 
formatting outside of the JSON structure. 
 
The JSON object should have the following structure: 
{ 
  "atsScore": 85, 
  "scoreBreakdown": { 
    "formatting": { 
      "score": 90, 
      "feedback": "Brief feedback on formatting" 
    }, 
    "keywords": { 
      "score": 80, 
      "feedback": "Brief feedback on keyword usage" 
    }, 
    "structure": { 
      "score": 85, 
      "feedback": "Brief feedback on resume structure" 
    }, 
    "readability": { 
      "score": 88, 
      "feedback": "Brief feedback on readability" 
    } 
  }, 
  "suggestions": [ 
    { 
      "category": "Category name (e.g., 'Formatting', 'Content', 'Keywords', 
'Structure')", 
      "issue": "Description of the issue found", 
      "recommendation": "Specific actionable recommendation to fix it", 
      "priority": "high/medium/low" 
    } 
  ], 
  "strengths": [ 
    "List of things the resume does well for ATS" 
  ], 
  "summary": "A brief 2-3 sentence summary of the overall ATS performance" 
} 
 
Focus on: - File format and structure compatibility - Proper use of standard section headings - Keyword optimization - Formatting issues (tables, columns, graphics, special characters) - Contact information placement - Date formatting - Use of action verbs and quantifiable achievements - Section organization and flow 
`;

    const pdfData = pdfBase64.replace(/^data:application\/pdf;base64,/, "");

    const response = await generateMistralContent(ai, {
      contents: prompt,
    });

    try {
      const jsonResponse = parseModelJson(response.text);
      res.json(jsonResponse);
    } catch (error) {
      return res.status(500).json({
        message: "AI returned a response that was not valid JSON",
        rawResponse: response.text,
      });
    }
  } catch (error: unknown) {
    if (isMistralQuotaError(error) || isMistralModelNotFoundError(error)) {
      try {
        const localReport = await analyzeResumeFromPdf(pdfBase64);
        return res.json(localReport);
      } catch (localError) {
        console.warn("Local ATS fallback failed:", localError);
        return res.json(getQuotaFallbackResumeResponse());
      }
    }
    res.status(500).json({
      message: parseMistralError(error),
    });
  }
});

export default router;
