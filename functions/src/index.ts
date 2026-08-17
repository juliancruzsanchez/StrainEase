// StrainEase backend.
//
// - popularStrains / searchStrain: public Leafly data lookups (no AI).
// - compareStrains / recommendStrainsForConditions: Groq AI synthesis
//   (llama-3.3-70b-versatile), auth-gated — Firebase callable functions
//   automatically attach the caller's ID token, and we reject calls
//   without `request.auth`.
import { HttpsError, onCall, type CallableOptions } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getStorage } from "firebase-admin/storage";
import { enrichProfiles, lookupProfile } from "./enrich";
import { findDoctors as findDoctorsImpl, type DoctorQuery, type DoctorResult } from "./doctors";
import { fetchPopular, fetchProfiles } from "./leafly";
import { cachedFetchImage, imageCacheKey } from "./image-cache";
import { callGroq, extractJsonObject } from "./groq";
import { matchRedditSeeds } from "./reddit-seed";
import { clientIp, guestRateLimit, persistResult } from "./results";
import type {
  RecommendationResult,
  RedditSource,
  StrainAnalysis,
  StrainComparison,
  StrainProfile,
  StrainRecommendation,
} from "./types";

export const GROQ_API_KEY = defineSecret("GROQ_API_KEY");

const AI_OPTIONS: CallableOptions = {
  secrets: [GROQ_API_KEY],
  timeoutSeconds: 120,
  memory: "512MiB",
};

/* ── Public data lookups (no AI, no auth required) ─────────────────── */

/** Popular strains on Leafly right now. */
export const popularStrains = onCall(async (): Promise<StrainProfile[]> => {
  return await fetchPopular();
});

/** Look up one strain by name on Leafly + Weedmaps, with reviews and Reddit. */
export const searchStrain = onCall(
  { timeoutSeconds: 60 },
  async (request): Promise<StrainProfile | null> => {
    const name =
      typeof request.data?.name === "string" ? request.data.name : "";
    if (name.trim() === "") return null;
    const conditions = asStringArray(request.data?.conditions);
    return await lookupProfile(name, conditions);
  },
);

/* ── AI synthesis (auth-gated) ─────────────────────────────────────── */

const COMPARE_SYSTEM_PROMPT = `You are Dr. Kaya, an AI cannabis care assistant working inside StrainEase. Patients come to you to choose between strains for symptom relief, so you speak directly to them — not to budtenders or enthusiasts.

Rules:
- Base every claim on the strain data provided. Never invent numbers, terpenes, effects, or uses.
- Some strains arrive WITHOUT a curated profile (marked "noCuratedProfile": true). For those, research from your own knowledge of how the strain is commonly described on Leafly, Weedmaps, Reddit, Google, and dispensary menus. Only state details you are reasonably confident are commonly reported about that strain; otherwise say "not verified" or note the uncertainty instead of guessing. If a name does not appear to be a real, known strain, say so plainly in the summary.
- communityNotes may include Leafly reviews, Weedmaps tags, and real Reddit comments about the patient's ailments. Use them. Do not invent additional first-person quotes.
- Always surface Reddit community threads for every strain in the comparison. You will be given a vetted list of real Reddit threads (verified out-of-band) at the bottom of the user message — pick from that list exclusively. Do not invent URLs; only return threads whose "url" you can copy verbatim from the list. Reuse the same "url", "subreddit", and "title" exactly as provided; you may rewrite "snippet" in your own words and set "score" to null. Include 1–3 threads per strain in the top-level "redditSources" array, deduplicated across strains. Prefer threads that match the patient's condition focus when one is given.
- Write for the patient: precise, calm, practical, and low-jargon. Lead with symptom relief and day-to-day usability. If you use a technical term, define it in one short phrase.
- Never promise a cure, never advise stopping prescribed medication, and never diagnose. Encourage the patient to talk to their healthcare provider.
- If one or more condition focuses are given, evaluate each strain's suitability for those conditions and name the single best fit for the patient.
- Honor the patient's context when provided: time of day, form, THC sensitivity, medications (caution only — never tell them to stop a prescription), strains they already have, and anything they wrote in their own words.
- Respond with ONLY a single JSON object. No markdown, no text outside the JSON.

JSON shape (all fields required):
{
  "headline": "one sentence, 18 words max, the practical takeaway for the patient",
  "summary": "2-4 sentences synthesizing the comparison for a patient choosing between strains",
  "forCondition": {"best": "strain name", "why": "1-2 sentences", "runnerUp": "strain name"} or null when no condition focus is given,
  "keyDifferences": ["3-5 short bullets"],
  "commonGround": ["2-3 short bullets"],
  "cautions": ["2-4 short, practical cautions, including consulting a physician and starting with a low dose"],
  "redditSources": [
    {"url": "https://old.reddit.com/r/<sub>/comments/<id>/<slug>/", "subreddit": "<sub>", "title": "thread title", "snippet": "1-sentence vibe of the thread (optional)", "score": 0}
  ]
}

Reddit sourcing rules:
- Pick threads ONLY from the vetted list provided in the user message. Never invent a redditSources URL.
- Copy "url", "subreddit", and "title" verbatim from the list.
- 1–3 threads per strain, deduped across strains.
- Prefer threads whose "snippet" matches the patient's condition focus when one is given.
- If the list has no relevant threads, return an empty array for "redditSources" rather than fabricating any.`;

