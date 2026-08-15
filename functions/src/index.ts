// StrainWise backend.
//
// - popularStrains / searchStrain: public Leafly data lookups (no AI).
// - compareStrains / recommendStrainsForConditions: MiniMax AI synthesis,
//   auth-gated — Firebase callable functions automatically attach the
//   caller's ID token, and we reject calls without `request.auth`.
import { HttpsError, onCall, type CallableOptions } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { enrichProfiles, lookupProfile } from "./enrich";
import { fetchPopular, fetchProfiles } from "./leafly";
import { callMiniMax, extractJsonObject } from "./minimax";
import { clientIp, guestRateLimit, persistResult } from "./results";
import type {
  RecommendationResult,
  StrainAnalysis,
  StrainComparison,
  StrainProfile,
  StrainRecommendation,
} from "./types";

export const MINIMAX_API_KEY = defineSecret("MINIMAX_API_KEY");

const AI_OPTIONS: CallableOptions = {
  secrets: [MINIMAX_API_KEY],
  timeoutSeconds: 120,
  memory: "512MiB",
};

/* ── Public data lookups (no AI, no auth required) ─────────────────── */

/** Popular strains on Leafly right now. */
export const popularStrains = onCall(async (): Promise<StrainProfile[]> => {
  return await fetchPopular();
});

/** Look up one strain by name on Leafly, then Weedmaps. Null when neither resolves. */
export const searchStrain = onCall(
  async (request): Promise<StrainProfile | null> => {
    const name =
      typeof request.data?.name === "string" ? request.data.name : "";
    if (name.trim() === "") return null;
    return await lookupProfile(name);
  },
);

/* ── AI synthesis (auth-gated) ─────────────────────────────────────── */

const COMPARE_SYSTEM_PROMPT = `You are StrainWise, a research assistant built for medical cannabis patients. Patients come to you to choose between strains for symptom relief, so you speak directly to them — not to budtenders or enthusiasts.

Rules:
- Base every claim on the strain data provided. Never invent numbers, terpenes, effects, or uses.
- Some strains arrive WITHOUT a curated profile (marked "noCuratedProfile": true). For those, research from your own knowledge of how the strain is commonly described on Leafly, Weedmaps, Reddit, Google, and dispensary menus. Only state details you are reasonably confident are commonly reported about that strain; otherwise say "not verified" or note the uncertainty instead of guessing. If a name does not appear to be a real, known strain, say so plainly in the summary.
- communityNotes may include Leafly reviews, Weedmaps tags, and real Reddit comments about the patient's ailments. Use them. Do not invent additional first-person quotes.
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
  "cautions": ["2-4 short, practical cautions, including consulting a physician and starting with a low dose"]
}`;

const RECOMMEND_SYSTEM_PROMPT = `You are StrainWise, a strain-finding assistant built for medical cannabis patients. A patient tells you which symptoms or conditions they are treating, and you recommend the strains most commonly reported to help with those symptoms.

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
  if (
    !timeOfDay &&
    !consumeForm &&
    !thcSensitivity &&
    !medications &&
    ownedStrains.length === 0 &&
    !patientNote
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
  return lines.join("\n");
}

function comparePrompt(
  strains: StrainProfile[],
  conditions: string[] | undefined,
  prefs?: ResearchPrefs,
): string {
  const payload = strains.map((s) =>
    s.inKnowledgeBase
      ? {
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
          communityNotes: s.communityNotes,
        }
      : { name: s.name, noCuratedProfile: true },
  );
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
    lineage: s.lineage,
    terpenes: s.terpenes,
    medicalUses: s.medicalUses,
    effects: s.effects,
    sideEffects: s.sideEffects,
    description: s.description,
    communityNotes: s.communityNotes,
  }));
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
    "Return only the JSON object described in your instructions.",
  ].join("\n");
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
    };
    const names = asStringArray(data.strainNames);
    if (names.length < 2 || names.length > 3) {
      throw new HttpsError("invalid-argument", "Select 2–3 strains to compare.");
    }
    const condition = asStringArray(data.condition);
    const prefs = parsePrefs(data.prefs);

    // Full profiles: Leafly + Weedmaps, Reddit quotes for the ailments,
    // and MiniMax fill-in when a name is missing from both catalogs.
    const strains = await enrichProfiles(
      names,
      condition,
      MINIMAX_API_KEY.value(),
    );

    const content = await callMiniMax(MINIMAX_API_KEY.value(), [
      { role: "system", content: COMPARE_SYSTEM_PROMPT },
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

    // Rank against full Leafly detail profiles (not the popular-list
    // summaries) so medical uses, CBD, lineage and side effects are present.
    const popular = await fetchPopular();
    const detailed = await fetchProfiles(popular.map((p) => p.name));

    const content = await callMiniMax(MINIMAX_API_KEY.value(), [
      { role: "system", content: RECOMMEND_SYSTEM_PROMPT },
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
      MINIMAX_API_KEY.value(),
    );

    const payload = {
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
