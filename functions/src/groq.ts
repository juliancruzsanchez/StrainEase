// Groq Chat Completions client + JSON extraction helpers.
//
// We use the OpenAI-compatible endpoint at api.groq.com/openai/v1.
// The chosen model is Groq's current Llama 3 70B-class model
// (llama-3.3-70b-versatile). The original `llama3-70b-8192` is deprecated
// on Groq; 3.3 70B is its spiritual successor and supports the
// `response_format: json_object` mode we lean on for clean output.
//
// All callers in this codebase demand strict JSON, so we always send
// `response_format: { type: "json_object" }`. The system prompts already
// instruct the model to "Respond with ONLY a single JSON object", which
// is a prerequisite for that mode.

import { HttpsError } from "firebase-functions/v2/https";

export const GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function callGroq(
  apiKey: string,
  messages: ChatMessage[],
): Promise<string> {
  if (!apiKey) {
    throw new HttpsError(
      "failed-precondition",
      "The Groq API key is missing. Run `firebase functions:secrets:set GROQ_API_KEY` and redeploy.",
    );
  }

  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        temperature: 0.4,
        max_tokens: 2200,
        response_format: { type: "json_object" },
      }),
    });
  } catch {
    throw new HttpsError(
      "unavailable",
      "Could not reach our research service. Please try again in a moment.",
    );
  }

  const data = (await res.json().catch(() => null)) as {
    error?: { message?: string };
    message?: string;
    choices?: { message?: { content?: string } }[];
  } | null;

  if (!res.ok) {
    const detail =
      data?.error?.message ?? data?.message ?? `status ${res.status}`;
    throw new HttpsError(
      "internal",
      `Our research service returned an error: ${detail}`,
    );
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new HttpsError(
      "internal",
      "Our research service returned an empty response. Please try again.",
    );
  }
  return content;
}

/**
 * Extract a JSON object from a model response, tolerating stray text,
 * markdown fences, and `<think>` tags. Even though we request JSON
 * mode from Groq, the helper stays defensive in case a future model
 * slips a preamble or reasoning block in.
 */
export function extractJsonObject(content: string): unknown | null {
  const stripped = content.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "").trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(stripped.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}