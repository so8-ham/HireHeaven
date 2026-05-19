import { GoogleGenAI } from "@google/genai";

export const isGeminiConfigured = () => {
  const key = process.env.API_KEY_GEMINI?.trim();

  return Boolean(
    key &&
      !key.toLowerCase().includes("your") &&
      !key.toLowerCase().includes("gemini key") &&
      key.length > 20
  );
};

export const getGeminiClient = () => {
  if (!isGeminiConfigured()) {
    return null;
  }

  return new GoogleGenAI({ apiKey: process.env.API_KEY_GEMINI!.trim() });
};

/** Models to try, in order. Override with GEMINI_MODEL in .env (comma-separated). */
export const getGeminiModelList = (): string[] => {
  const fromEnv = process.env.GEMINI_MODEL?.trim();
  if (fromEnv) {
    return fromEnv.split(",").map((m) => m.trim()).filter(Boolean);
  }

  return [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash",
  ];
};

export const isGeminiModelNotFoundError = (error: unknown): boolean => {
  const err = error as {
    status?: number | string;
    code?: number | string;
    message?: string;
    error?: { code?: number; message?: string; status?: string };
  };

  const code = err?.status ?? err?.code ?? err?.error?.code;
  const status = err?.error?.status;
  const msg = (err?.error?.message || err?.message || "").toLowerCase();
  const text = JSON.stringify(error).toLowerCase();

  return (
    code === 404 ||
    status === "NOT_FOUND" ||
    msg.includes("is not found") ||
    msg.includes("not supported for generatecontent") ||
    text.includes("not_found")
  );
};

/** Free tier fully exhausted (retry will not help until quota resets). */
export const isGeminiQuotaFullyExhausted = (error: unknown): boolean => {
  const text = JSON.stringify(error).toLowerCase();
  return text.includes("limit: 0") || text.includes("limit:0");
};

export const isGeminiQuotaError = (error: unknown): boolean => {
  const err = error as {
    status?: number | string;
    code?: number | string;
    message?: string;
    error?: { code?: number; message?: string; status?: string };
  };

  const code = err?.status ?? err?.code ?? err?.error?.code;
  const status = err?.error?.status;
  const text = JSON.stringify(error).toLowerCase();

  return (
    code === 429 ||
    status === "RESOURCE_EXHAUSTED" ||
    text.includes("quota") ||
    text.includes("resource_exhausted") ||
    text.includes("rate limit") ||
    text.includes("rate-limit")
  );
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parseRetryDelayMs = (error: unknown): number | null => {
  const err = error as { message?: string; error?: { message?: string } };
  const msg = err?.error?.message || err?.message || "";
  const match = msg.match(/retry in ([\d.]+)s/i);
  if (!match) return null;
  return Math.min(Math.ceil(parseFloat(match[1]) * 1000) + 500, 60000);
};

export type GeminiGenerateOptions = {
  contents: Parameters<GoogleGenAI["models"]["generateContent"]>[0]["contents"];
};

/** Call Gemini with model fallbacks and one retry on rate limits. */
export const generateGeminiContent = async (
  ai: GoogleGenAI,
  options: GeminiGenerateOptions
): Promise<{ text: string; model: string }> => {
  const models = getGeminiModelList();
  let lastError: unknown;

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: options.contents,
      });

      if (!response.text?.trim()) {
        throw new Error("AI did not return a valid text response.");
      }

      return { text: response.text, model };
    } catch (error) {
      lastError = error;

      if (isGeminiModelNotFoundError(error)) {
        console.warn(`Gemini model "${model}" unavailable, trying next model.`);
        continue;
      }

      if (isGeminiQuotaError(error)) {
        if (!isGeminiQuotaFullyExhausted(error)) {
          const delay = parseRetryDelayMs(error);
          if (delay !== null) {
            await sleep(delay);
            try {
              const retryResponse = await ai.models.generateContent({
                model,
                contents: options.contents,
              });
              if (retryResponse.text?.trim()) {
                return { text: retryResponse.text, model };
              }
            } catch {
              // try next model
            }
          }
        }
        continue;
      }

      throw error;
    }
  }

  throw lastError ?? new Error("All Gemini models failed.");
};

export const parseGeminiError = (error: unknown): string => {
  if (isGeminiModelNotFoundError(error)) {
    return 'Gemini model not found. Set GEMINI_MODEL=gemini-2.0-flash in services/utils/.env (do not use gemini-1.5-flash).';
  }

  if (isGeminiQuotaError(error)) {
    return "Gemini free-tier quota is exhausted. Sample ATS feedback was returned instead. Wait a few minutes, upgrade billing at https://ai.google.dev, or set GEMINI_MODEL in services/utils/.env to another model.";
  }

  const err = error as {
    error?: { message?: string };
    response?: { data?: { error?: { message?: string } } };
    message?: string;
  };

  const apiMessage =
    err?.error?.message ||
    err?.response?.data?.error?.message ||
    err?.message;

  if (
    typeof apiMessage === "string" &&
    (apiMessage.includes("API key") || apiMessage.includes("API_KEY"))
  ) {
    return "Gemini API key is invalid. Add a valid API_KEY_GEMINI in services/utils/.env (get one free at https://aistudio.google.com/apikey).";
  }

  return apiMessage || "AI request failed. Please try again.";
};

export const parseModelJson = (rawText?: string) => {
  const cleaned = rawText
    ?.replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  if (!cleaned) {
    throw new Error("AI did not return a valid text response.");
  }

  return JSON.parse(cleaned);
};
