const MISTRAL_API_BASE_URL =
  process.env.MISTRAL_BASE_URL?.trim() || "https://api.mistral.ai/v1";

export const isMistralConfigured = () => {
  const key = process.env.API_KEY_MISTRAL?.trim();

  return Boolean(
    key &&
      !key.toLowerCase().includes("your") &&
      !key.toLowerCase().includes("mistral key") &&
      key.length > 20
  );
};

export const getMistralClient = () => {
  if (!isMistralConfigured()) {
    return null;
  }

  return {
    apiKey: process.env.API_KEY_MISTRAL!.trim(),
    baseUrl: MISTRAL_API_BASE_URL,
  };
};

export const getMistralModelList = (): string[] => {
  const fromEnv = process.env.MISTRAL_MODEL?.trim();
  if (fromEnv) {
    return fromEnv.split(",").map((m) => m.trim()).filter(Boolean);
  }

  return ["mistral-7b-instruct", "mistral-7b"];
};

export const isMistralModelNotFoundError = (error: unknown): boolean => {
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
    msg.includes("model not found") ||
    msg.includes("unknown model") ||
    msg.includes("does not exist") ||
    text.includes("not_found") ||
    text.includes("unknown model")
  );
};

export const isMistralQuotaError = (error: unknown): boolean => {
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
    status === "TOO_MANY_REQUESTS" ||
    text.includes("quota") ||
    text.includes("resource_exhausted") ||
    text.includes("rate limit") ||
    text.includes("rate-limit") ||
    text.includes("too many requests")
  );
};

export const isMistralQuotaFullyExhausted = (error: unknown): boolean => {
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
    code === 403 ||
    status === "QUOTA_EXCEEDED" ||
    status === "INSUFFICIENT_QUOTA" ||
    text.includes("quota exceeded") ||
    text.includes("insufficient quota") ||
    text.includes("quota exhausted")
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

export type MistralGenerateOptions = {
  contents: string | Array<{ role?: string; text: string }>;
};

const getPromptText = (
  contents: MistralGenerateOptions["contents"]
): string => {
  if (typeof contents === "string") {
    return contents;
  }

  return contents.map((item) => item.text).join("\n");
};

const normalizeResponseText = (body: any): string => {
  if (!body) return "";
  if (typeof body === "string") return body;
  if (typeof body.output === "string") return body.output;
  if (typeof body.result === "string") return body.result;
  if (Array.isArray(body.outputs) && body.outputs[0]) {
    const output = body.outputs[0];
    if (typeof output === "string") return output;
    if (typeof output.content === "string") return output.content;
    if (typeof output.text === "string") return output.text;
    if (Array.isArray(output.content) && typeof output.content[0] === "string") {
      return output.content[0];
    }
  }
  if (Array.isArray(body.output) && typeof body.output[0] === "string") {
    return body.output[0];
  }
  return "";
};

export const generateMistralContent = async (
  ai: { apiKey: string; baseUrl: string },
  options: MistralGenerateOptions
): Promise<{ text: string; model: string }> => {
  const models = getMistralModelList();
  const prompt = getPromptText(options.contents);
  let lastError: unknown;

  const fetchFn = (globalThis as any).fetch;
  if (!fetchFn) {
    throw new Error("Fetch API is not available in this runtime.");
  }

  for (const model of models) {
    try {
      const response = await fetchFn(`${ai.baseUrl}/models/${model}/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ai.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: prompt,
          temperature: 0.0,
          top_p: 0.95,
          max_tokens: 1024,
        }),
      });

      const body = await response.json();
      if (!response.ok) {
        throw body || new Error("Mistral API request failed.");
      }

      const text = normalizeResponseText(body).trim();
      if (!text) {
        throw body || new Error("AI did not return a valid text response.");
      }

      return { text, model };
    } catch (error) {
      lastError = error;

      if (isMistralModelNotFoundError(error)) {
        console.warn(`Mistral model "${model}" unavailable, trying next model.`);
        continue;
      }

      if (isMistralQuotaError(error)) {
        if (!isMistralQuotaFullyExhausted(error)) {
          const delay = parseRetryDelayMs(error);
          if (delay !== null) {
            await sleep(delay);
            try {
              const retryResponse = await fetchFn(`${ai.baseUrl}/models/${model}/completions`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${ai.apiKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  input: prompt,
                  temperature: 0.0,
                  top_p: 0.95,
                  max_tokens: 1024,
                }),
              });

              const retryBody = await retryResponse.json();
              if (!retryResponse.ok) {
                throw retryBody || new Error("Mistral retry request failed.");
              }

              const retryText = normalizeResponseText(retryBody).trim();
              if (retryText) {
                return { text: retryText, model };
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

  throw lastError ?? new Error("All Mistral models failed.");
};

export const parseMistralError = (error: unknown): string => {
  if (isMistralModelNotFoundError(error)) {
    return 'Mistral model not found. Set MISTRAL_MODEL=mistral-7b-instruct in services/utils/.env.';
  }

  if (isMistralQuotaError(error)) {
    return "Mistral quota is exhausted or rate limited. Sample ATS feedback was returned instead. Wait a few minutes, switch keys, or set ATS_USE_LOCAL=true.";
  }

  const err = error as {
    error?: { message?: string };
    message?: string;
    response?: { data?: { error?: { message?: string } } };
  };

  const apiMessage =
    err?.error?.message ||
    err?.response?.data?.error?.message ||
    err?.message;

  if (
    typeof apiMessage === "string" &&
    (apiMessage.includes("API key") || apiMessage.includes("API_KEY") || apiMessage.includes("authentication"))
  ) {
    return "Mistral API key is invalid. Add a valid API_KEY_MISTRAL in services/utils/.env.";
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