const RECOMMEND_SYSTEM_PROMPT = `You are Dr. Kaya, StrainEase's AI cannabis care assistant. A patient tells you which symptoms or conditions they are treating, and you recommend the strains most commonly reported to help with those symptoms.

Rules:
- Base recommendations on the strain data provided (Leafly detail pages plus Weedmaps when available). You may also recommend well-known strains that are NOT in the list, based on your knowledge of how they are commonly described on Leafly, Weedmaps, Reddit, and dispensary menus — but only recommend strains you are confident really exist and are commonly reported for the symptoms.
- Recommend 3-5 distinct strains, ordered from best overall fit to least.
- Every recommendation needs a concrete reason tied to the patient's symptoms, a note on who it suits best (e.g. daytime vs evening use, anxiety-sensitive patients), and one practical caution.
- Respect the potency preference if one is given.
- Honor the patient's context when provided: time of day, form, THC sensitivity, medications (caution only — never tell them to stop a prescription), strains they already have, and anything they wrote in their own words. Treat their own sentence as the primary intent.
- Write for the patient: precise, calm, practical, and low-jargon. If you use a technical term, define it in one short phrase.
- Never promise a cure, never advise stopping prescribed medication, and never diagnose. Encourage the patient to talk to their healthcare provider.
- Respond with ONLY a single JSON object. No markdown, no text outside the JSON.

JSON shape (all fields required):
{
  "headline": "one sentence, 18 words max, the practical takeaway",
  "summary": "2-4 sentences",
  "recommendations": [
    {"strainName": "...", "reason": "1-2 sentences tied to the symptoms", "bestFor": "short phrase on who it suits", "caution": "one short practical caution"}
  ],
  "redditSources": [
    {"url": "https://old.reddit.com/r/<sub>/comments/<id>/<slug>/", "subreddit": "<sub>", "title": "thread title", "snippet": "1-sentence vibe of the thread (optional)", "score": 0}
  ]
}

Reddit sourcing rules:
- Pick threads ONLY from the vetted list provided in the user message. Never invent a redditSources URL.
- Copy "url", "subreddit", and "title" verbatim from the list.
- 1–3 threads per recommendation, deduped.
- Prefer threads whose "snippet" matches the patient's symptom focus.
- If the list has no relevant threads, return an empty array for "redditSources" rather than fabricating any.`;

/**
 * Per-strain AI description for a specific patient. The patient has a
 * saved set of ailments; we tailor the writeup to those while still
 * keeping a healthy dose of general, factual information so the page
 * is useful even if the ailments don't all overlap with the strain.
 *
 * We also accept the patient's medications and a short relief-log
 * summary so the model can flag known interactions (caution only,
 * never "stop your prescription") and weight "What it might do for
 * you" against how similar strains have actually worked for them.
 *
 * Output is split into a fixed three sections so the client can render
 * them as three discrete blocks instead of one wall of text:
 *   - "Overview"               — what this strain is, plain-language intro.
 *   - "What it might do for you" — tied to the patient's ailments.
 *   - "What to expect"         — practical considerations (potency,
 *                                timing, cautions).
 *
 * Each section body is short prose (2-4 sentences), no markdown, no
 * headings inside the body.
 */
