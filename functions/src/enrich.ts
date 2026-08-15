// Merge Leafly + Weedmaps into one StrainProfile, attach Reddit quotes
// for the patient's ailments, and ask MiniMax to fill any fields still
// missing — the same shape the old curated knowledge base carried.
import { fetchLeaflyReviews, fetchProfile } from "./leafly";
import { callMiniMax, extractJsonObject } from "./minimax";
import { fetchRedditQuotesFor } from "./reddit";
import type {
  CommunityNote,
  CommunityNoteKind,
  StrainProfile,
  StrainType,
} from "./types";
import { fetchWeedmapsProfile } from "./weedmaps";

const AILMENT_ALIASES: Record<string, string[]> = {
  insomnia: ["insomnia", "sleep", "asleep", "sleeping"],
  anxiety: ["anxiety", "anxious", "panic"],
  "chronic pain": ["chronic pain", "pain", "ache"],
  depression: ["depression", "depressed", "mood"],
  "nausea & appetite": ["nausea", "appetite", "nauseous"],
  inflammation: ["inflammation", "inflamed"],
  migraine: ["migraine", "headache"],
  "muscle spasm": ["spasm", "spasms", "cramp"],
  ptsd: ["ptsd", "flashback", "trauma"],
  fatigue: ["fatigue", "tired", "exhausted"],
  arthritis: ["arthritis", "joint"],
  stress: ["stress", "stressed"],
};

function expandAilment(condition: string): string[] {
  const key = condition.trim().toLowerCase();
  return AILMENT_ALIASES[key] ?? [key];
}

function mentionsAilment(text: string, conditions: string[]): boolean {
  if (conditions.length === 0) return false;
  const t = text.toLowerCase();
  return conditions.some((c) =>
    expandAilment(c).some((alias) => t.includes(alias)),
  );
}

/** Derive a `kind` from the human-readable `source` string. */
function kindFromSource(source: string): CommunityNoteKind {
  const s = source.toLowerCase();
  if (s.includes("leafly")) return "leafly";
  if (s.includes("weedmaps")) return "weedmaps";
  if (s.includes("reddit")) return "reddit";
  return "other";
}

function reTag(notes: CommunityNote[]): CommunityNote[] {
  return notes.map((n) =>
    n.kind ? n : { ...n, kind: kindFromSource(n.source) },
  );
}

