import { slugify } from "@/lib/saved-strains";
import type { StrainProfile, StrainType } from "@/lib/strain-profile";
import { matchesCondition } from "@/lib/strain-ui";
import directoryJson from "../data/strain-directory.json";

type CatalogEntry = {
  name: string;
  type: StrainType;
  thc: string;
  uses: string[];
  imageUrl?: string;
};

// Curated browse set so Home rails always have 6+ strains per type and
// ailment, even when the live popular list is short or missing a phenotype.
// Keep in sync with ios/StrainWise/Models/StrainCatalog.swift.
const ENTRIES: CatalogEntry[] = [
  {
    name: "Blue Dream",
    type: "hybrid",
    thc: "17–24%",
    uses: [
      "Chronic pain",
      "Depression",
      "Stress",
      "Fatigue",
      "Inflammation",
      "Arthritis",
    ],
  },
  {
    name: "Granddaddy Purple",
    type: "indica",
    thc: "17–23%",
    uses: [
      "Insomnia",
      "Chronic pain",
      "Muscle spasm",
      "Stress",
      "PTSD",
      "Anxiety",
    ],
  },
  {
    name: "Sour Diesel",
    type: "sativa",
    thc: "19–24%",
    uses: [
      "ADHD",
      "Stress",
      "Depression",
      "Chronic pain",
      "Fatigue",
      "Migraine",
    ],
  },
  {
    name: "Jack Herer",
    type: "sativa",
    thc: "18–23%",
    uses: ["ADHD", "Fatigue", "Depression", "Stress", "Inflammation", "Migraine"],
  },
  {
    name: "Gelato",
    type: "hybrid",
    thc: "20–25%",
    uses: ["Stress", "Anxiety", "Depression", "PTSD", "Nausea & appetite"],
  },
  {
    name: "Northern Lights",
    type: "indica",
    thc: "16–21%",
    uses: [
      "Insomnia",
      "Chronic pain",
      "Stress",
      "Anxiety",
      "PTSD",
      "Inflammation",
    ],
  },
  {
    name: "OG Kush",
    type: "hybrid",
    thc: "19–26%",
    uses: [
      "Chronic pain",
      "Stress",
      "Nausea & appetite",
      "Migraine",
      "Arthritis",
      "Muscle spasm",
    ],
  },
  {
    name: "Green Crack",
    type: "sativa",
    thc: "15–25%",
    uses: ["ADHD", "Fatigue", "Stress", "Depression", "Migraine", "Anxiety"],
  },
  {
    name: "Bubba Kush",
    type: "indica",
    thc: "14–22%",
    uses: [
      "Insomnia",
      "Chronic pain",
      "Muscle spasm",
      "Arthritis",
      "PTSD",
      "Nausea & appetite",
    ],
  },
  {
    name: "Wedding Cake",
    type: "hybrid",
    thc: "20–25%",
    uses: ["Anxiety", "Stress", "Depression", "PTSD", "Inflammation"],
  },
  {
    name: "Durban Poison",
    type: "sativa",
    thc: "15–25%",
    uses: ["ADHD", "Fatigue", "Depression", "Stress", "Migraine"],
  },
  {
    name: "Purple Punch",
    type: "indica",
    thc: "18–20%",
    uses: ["Insomnia", "Anxiety", "Nausea & appetite", "Stress", "Arthritis"],
  },
  {
    name: "Gorilla Glue",
    type: "hybrid",
    thc: "20–28%",
    uses: ["Chronic pain", "Stress", "Insomnia", "Inflammation"],
  },
  {
    name: "Super Lemon Haze",
    type: "sativa",
    thc: "17–25%",
    uses: ["ADHD", "Fatigue", "Depression", "Stress"],
  },
  {
    name: "9 Pound Hammer",
    type: "indica",
    thc: "18–23%",
    uses: ["Insomnia", "Chronic pain", "Muscle spasm", "Arthritis"],
  },
  {
    name: "Girl Scout Cookies",
    type: "hybrid",
    thc: "17–28%",
    uses: ["Chronic pain", "Nausea & appetite", "Stress", "Anxiety"],
  },
  {
    name: "Strawberry Cough",
    type: "sativa",
    thc: "15–22%",
    uses: ["ADHD", "Fatigue", "Stress", "Anxiety"],
  },
  {
    name: "Hindu Kush",
    type: "indica",
    thc: "15–20%",
    uses: [
      "Chronic pain",
      "Insomnia",
      "Inflammation",
      "Arthritis",
      "Muscle spasm",
    ],
  },
  {
    name: "White Widow",
    type: "hybrid",
    thc: "18–25%",
    uses: ["Stress", "Depression", "Inflammation", "Migraine", "Arthritis"],
  },
  {
    name: "Pineapple Express",
    type: "hybrid",
    thc: "15–25%",
    uses: ["ADHD", "Depression", "Fatigue", "Stress"],
  },
  {
    name: "GMO Cookies",
    type: "indica",
    thc: "20–28%",
    uses: ["Insomnia", "Nausea & appetite", "Chronic pain", "Muscle spasm"],
  },
  {
    name: "Super Silver Haze",
    type: "sativa",
    thc: "16–23%",
    uses: ["ADHD", "Fatigue", "Depression", "Stress"],
  },
  {
    name: "Skywalker OG",
    type: "indica",
    thc: "18–26%",
    uses: ["Insomnia", "Chronic pain", "PTSD", "Stress"],
  },
  {
    name: "Tangie",
    type: "sativa",
    thc: "17–22%",
    uses: ["ADHD", "Fatigue", "Depression", "Stress"],
  },
];