const DESCRIBE_SYSTEM_PROMPT = `You are Dr. Kaya, StrainEase's AI cannabis care assistant, writing a patient-facing description for a single cannabis strain.

Rules:
- Base every claim on the strain data provided. Never invent numbers, terpenes, effects, or uses.
- Some strains arrive WITHOUT a curated profile (marked "noCuratedProfile": true). For those, research from your own knowledge of how the strain is commonly described on Leafly, Weedmaps, Reddit, Google, and dispensary menus. Only state details you are reasonably confident are commonly reported about that strain; otherwise say "not verified" or note the uncertainty instead of guessing. If a name does not appear to be a real, known strain, say so plainly in the "Overview" section.
- The patient has a saved set of ailments. For EACH ailment in their list, honestly evaluate whether this strain is a reasonable match based on its commonly reported uses and effects. Speak directly to the patient ("for your insomnia…", "if your anxiety spikes in the evening…"). If the strain's typical profile does not fit an ailment, say so plainly (for example, "this strain tends not to address X") rather than stretching to find a positive angle. It is fine and expected to call out ailments that do not line up; do not skew positive. Skip any ailment you would have to invent a connection for. Keep it grounded; do not promise cures or diagnose.
- The patient has also told us what medications they take and what has actually happened the last few times they used other strains (their relief log). Use both pieces of context where they help:
    * Medications: only mention a medication when there is a commonly cited interaction risk between cannabis and that specific drug (e.g. sedative load with benzodiazepines, blood-pressure effects with certain antihypertensives, CYP450 metabolism warnings with SSRIs / antipsychotics). Always phrase as "ask your clinician about combining with X" — never advise stopping a prescription. When in doubt, omit.
    * Relief log: when the patient has logged how previous strains went for these same ailments, use that history to calibrate "What it might do for you" — e.g. "Last time Northern Lights was too strong for your insomnia; this one leans similar, so start lower." If the relief log is empty, say nothing.
- Keep each section body short and easy to skim on a phone. Split each section into 2-4 short paragraphs (1-2 sentences each), separated by a single blank line, so it reads with breathing room instead of as a wall of text. No markdown, no inner headings, no bullet lists inside a section.
- Keep general information present too — the page should still feel informative even if the strain only partially matches the patient's ailments. Roughly two-thirds of the body can be general, one-third tailored.
- Never promise a cure, never advise stopping prescribed medication, and never diagnose. Encourage the patient to talk to their healthcare provider. The "What to expect" section must include a short, practical caution (potency, timing, side-effect watch-out) and a gentle nudge to start low.
- Respond with ONLY a single JSON object. No markdown, no text outside the JSON.

JSON shape (all fields required). Each body is 2-4 short paragraphs (1-2 sentences each), separated by a single "\\n\\n" so the client can render them with paragraph spacing:
{
  "sections": [
    {"heading": "Overview", "body": "2-4 short paragraphs introducing the strain"},
    {"heading": "What it might do for you", "body": "2-4 short paragraphs honestly rating each of the patient's ailments against the strain, with mismatches called out plainly, and calibrated to medications + recent history with other strains"},
    {"heading": "What to expect", "body": "2-4 short paragraphs on practical considerations, including a caution to start low"}
  ]
}`;

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((x): x is string => typeof x === "string")
    : [];
}

const POTENCY_LABELS: Record<string, string> = {
  mild: "mild (THC under roughly 15%)",
  balanced: "balanced (THC roughly 15-22%)",
  strong: "strong (THC above roughly 22%)",
};

type ResearchPrefs = {
  timeOfDay?: string;
  consumeForm?: string;
  thcSensitivity?: string;
  medications?: string;
  ownedStrains?: string[];
  patientNote?: string;
  reliefSummary?: string;
};

function parsePrefs(raw: unknown): ResearchPrefs | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const p = raw as Record<string, unknown>;
  const timeOfDay =
    p.timeOfDay === "morning" ||
    p.timeOfDay === "afternoon" ||
    p.timeOfDay === "night"
      ? p.timeOfDay
      : undefined;
  const consumeForm =
    p.consumeForm === "flower" ||
    p.consumeForm === "cart" ||
    p.consumeForm === "edible" ||
    p.consumeForm === "tincture"
      ? p.consumeForm
      : undefined;
  const thcSensitivity =
    p.thcSensitivity === "anxious-high-thc" ||
    p.thcSensitivity === "experienced"
      ? p.thcSensitivity
      : undefined;
  const medications =
    typeof p.medications === "string" && p.medications.trim()
      ? p.medications.trim().slice(0, 240)
      : undefined;
  const ownedStrains = asStringArray(p.ownedStrains)
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .slice(0, 8);
  const patientNote =
    typeof p.patientNote === "string" && p.patientNote.trim()
      ? p.patientNote.trim().slice(0, 400)
      : undefined;
  const reliefSummary =
    typeof p.reliefSummary === "string" && p.reliefSummary.trim()
      ? p.reliefSummary.trim().slice(0, 800)
      : undefined;
  if (
    !timeOfDay &&
    !consumeForm &&
    !thcSensitivity &&
    !medications &&
    ownedStrains.length === 0 &&
    !patientNote &&
    !reliefSummary
  ) {
    return undefined;
  }
  return {
    timeOfDay,
    consumeForm,
    thcSensitivity,
    medications,
    ownedStrains: ownedStrains.length > 0 ? ownedStrains : undefined,
    patientNote,
    reliefSummary,
  };
}

function prefsBlock(prefs: ResearchPrefs | undefined): string {
  if (!prefs) return "";
  const lines = ["Patient context:"];
  if (prefs.timeOfDay) lines.push(`- Time of use: ${prefs.timeOfDay}`);
  if (prefs.consumeForm) lines.push(`- Form they will use: ${prefs.consumeForm}`);
  if (prefs.thcSensitivity === "anxious-high-thc") {
    lines.push(
      "- THC-sensitive: high-THC sativas often worsen their anxiety. Prefer gentler, more balanced options.",
    );
  } else if (prefs.thcSensitivity === "experienced") {
    lines.push("- Experienced with stronger flower; potency can run higher.");
  }
  if (prefs.medications) {
    lines.push(
      `- They take: ${prefs.medications}. Do not advise stopping medication. Include a caution to check interactions with their clinician.`,
    );
  }
  if (prefs.ownedStrains && prefs.ownedStrains.length > 0) {
    lines.push(
      `- They already have: ${prefs.ownedStrains.join(", ")}. Weigh those as convenient options when they fit.`,
    );
  }
  if (prefs.patientNote) {
    lines.push(
      `- In their own words (treat as primary intent): "${prefs.patientNote}"`,
    );
  }
  if (prefs.reliefSummary) {
    lines.push(
      `- What actually happened last time (weight this heavily): ${prefs.reliefSummary}`,
    );
  }
  return lines.join("\n");
}

