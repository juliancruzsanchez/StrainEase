// Shared type for a strain in a comparison. Used by the Firebase compare
// callable and the comparison UI. Profiles found on Leafly or Weedmaps
// carry full field data (inKnowledgeBase: true). Anything else is marked
// inKnowledgeBase: false and the AI fills the same fields from public
// sources. communityNotes may include Leafly reviews, Weedmaps tags, and
// Reddit quotes for the patient's ailments.
export type StrainType = "indica" | "sativa" | "hybrid";

// Source note origin. Lets the UI distinguish Leafly/Weedmaps/RD threads
// without re-parsing the human-readable `source` string.
export type CommunityNoteKind = "leafly" | "weedmaps" | "reddit" | "other";

export type CommunityNote = {
  source: string;
  text: string;
  kind?: CommunityNoteKind;
};

// Reddit thread surfaced by the LLM from training knowledge. URLs are
// pinned to old.reddit.com so the link opens without the heavy client.
export type RedditSource = {
  url: string;
  subreddit: string;
  title: string;
  snippet?: string;
  score?: number;
};

export type StrainProfile = {
  name: string;
  inKnowledgeBase: boolean;
  type?: StrainType;
  thcRange?: string;
  cbdRange?: string;
  lineage?: string;
  terpenes?: { name: string; profile: string }[];
  medicalUses?: string[];
  effects?: { name: string; intensity: number }[];
  sideEffects?: string[];
  description?: string;
  communityNotes?: CommunityNote[];
  redditSources?: RedditSource[];
  /** HTTPS photo from Leafly (`nugImage`) or Weedmaps when available. */
  imageUrl?: string;
  /** Leafly aggregate rating (0–5). Not a patient quote. */
  leaflyRating?: number;
  /** Leafly published review count for the star rating. */
  leaflyReviewCount?: number;
};