// Leafly nug shots for the curated set. Home rails use these stubs so posters
// stay filled even when the live popular list is short or missing a phenotype.
const PHOTOS: Record<string, string> = {
  "blue-dream": "https://images.leafly.com/flower-images/blue-dream.png",
  "granddaddy-purple":
    "https://images.leafly.com/flower-images/granddaddy-purple.png",
  "sour-diesel":
    "https://leafly-public.imgix.net/strains/photos/5SPDG4T4TcSO8PgLgWHO_SourDiesel_AdobeStock_171888473.jpg",
  "jack-herer": "https://images.leafly.com/flower-images/jack-herer.jpg",
  gelato: "https://images.leafly.com/flower-images/gelato.jpg",
  "northern-lights":
    "https://images.leafly.com/flower-images/northern-lights.png",
  "og-kush": "https://images.leafly.com/flower-images/og-kush.png",
  "green-crack": "https://images.leafly.com/flower-images/green-crack.png",
  "bubba-kush": "https://images.leafly.com/flower-images/bubba-kush.png",
  "wedding-cake":
    "https://leafly-public.imgix.net/strains/photos/m2y50HYRBu0dHY4JSdSx_wedding-cake_jman.jpg",
  "durban-poison": "https://images.leafly.com/flower-images/durban-poison.jpg",
  "purple-punch":
    "https://images.leafly.com/flower-images/purple-punch-fixed.jpg",
  "gorilla-glue": "https://images.leafly.com/flower-images/gg-4.jpg",
  "super-lemon-haze":
    "https://leafly-public.imgix.net/strains/photos/QRio3lTnO1PsVFx8Sxw1_super-lemon-haze_jman.jpg",
  "9-pound-hammer":
    "https://leafly-public.imgix.net/strains/photos/dN680700Rbqf10ZWl54R_9-pound-hammer_jman.jpg",
  "girl-scout-cookies": "https://images.leafly.com/flower-images/gsc.png",
  "strawberry-cough":
    "https://images.leafly.com/flower-images/strawberry-cough.png",
  "hindu-kush":
    "https://images.leafly.com/flower-images/defaults/generic/strain-13.png",
  "white-widow": "https://images.leafly.com/flower-images/white-widow.png",
  "pineapple-express":
    "https://images.leafly.com/flower-images/pineapple-express.png",
  "gmo-cookies":
    "https://images.leafly.com/flower-images/defaults/red-orange-amber/strain-2.png",
  "super-silver-haze":
    "https://images.leafly.com/flower-images/super-silver-haze.png",
  "skywalker-og":
    "https://images.leafly.com/flower-images/defaults/long-fluffy-wispy/strain-2.png",
  tangie:
    "https://leafly-public.imgix.net/strains/photos/8wTMziz0RQaJqNE4juPn_Tangie.png",
};

function toProfile(entry: CatalogEntry): StrainProfile {
  return {
    name: entry.name,
    inKnowledgeBase: true,
    type: entry.type,
    thcRange: entry.thc || undefined,
    medicalUses: entry.uses?.length ? entry.uses : undefined,
    imageUrl: entry.imageUrl || PHOTOS[slugify(entry.name)],
  };
}

const DIRECTORY = (directoryJson as CatalogEntry[]).filter(
  (entry) => typeof entry?.name === "string" && entry.name.trim() !== "",
);

// Leafly popular-list names that don't match our catalog slugs, plus a few
// current popular strains we don't keep in the browse set. Used so homepage
// cards can show medical uses instead of recreational effects.
const SLUG_ALIASES: Record<string, string> = {
  gsc: "girl-scout-cookies",
  gg4: "gorilla-glue",
  "gg-4": "gorilla-glue",
  "original-glue": "gorilla-glue",
};