export function compareStrainPayload(s: StrainProfile) {
  const hasBody = Boolean(
    s.inKnowledgeBase ||
      s.type ||
      s.thcRange ||
      s.description ||
      (s.effects && s.effects.length > 0) ||
      (s.communityNotes && s.communityNotes.length > 0),
  );
  if (!hasBody) return { name: s.name, noCuratedProfile: true as const };
  return {
    name: s.name,
    type: s.type,
    thcRange: s.thcRange,
    cbdRange: s.cbdRange,
    terpenes: s.terpenes,
    medicalUses: s.medicalUses,
    effects: s.effects,
    description: s.description,
    communityNotes: s.communityNotes,
    noCuratedProfile: !s.inKnowledgeBase,
  };
}

function comparePrompt(
  strains: StrainProfile[],
  conditions: string[] | undefined,
  prefs?: ResearchPrefs,
): string {
  const payload = strains.map(compareStrainPayload);
  // Filter the Reddit seed list to threads relevant to this patient's
  // condition focus + the strains in play. The full pool (~45 entries)
  // blows past Groq's on-demand TPM budget; 8 vetted, ranked threads
  // is plenty since the model only picks 1-3 anyway.
  const redditSeeds = matchRedditSeeds({
    conditions: conditions ?? [],
    strainNames: strains.map((s) => s.name),
    limit: 8,
  });
  return [
    "Compare the following cannabis strains for a patient deciding which one to try.",
    `Condition focus: ${
      conditions && conditions.length > 0
        ? conditions.join(", ")
        : "none — give a general comparison focused on patient symptom relief"
    }`,
    prefsBlock(prefs),
    "",
    "Strain data (Leafly + Weedmaps, with Reddit quotes when found):",
    JSON.stringify(payload, null, 2),
    "",
    'Strains marked "noCuratedProfile": true were not found on Leafly or Weedmaps. Research them from your knowledge of how they are commonly described on Leafly, Weedmaps, Reddit, Google, and dispensary menus, and be explicit in the summary when a detail is a commonly-reported figure rather than a verified lab result.',
    "",
    "Vetted Reddit threads (pick from this list only — copy url / subreddit / title verbatim):",
    JSON.stringify(redditSeeds, null, 2),
    "",
    "Return only the JSON object described in your instructions.",
  ].join("\n");
}

function recommendPrompt(
  strains: StrainProfile[],
  conditions: string[],
  potency: string | undefined,
  prefs?: ResearchPrefs,
): string {
  const payload = strains.map((s) => ({
    name: s.name,
    type: s.type,
    thcRange: s.thcRange,
    cbdRange: s.cbdRange,
    terpenes: s.terpenes,
    medicalUses: s.medicalUses,
    effects: s.effects,
    description: s.description,
  }));
  // Filter the Reddit seed list to threads relevant to this patient's
  // symptoms + the popular strains in play. Same TPM-budget reason as
  // comparePrompt above.
  const redditSeeds = matchRedditSeeds({
    conditions,
    strainNames: strains.map((s) => s.name),
    limit: 8,
  });
  return [
    "Recommend the best cannabis strains for a patient treating these symptoms:",
    conditions.join(", "),
    potency
      ? `Potency preference: ${POTENCY_LABELS[potency]}.`
      : "Potency preference: none — pick whatever potency fits the symptoms best.",
    prefsBlock(prefs),
    "",
    "Strain data (full Leafly profiles — type, potency, medical uses, effects, reviews):",
    JSON.stringify(payload, null, 2),
    "",
    "You may also suggest strains not in this list from your general knowledge, as long as you are confident they are real and commonly reported for these symptoms.",
    "",
    "Vetted Reddit threads (pick from this list only — copy url / subreddit / title verbatim):",
    JSON.stringify(redditSeeds, null, 2),
    "",
    "Return only the JSON object described in your instructions.",
  ].join("\n");
}

