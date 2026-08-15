export function sourceSummary(
  strains: { communityNotes?: { source: string }[] }[],
): string {
  let reddit = 0;
  let leafly = 0;
  let weedmaps = 0;
  for (const s of strains) {
    for (const n of s.communityNotes ?? []) {
      const src = n.source.toLowerCase();
      if (src.includes("reddit")) reddit += 1;
      else if (src.includes("leafly")) leafly += 1;
      else if (src.includes("weedmaps")) weedmaps += 1;
    }
  }
  const bits = [
    leafly > 0 ? `Leafly · ${leafly}` : null,
    weedmaps > 0 ? `Weedmaps · ${weedmaps}` : null,
    reddit > 0 ? `Reddit · ${reddit}` : null,
  ].filter(Boolean);
  return bits.length > 0
    ? `Sources in this result: ${bits.join(" · ")}`
    : "Sources: Leafly, Weedmaps, and Reddit when comments matched.";
}