const EXTRA_USES: Record<string, string[]> = {
  "lemon-cherry-gelato": ["Anxiety", "Depression", "Arthritis"],
  "super-boof": ["Anxiety", "Depression", "Fatigue"],
  "ice-cream-cake": ["Anxiety", "Insomnia", "PTSD"],
  runtz: ["Anxiety", "PTSD", "Depression"],
  "cereal-milk": ["Anxiety", "Depression", "Stress"],
  "permanent-marker": ["Anxiety", "Stress", "Depression"],
};

export function profileSlug(profile: Pick<StrainProfile, "name">): string {
  return slugify(profile.name);
}

function catalogKey(name: string): string {
  const slug = slugify(name);
  return SLUG_ALIASES[slug] ?? slug;
}

function catalogDefaults(
  name: string,
): Pick<StrainProfile, "imageUrl" | "medicalUses"> | undefined {
  const slug = slugify(name);
  const key = catalogKey(name);
  const fromCatalog = CATALOG.find((profile) => profileSlug(profile) === key);
  const medicalUses = fromCatalog?.medicalUses ?? EXTRA_USES[slug] ?? EXTRA_USES[key];
  const imageUrl = fromCatalog?.imageUrl ?? PHOTOS[key] ?? PHOTOS[slug];
  if (!medicalUses && !imageUrl) return undefined;
  return { imageUrl, medicalUses };
}

/** Top reported medical uses — live profile first, then catalog / extras. */
export function topMedicalUses(
  profile: Pick<StrainProfile, "name" | "medicalUses">,
  limit = 3,
): string[] {
  const live = (profile.medicalUses ?? []).filter((use) => use.trim() !== "");
  if (live.length >= limit) return live.slice(0, limit);
  const extras = catalogDefaults(profile.name)?.medicalUses ?? [];
  const seen = new Set(live.map((use) => use.toLowerCase()));
  const merged = [...live];
  for (const use of extras) {
    const key = use.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(use);
    if (merged.length >= limit) break;
  }
  return merged.slice(0, limit);
}

export function uniqueProfiles(profiles: StrainProfile[]): StrainProfile[] {
  const seen = new Map<string, StrainProfile>();
  for (const profile of profiles) {
    const slug = profileSlug(profile);
    if (!profile.name || !slug) continue;
    const existing = seen.get(slug);
    if (!existing) {
      seen.set(slug, profile);
      continue;
    }
    seen.set(slug, {
      ...existing,
      imageUrl: existing.imageUrl ?? profile.imageUrl,
      medicalUses:
        existing.medicalUses && existing.medicalUses.length > 0
          ? existing.medicalUses
          : profile.medicalUses,
    });
  }
  return [...seen.values()];
}

// Curated ENTRIES win on medical uses when names collide.
export const CATALOG: StrainProfile[] = uniqueProfiles([
  ...ENTRIES.map(toProfile),
  ...DIRECTORY.map(toProfile),
]);

/** Fill catalog photos and medical uses when a live profile is missing them. */
export function applyCatalogPhotos(profiles: StrainProfile[]): StrainProfile[] {
  return profiles.map((profile) => {
    const defaults = catalogDefaults(profile.name);
    if (!defaults) return profile;
    const imageUrl = profile.imageUrl || defaults.imageUrl;
    const medicalUses =
      profile.medicalUses && profile.medicalUses.length > 0
        ? profile.medicalUses
        : defaults.medicalUses;
    if (imageUrl === profile.imageUrl && medicalUses === profile.medicalUses) {
      return profile;
    }
    return { ...profile, imageUrl, medicalUses };
  });
}

export function mergeCatalog(
  live: StrainProfile[],
  preferringType?: StrainType,
): StrainProfile[] {
  const extras = CATALOG.filter((catalog) => {
    if (preferringType && catalog.type !== preferringType) return false;
    return !live.some((item) => profileSlug(item) === profileSlug(catalog));
  });
  const head = preferringType
    ? live.filter((item) => item.type === preferringType)
    : live;
  return uniqueProfiles([...head, ...extras]);
}

export function matchingAilment(
  ailment: string,
  live: StrainProfile[],
): StrainProfile[] {
  const combined = applyCatalogPhotos(uniqueProfiles([...live, ...CATALOG]));
  const key = ailment.trim().toLowerCase();
  const hits = combined.filter((profile) =>
    matchesCondition(profile.medicalUses, key),
  );
  return hits.length === 0 ? combined.slice(0, 8) : hits;
}