function normalizeRedditSources(value: unknown): RedditSource[] {
  if (!Array.isArray(value)) return [];
  // Only accept URLs in the vetted old.reddit.com form. Anything else is
  // dropped silently — we never want to surface a hallucinated Reddit link.
  const allowedUrl = /^https:\/\/old\.reddit\.com\/r\/[^/]+\/comments\/[a-z0-9]{4,}\//i;
  const seen = new Set<string>();
  const out: RedditSource[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const url = typeof r.url === "string" ? r.url.trim() : "";
    const subreddit = typeof r.subreddit === "string" ? r.subreddit.trim() : "";
    const title = typeof r.title === "string" ? r.title.trim() : "";
    if (!url || !subreddit || !title) continue;
    // Strip reddit.com / www.reddit.com → old.reddit.com so links open cleanly.
    const normalizedUrl = url
      .replace(/^https?:\/\/(www\.)?reddit\.com/, "https://old.reddit.com")
      .replace(/^https?:\/\/np\.reddit\.com/, "https://old.reddit.com");
    if (!allowedUrl.test(normalizedUrl)) continue;
    const key = normalizedUrl.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      url: normalizedUrl,
      subreddit,
      title,
      snippet: typeof r.snippet === "string" ? r.snippet.trim() : undefined,
      score:
        typeof r.score === "number" && Number.isFinite(r.score)
          ? r.score
          : undefined,
    });
    if (out.length >= 8) break;
  }
  return out;
}

function parseAnalysis(content: string): StrainAnalysis {
  const fallback: StrainAnalysis = {
    headline: "Comparison complete",
    summary: content.trim(),
    forCondition: null,
    keyDifferences: [],
    commonGround: [],
    cautions: [],
  };
  if (!content) return fallback;
  const parsed = extractJsonObject(content);
  if (parsed === null) return fallback;

  const p = (parsed ?? {}) as Record<string, unknown>;
  const asStrings = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((x): x is string => typeof x === "string")
      : [];
  const forConditionRaw = p.forCondition as
    | Record<string, unknown>
    | null
    | undefined;

  const redditSources = normalizeRedditSources(p.redditSources);
  return {
    headline:
      typeof p.headline === "string" && p.headline.trim()
        ? p.headline.trim()
        : fallback.headline,
    summary:
      typeof p.summary === "string" && p.summary.trim()
        ? p.summary.trim()
        : fallback.summary,
    forCondition:
      forConditionRaw &&
      typeof forConditionRaw.best === "string" &&
      typeof forConditionRaw.why === "string"
        ? {
            best: forConditionRaw.best,
            why: forConditionRaw.why,
            runnerUp:
              typeof forConditionRaw.runnerUp === "string"
                ? forConditionRaw.runnerUp
                : "",
          }
        : null,
    keyDifferences: asStrings(p.keyDifferences),
    commonGround: asStrings(p.commonGround),
    cautions: asStrings(p.cautions),
    redditSources: redditSources.length > 0 ? redditSources : undefined,
  };
}

function normalizeRecommendations(value: unknown): StrainRecommendation[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: StrainRecommendation[] = [];
  for (const item of value) {
    const r = (item ?? {}) as Record<string, unknown>;
    const name = typeof r.strainName === "string" ? r.strainName.trim() : "";
    if (name === "") continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      strainName: name,
      reason: typeof r.reason === "string" ? r.reason.trim() : "",
      bestFor: typeof r.bestFor === "string" ? r.bestFor.trim() : "",
      caution: typeof r.caution === "string" ? r.caution.trim() : "",
    });
  }
  return out.slice(0, 6);
}

/**
 * Compare 2-3 strains side by side. Auth required: the caller must be signed
 * in (request.auth is populated by Firebase from the client's ID token).
 */
export const compareStrains = onCall(
  AI_OPTIONS,
  async (request): Promise<StrainComparison & { resultId?: string }> => {
    if (!request.auth) {
      try {
        guestRateLimit(clientIp(request));
      } catch (err) {
        throw new HttpsError(
          "resource-exhausted",
          err instanceof Error ? err.message : "Too many guest searches.",
        );
      }
    }

    const data = (request.data ?? {}) as {
      strainNames?: unknown;
      condition?: unknown;
      prefs?: unknown;
      language?: unknown;
    };
    const names = asStringArray(data.strainNames);
    if (names.length < 2 || names.length > 3) {
      throw new HttpsError("invalid-argument", "Select 2–3 strains to compare.");
    }
    const condition = asStringArray(data.condition);
    const prefs = parsePrefs(data.prefs);
    const language = parseOutputLanguage(data.language);

    // Full profiles: Leafly + Weedmaps, Reddit quotes for the ailments,
    // and Groq fill-in when a name is missing from both catalogs.
    const strains = await enrichProfiles(
      names,
      condition,
      GROQ_API_KEY.value(),
    );

    const content = await callGroq(GROQ_API_KEY.value(), [
      {
        role: "system",
        content: withLanguageClause(COMPARE_SYSTEM_PROMPT, language),
      },
      { role: "user", content: comparePrompt(strains, condition, prefs) },
    ]);

    const analysis = parseAnalysis(content);
    const payload = { strains, analysis };
    let resultId: string | undefined;
    try {
      resultId = await persistResult({
        kind: "compare",
        args: { strainNames: names, condition, prefs },
        result: payload,
        uid: request.auth?.uid ?? null,
      });
    } catch {
      // Persistence is best-effort — the comparison still returns.
    }
    return { ...payload, resultId };
  },
);

/**
 * Find the best strains for a patient's symptoms. Auth required.
 */
