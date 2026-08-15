import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import type { ResearchPrefs } from "./research-prefs";
import type { StrainProfile } from "./strain-profile";

// Response shapes returned by the Firebase Functions backend (functions/src).
export type StrainAnalysis = {
  headline: string;
  summary: string;
  forCondition: {
    best: string;
    why: string;
    runnerUp: string;
  } | null;
  keyDifferences: string[];
  commonGround: string[];
  cautions: string[];
};

export type StrainComparison = {
  strains: StrainProfile[];
  analysis: StrainAnalysis;
  resultId?: string;
};

export type StrainRecommendation = {
  strainName: string;
  reason: string;
  bestFor: string;
  caution: string;
};

export type RecommendationResult = {
  headline: string;
  summary: string;
  recommendations: StrainRecommendation[];
  strains: StrainProfile[];
  resultId?: string;
};

function call<TArgs, TResult>(name: string, args: TArgs): Promise<TResult> {
  if (!functions) {
    return Promise.reject(
      new Error(
        "Firebase isn't configured yet — add your VITE_FIREBASE_* keys in the Keys tab, then deploy the functions.",
      ),
    );
  }
  return httpsCallable<TArgs, TResult>(functions, name)(args).then(
    (res) => res.data,
  );
}

/** Popular strains on Leafly right now (public callable). */
export function popularStrains(): Promise<StrainProfile[]> {
  return call<Record<string, never>, StrainProfile[]>("popularStrains", {});
}

/** Look up one strain by name on Leafly (public callable). */
export function searchStrain(name: string): Promise<StrainProfile | null> {
  return call<{ name: string }, StrainProfile | null>("searchStrain", {
    name,
  });
}

/** Side-by-side comparison (auth-gated callable). */
export function compareStrains(args: {
  strainNames: string[];
  condition?: string[];
  prefs?: ResearchPrefs;
}): Promise<StrainComparison> {
  return call<typeof args, StrainComparison>("compareStrains", args);
}

/** Best strains for a patient's symptoms (auth-gated callable). */
export function recommendStrains(args: {
  conditions: string[];
  potency?: "mild" | "balanced" | "strong";
  prefs?: ResearchPrefs;
}): Promise<RecommendationResult> {
  return call<typeof args, RecommendationResult>(
    "recommendStrainsForConditions",
    args,
  );
}