function uniqueNotes(notes: CommunityNote[]): CommunityNote[] {
  const seen = new Set<string>();
  const out: CommunityNote[] = [];
  for (const note of notes) {
    const key = `${note.source}|${note.text.slice(0, 80)}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(note);
  }
  return out;
}

function preferAilmentNotes(
  notes: CommunityNote[],
  conditions: string[],
): CommunityNote[] {
  if (conditions.length === 0 || notes.length === 0) return notes;
  const matched = notes.filter((n) => mentionsAilment(n.text, conditions));
  const rest = notes.filter((n) => !mentionsAilment(n.text, conditions));
  // Bucket non-matching notes so Reddit quotes never get lost below the 8-item
  // cap when ailment-matching notes dominate.
  const rating = rest.filter((n) => (n.kind ?? kindFromSource(n.source)) === "leafly");
  const reddit = rest.filter((n) => (n.kind ?? kindFromSource(n.source)) === "reddit");
  const other = rest.filter(
    (n) => {
      const k = n.kind ?? kindFromSource(n.source);
      return k !== "leafly" && k !== "reddit";
    },
  );
  return [...rating, ...reddit, ...matched, ...other].slice(0, 8);
}

function unionStrings(a?: string[], b?: string[]): string[] | undefined {
  const out: string[] = [];
  for (const list of [a, b]) {
    for (const item of list ?? []) {
      if (item && !out.some((x) => x.toLowerCase() === item.toLowerCase())) {
        out.push(item);
      }
    }
  }
  return out.length > 0 ? out : undefined;
}

export function mergeProfiles(
  name: string,
  leafly: StrainProfile | null,
  weedmaps: StrainProfile | null,
): StrainProfile {
  if (!leafly && !weedmaps) {
    return { name, inKnowledgeBase: false };
  }
  const primary = leafly ?? weedmaps!;
  const secondary = leafly ? weedmaps : null;
  return {
    name,
    inKnowledgeBase: true,
    type: primary.type ?? secondary?.type,
    thcRange: primary.thcRange ?? secondary?.thcRange,
    cbdRange: primary.cbdRange ?? secondary?.cbdRange,
    lineage: primary.lineage ?? secondary?.lineage,
    terpenes:
      primary.terpenes && primary.terpenes.length > 0
        ? primary.terpenes
        : secondary?.terpenes,
    medicalUses: unionStrings(primary.medicalUses, secondary?.medicalUses),
    effects:
      primary.effects && primary.effects.length > 0
        ? primary.effects
        : secondary?.effects,
    sideEffects: unionStrings(primary.sideEffects, secondary?.sideEffects),
    description: primary.description ?? secondary?.description,
    communityNotes: reTag(
      uniqueNotes([
        ...(primary.communityNotes ?? []),
        ...(secondary?.communityNotes ?? []),
      ]),
    ),
  };
}

function needsResearch(profile: StrainProfile): boolean {
  return (
    !profile.inKnowledgeBase ||
    (!profile.type && !profile.description && !profile.thcRange)
  );
}

function asStrainType(value: unknown): StrainType | undefined {
  return value === "indica" || value === "sativa" || value === "hybrid"
    ? value
    : undefined;
}

function asNotes(value: unknown): CommunityNote[] {
  if (!Array.isArray(value)) return [];
  const out: CommunityNote[] = [];
  for (const item of value) {
    const n = (item ?? {}) as Record<string, unknown>;
    const source = typeof n.source === "string" ? n.source.trim() : "";
    const text = typeof n.text === "string" ? n.text.trim() : "";
    if (!source || !text) continue;
    out.push({ source, text });
  }
  return out;
}

function asTerpenes(
  value: unknown,
): StrainProfile["terpenes"] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: { name: string; profile: string }[] = [];
  for (const item of value) {
    const t = (item ?? {}) as Record<string, unknown>;
    const name = typeof t.name === "string" ? t.name.trim() : "";
    if (!name) continue;
    out.push({
      name,
      profile: typeof t.profile === "string" ? t.profile.trim() : "",
    });
  }
  return out.length > 0 ? out.slice(0, 4) : undefined;
}

function asEffects(value: unknown): StrainProfile["effects"] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: { name: string; intensity: number }[] = [];
  for (const item of value) {
    const e = (item ?? {}) as Record<string, unknown>;
    const name = typeof e.name === "string" ? e.name.trim() : "";
    if (!name) continue;
    const intensity =
      typeof e.intensity === "number" && Number.isFinite(e.intensity)
        ? Math.max(1, Math.min(5, Math.round(e.intensity)))
        : 3;
    out.push({ name, intensity });
  }
  return out.length > 0 ? out.slice(0, 5) : undefined;
}

function asStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  return out.length > 0 ? out : undefined;
}

const RESEARCH_SYSTEM = `You are StrainEase. Fill in a cannabis strain profile using only commonly reported public information (Leafly, Weedmaps, Reddit, dispensary menus).

Rules:
- Return ONLY a JSON object. No markdown.
- Only include fields you are reasonably confident about. Omit anything unverified.
- Never invent lab numbers. Ranges should be commonly reported figures, phrased like "17–23%" or "~20%".
- communityNotes must be paraphrases of commonly reported patient comments, not fabricated first-person quotes. Prefer notes tied to the patient's conditions when those are given.
- If a name does not appear to be a real, known strain, return { "name": "...", "unknown": true }.

JSON shape:
{
  "profiles": [
    {
      "name": "string",
      "type": "indica" | "sativa" | "hybrid",
      "thcRange": "string",
      "cbdRange": "string",
      "lineage": "string",
      "terpenes": [{"name":"string","profile":"string"}],
      "medicalUses": ["string"],
      "effects": [{"name":"string","intensity":1}],
      "sideEffects": ["string"],
      "description": "string",
      "communityNotes": [{"source":"string","text":"string"}],
      "unknown": false
    }
  ]
}`;

async function researchMissing(
  profiles: StrainProfile[],
  conditions: string[],
  apiKey: string,
): Promise<Map<string, StrainProfile>> {
  const missing = profiles.filter(needsResearch);
  const map = new Map<string, StrainProfile>();
  if (missing.length === 0) return map;

  const content = await callMiniMax(apiKey, [
    { role: "system", content: RESEARCH_SYSTEM },
    {
      role: "user",
      content: [
        "Research these strain names and fill the profile fields.",
        conditions.length > 0
          ? `Patient condition focus: ${conditions.join(", ")}`
          : "No condition focus.",
        "",
        JSON.stringify(
          missing.map((s) => s.name),
          null,
          2,
        ),
      ].join("\n"),
    },
  ]);

  const parsed = extractJsonObject(content) as
    | { profiles?: unknown }
    | null;
  const list = Array.isArray(parsed?.profiles) ? parsed.profiles : [];
  for (const item of list) {
    const r = (item ?? {}) as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (!name || r.unknown === true) continue;
    map.set(name.toLowerCase(), {
      name,
      inKnowledgeBase: false,
      type: asStrainType(r.type),
      thcRange: typeof r.thcRange === "string" ? r.thcRange : undefined,
      cbdRange: typeof r.cbdRange === "string" ? r.cbdRange : undefined,
      lineage: typeof r.lineage === "string" ? r.lineage : undefined,
      terpenes: asTerpenes(r.terpenes),
      medicalUses: asStringList(r.medicalUses),
      effects: asEffects(r.effects),
      sideEffects: asStringList(r.sideEffects),
      description:
        typeof r.description === "string" ? r.description : undefined,
      communityNotes: asNotes(r.communityNotes),
    });
  }
  return map;
}

function applyResearch(
  base: StrainProfile,
  researched: StrainProfile | undefined,
): StrainProfile {
  if (!researched) return base;
  return {
    name: base.name,
    inKnowledgeBase: base.inKnowledgeBase,
    type: base.type ?? researched.type,
    thcRange: base.thcRange ?? researched.thcRange,
    cbdRange: base.cbdRange ?? researched.cbdRange,
    lineage: base.lineage ?? researched.lineage,
    terpenes:
      base.terpenes && base.terpenes.length > 0
        ? base.terpenes
        : researched.terpenes,
    medicalUses: unionStrings(base.medicalUses, researched.medicalUses),
    effects:
      base.effects && base.effects.length > 0
        ? base.effects
        : researched.effects,
    sideEffects: unionStrings(base.sideEffects, researched.sideEffects),
    description: base.description ?? researched.description,
    communityNotes: reTag(
      uniqueNotes([
        ...(base.communityNotes ?? []),
        ...(researched.communityNotes ?? []),
      ]),
    ),
  };
}

export async function enrichProfiles(
  names: string[],
  conditions: string[] = [],
  apiKey?: string,
): Promise<StrainProfile[]> {
  const unique = [
    ...new Set(names.map((n) => n.trim()).filter((n) => n !== "")),
  ];
  if (unique.length === 0) return [];

  const [leaflyList, weedmapsList, redditMap] = await Promise.all([
    Promise.all(unique.map(fetchProfile)),
    Promise.all(unique.map(fetchWeedmapsProfile)),
    fetchRedditQuotesFor(unique, conditions),
  ]);

  let merged = unique.map((name, i) =>
    mergeProfiles(name, leaflyList[i], weedmapsList[i]),
  );

  // Extra Leafly reviews when we have an ailment to match against.
  if (conditions.length > 0) {
    const extraReviews = await Promise.all(
      unique.map((name, i) =>
        leaflyList[i] ? fetchLeaflyReviews(name) : Promise.resolve([]),
      ),
    );
    merged = merged.map((profile, i) => ({
      ...profile,
      communityNotes: uniqueNotes([
        ...(profile.communityNotes ?? []),
        ...extraReviews[i],
      ]),
    }));
  }

  if (apiKey && merged.some(needsResearch)) {
    try {
      const researched = await researchMissing(merged, conditions, apiKey);
      merged = merged.map((p) =>
        applyResearch(p, researched.get(p.name.toLowerCase())),
      );
    } catch {
      // Synthesis can still run on whatever we have.
    }
  }

  return merged.map((profile, i) => {
    const reddit = redditNotesFor(redditMap, unique[i], profile.name);
    return {
      ...profile,
      communityNotes: preferAilmentNotes(
        reTag(uniqueNotes([...(profile.communityNotes ?? []), ...reddit])),
        conditions,
      ),
    };
  });
}

/** Quotes are fetched under the query name; catalogs may rename the profile. */
export function redditNotesFor(
  redditMap: Map<string, { source: string; text: string }[]>,
  queryName: string,
  profileName: string,
) {
  return (
    redditMap.get(queryName.toLowerCase()) ??
    redditMap.get(profileName.toLowerCase()) ??
    []
  );
}

/** Single-name lookup for search: Leafly + Weedmaps, no AI, no Reddit. */
export async function lookupProfile(
  name: string,
): Promise<StrainProfile | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const [leafly, weedmaps] = await Promise.all([
    fetchProfile(trimmed),
    fetchWeedmapsProfile(trimmed),
  ]);
  if (!leafly && !weedmaps) return null;
  return mergeProfiles(trimmed, leafly, weedmaps);
}