export const recommendStrainsForConditions = onCall(
  AI_OPTIONS,
  async (request): Promise<RecommendationResult & { resultId?: string }> => {
    if (!request.auth) {
      try {
        guestRateLimit(clientIp(request));
      } catch (err) {
        throw new HttpsError(
          "resource-exhausted",
          err instanceof Error ? err.message : "Too many guest searches.",
        );
      }
    }

    const data = (request.data ?? {}) as {
      conditions?: unknown;
      potency?: unknown;
      prefs?: unknown;
      language?: unknown;
    };
    const conditions = asStringArray(data.conditions);
    if (conditions.length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "Tell us at least one symptom or condition to search for.",
      );
    }
    const potencyRaw = data.potency;
    const potency =
      potencyRaw === "mild" || potencyRaw === "balanced" || potencyRaw === "strong"
        ? potencyRaw
        : undefined;
    const prefs = parsePrefs(data.prefs);
    const language = parseOutputLanguage(data.language);

    // Rank against full Leafly detail profiles (not the popular-list
    // summaries) so medical uses, CBD, lineage and side effects are present.
    const popular = await fetchPopular();
    const detailed = await fetchProfiles(popular.map((p) => p.name));

    const content = await callGroq(GROQ_API_KEY.value(), [
      {
        role: "system",
        content: withLanguageClause(RECOMMEND_SYSTEM_PROMPT, language),
      },
      {
        role: "user",
        content: recommendPrompt(detailed, conditions, potency, prefs),
      },
    ]);

    const parsed = extractJsonObject(content);
    const p = (parsed ?? {}) as Record<string, unknown>;
    const recommendations = normalizeRecommendations(p.recommendations);
    if (recommendations.length === 0) {
      throw new HttpsError(
        "internal",
        "The research service did not return usable recommendations. Please try again.",
      );
    }

    const names = [...new Set(recommendations.map((r) => r.strainName))];
    const strains = await enrichProfiles(
      names,
      conditions,
      GROQ_API_KEY.value(),
    );

    const payload: import("./types").RecommendationResult = {
      headline:
        typeof p.headline === "string" && p.headline.trim()
          ? p.headline.trim()
          : "Here are the best matches for you",
      summary:
        typeof p.summary === "string" && p.summary.trim()
          ? p.summary.trim()
          : "No summary returned.",
      recommendations,
      strains,
    };
    const redditSources = normalizeRedditSources(p.redditSources);
    if (redditSources.length > 0) {
      payload.redditSources = redditSources;
    }
    let resultId: string | undefined;
    try {
      resultId = await persistResult({
        kind: "find",
        args: { conditions, potency, prefs },
        result: payload,
        uid: request.auth?.uid ?? null,
      });
    } catch {
      // Persistence is best-effort — the recommendation still returns.
    }
    return { ...payload, resultId };
  },
);

/* ── Image proxy (public, no auth) ────────────────────────────────────── */

/**
 * Cache + serve a strain image. The function fetches the upstream
 * bytes once via cachedFetchImage (in-memory then Storage), then
 * returns a signed URL pointing at the cached object so the browser
 * can fetch it directly with normal HTTP caching. Repeat calls within
 * the 7-day TTL hit the Storage copy without re-touching Leafly.
 */
export const cachedStrainImage = onCall(
  { timeoutSeconds: 30, memory: "256MiB" },
  async (request): Promise<{
    url: string;
    contentType: string;
    bytes: number;
    source: "memory" | "storage" | "network";
  }> => {
    const url =
      typeof request.data?.url === "string" ? request.data.url : "";
    if (!/^https?:\/\//i.test(url)) {
      throw new HttpsError("invalid-argument", "url must be an absolute http(s) URL.");
    }
    const cached = await cachedFetchImage(url);
    const key = imageCacheKey(url);
    // Generate a long-lived signed URL for the Storage copy so the
    // browser caches the image across visits without a callable round-trip.
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const [signedUrl] = await getStorage()
      .bucket()
      .file(`strain-images/${key}`)
      .getSignedUrl({
        action: "read",
        expires: expiresAt,
      });
    return {
      url: signedUrl,
      contentType: cached.contentType,
      bytes: cached.bytes.length,
      source: cached.source,
    };
  },
);

/**
 * Look up medical-marijuana doctors near the patient. Scrapes Leafly's
 * public doctors directory (the page embedded `__NEXT_DATA__` blob
 * carries the structured listings) and reverse-geocodes the caller's
 * coordinates via OpenStreetMap Nominatim when only lat/lon is given.
 * Public — no auth required.
 */
export const findDoctors = onCall(
  { timeoutSeconds: 30, memory: "256MiB" },
  async (request): Promise<DoctorResult> => {
    const data = (request.data ?? {}) as Partial<DoctorQuery>;
    const lat =
      typeof data.lat === "number" && Number.isFinite(data.lat) ? data.lat : undefined;
    const lon =
      typeof data.lon === "number" && Number.isFinite(data.lon) ? data.lon : undefined;
    const city = typeof data.city === "string" ? data.city.trim() : undefined;
    const state = typeof data.state === "string" ? data.state.trim() : undefined;
    const zip = typeof data.zip === "string" ? data.zip.trim() : undefined;
    const radiusMiles =
      typeof data.radiusMiles === "number" && Number.isFinite(data.radiusMiles)
        ? Math.max(1, Math.min(data.radiusMiles, 200))
        : undefined;

    if (!lat && !lon && !city && !state && !zip) {
      throw new HttpsError(
        "invalid-argument",
        "Provide lat/lon, a city+state pair, or a zip code.",
      );
    }

    return await findDoctorsImpl({ lat, lon, city, state, zip, radiusMiles });
  },
);

/* ── Patient-tailored per-strain description (auth-gated) ──────────── */

/** Section shape returned by describeStrainForUser. */
type StrainDescriptionSection = {
  heading: string;
  body: string;
};

/** Response shape for describeStrainForUser. */
type StrainDescriptionResult = {
  /** Always exactly three sections, in display order. */
  sections: [StrainDescriptionSection, StrainDescriptionSection, StrainDescriptionSection];
};

/**
 * Build a compact, LLM-safe payload from a StrainProfile. Mirrors
 * compareStrainPayload but strips the fields the description prompt
 * does not need (communityNotes, redditSources) to keep the user
 * message tight.
 */
export function describeStrainPayload(s: StrainProfile) {
  const hasBody = Boolean(
    s.inKnowledgeBase ||
      s.type ||
      s.thcRange ||
      s.description ||
      (s.effects && s.effects.length > 0) ||
      (s.medicalUses && s.medicalUses.length > 0),
  );
  if (!hasBody) return { name: s.name, noCuratedProfile: true as const };
  return {
    name: s.name,
    type: s.type,
    thcRange: s.thcRange,
    cbdRange: s.cbdRange,
    lineage: s.lineage,
    terpenes: s.terpenes,
    medicalUses: s.medicalUses,
    effects: s.effects,
    sideEffects: s.sideEffects,
    description: s.description,
    noCuratedProfile: !s.inKnowledgeBase,
  };
}

export function describePrompt(
  strain: StrainProfile,
  ailments: string[],
  medications: string[],
  reliefHistory: string,
): string {
  const payload = describeStrainPayload(strain);
  const contextLines: string[] = [];
  contextLines.push(
    ailments.length > 0
      ? `Patient's saved ailments (tailor the middle section to these, in this priority order): ${ailments.join(", ")}`
      : "Patient's saved ailments: none — give a general description across all three sections.",
  );
  contextLines.push(
    medications.length > 0
      ? `Patient's current medications (mention a specific drug only when there is a commonly cited cannabis interaction — always phrase as "ask your clinician about combining with X", never advise stopping): ${medications.join(", ")}`
      : "Patient's current medications: none reported.",
  );
  contextLines.push(
    reliefHistory.length > 0
      ? `Patient's recent relief log with other strains, newest first (use to calibrate the middle section against what has actually worked): ${reliefHistory}`
      : "Patient's recent relief log: empty.",
  );
  return [
    "Write a patient-facing description for this cannabis strain.",
    ...contextLines,
    "",
    "Strain data:",
    JSON.stringify(payload, null, 2),
    "",
    'Strains marked "noCuratedProfile": true were not found on Leafly or Weedmaps. Research them from your knowledge of how they are commonly described on Leafly, Weedmaps, Reddit, Google, and dispensary menus, and be explicit in the "Overview" when a detail is a commonly-reported figure rather than a verified lab result.',
    "",
    "Return only the JSON object described in your instructions.",
  ].join("\n");
}

/**
 * Validate the LLM's JSON shape. We always want exactly three sections,
 * with non-empty headings and bodies. If the model returns fewer, fill
 * in the missing ones with a generic safe placeholder so the client
 * still has something to render instead of breaking layout.
 */
function normalizeDescriptionSections(
  value: unknown,
  fallbackName: string,
): [StrainDescriptionSection, StrainDescriptionSection, StrainDescriptionSection] {
  const list: StrainDescriptionSection[] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!item || typeof item !== "object") continue;
      const r = item as Record<string, unknown>;
      const heading =
        typeof r.heading === "string" ? r.heading.trim() : "";
      const body = typeof r.body === "string" ? r.body.trim() : "";
      if (!heading || !body) continue;
      list.push({ heading, body });
    }
  }
  const filler = (heading: string, body: string): StrainDescriptionSection => ({
    heading,
    body,
  });
  const overview = list[0] ?? filler("Overview", `${fallbackName} is a cannabis strain. Talk to your healthcare provider before trying it, and start with a low dose.`);
  const tailored =
    list[1] ??
    filler(
      "What it might do for you",
      "We didn't get a tailored writeup for your saved symptoms. Compare it against other strains in your list for a closer fit.",
    );
  const expect =
    list[2] ??
    filler(
      "What to expect",
      "Start low, give the dose time to settle, and check in with how you feel before taking more.",
    );
  return [overview, tailored, expect];
}

function parseDescription(
  content: string,
  fallbackName: string,
): StrainDescriptionResult {
  const parsed = extractJsonObject(content) as { sections?: unknown } | null;
  return {
    sections: normalizeDescriptionSections(parsed?.sections, fallbackName),
  };
}

/**
 * Default language every AI-written response is rendered in. We pin this
 * on the model so the output stays in the user's chosen language and
 * does not drift into another language (e.g. random Chinese for strains
 * with international names). Clients can override by passing a
 * `language` field to the request, e.g. "Spanish" or "Japanese".
 */
const DEFAULT_OUTPUT_LANGUAGE = "English";

/**
 * Sanitize a `language` request field. We accept a short human-readable
 * language name (e.g. "English", "Spanish", "Japanese") and reject
 * anything that smells like prompt-injection: long strings, newlines,
 * or non-letters. We deliberately keep the regex narrow so a malicious
 * caller can't sneak instructions into the system prompt.
 */
function parseOutputLanguage(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_OUTPUT_LANGUAGE;
  const trimmed = value.trim();
  if (trimmed === "") return DEFAULT_OUTPUT_LANGUAGE;
  if (trimmed.length > 40) return DEFAULT_OUTPUT_LANGUAGE;
  if (/[\r\n]/.test(trimmed)) return DEFAULT_OUTPUT_LANGUAGE;
  // Letters, spaces, hyphens, parentheses only — no quotes, `<`, `:`.
  if (!/^[\p{L} ()'-]+$/u.test(trimmed)) return DEFAULT_OUTPUT_LANGUAGE;
  return trimmed;
}

/**
 * Append a pinned-language clause to a system prompt. The clause tells
 * the model to write the entire response in the user's language and
 * not switch into any other language (we have seen random Chinese and
 * Korean show up for strains with international names).
 */
function withLanguageClause(base: string, language: string): string {
  return (
    `${base}\n\n` +
    `Language pinning (do not skip):\n` +
    `- Write the entire response in ${language}. Do not switch into any other language, even briefly, even for proper nouns, examples, or strain names that originated in another language. Transliterate or translate foreign-language quotes instead of copying them verbatim.`
  );
}

/** Exposed for tests. */
export const __testing = {
  normalizeDescriptionSections,
  DESCRIBE_SYSTEM_PROMPT,
  parseOutputLanguage,
  withLanguageClause,
};

/**
 * Generate a tailored, three-section description for a single strain.
 * Auth-gated: the caller must be signed in so we can pull their saved
 * ailments without exposing them to guest traffic. Guests hit the
 * rate-limited fallback in `clientIp`/`guestRateLimit` instead.
 */
export const describeStrainForUser = onCall(
  AI_OPTIONS,
  async (request): Promise<StrainDescriptionResult> => {
    if (!request.auth) {
      try {
        guestRateLimit(clientIp(request));
      } catch (err) {
        throw new HttpsError(
          "resource-exhausted",
          err instanceof Error ? err.message : "Too many guest searches.",
        );
      }
    }

    const data = (request.data ?? {}) as {
      strain?: unknown;
      ailments?: unknown;
      medications?: unknown;
      reliefHistory?: unknown;
      language?: unknown;
    };
    const strain = (data.strain ?? {}) as StrainProfile;
    const name =
      typeof strain.name === "string" && strain.name.trim()
        ? strain.name.trim().slice(0, 120)
        : "";
    if (name === "") {
      throw new HttpsError("invalid-argument", "Provide a strain to describe.");
    }
    // Trim ailments to a sensible cap (matches the Firestore write cap
    // in iOS/web) so a malicious caller can't blow up the prompt.
    const ailments = asStringArray(data.ailments)
      .map((a) => a.trim())
      .filter((a) => a !== "")
      .slice(0, 16);
    // Medications come in as a string[] (one per saved med). Cap them
    // and clamp each entry so a long name can't bloat the prompt.
    const medications = asStringArray(data.medications)
      .map((m) => m.trim().slice(0, 80))
      .filter((m) => m !== "")
      .slice(0, 24);
    // Relief history is already a short prose summary on the client.
    // Trim and clamp it explicitly so a malicious caller can't pass a
    // 100k-char blob.
    const reliefHistory =
      typeof data.reliefHistory === "string"
        ? data.reliefHistory.trim().slice(0, 800)
        : "";
    const language = parseOutputLanguage(data.language);
    const safeStrain: StrainProfile = { ...strain, name };

    const content = await callGroq(GROQ_API_KEY.value(), [
      {
        role: "system",
        content: withLanguageClause(DESCRIBE_SYSTEM_PROMPT, language),
      },
      {
        role: "user",
        content: describePrompt(safeStrain, ailments, medications, reliefHistory),
      },
    ]);

    return parseDescription(content, name);
  },
);

/* ── Background jobs ──────────────────────────────────────────────── */

export { redditCacheRefresh } from "./reddit-refresh";
