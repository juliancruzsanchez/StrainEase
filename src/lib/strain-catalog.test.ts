import { describe, expect, test } from "bun:test";
import { CATALOG, matchingAilment } from "./strain-catalog";

describe("matchingAilment", () => {
  test("keeps a popular strain when live data has no medicalUses", () => {
    const live = [
      { name: "Granddaddy Purple", inKnowledgeBase: true, type: "indica" as const },
    ];
    const hits = matchingAilment("Insomnia", live);
    expect(hits.some((profile) => profile.name === "Granddaddy Purple")).toBe(true);
  });

  test("OCD is its own chip but matches Anxiety strains", () => {
    const hits = matchingAilment("OCD", []);
    expect(hits.length).toBeGreaterThanOrEqual(6);
    expect(hits.some((profile) => profile.name === "Gelato")).toBe(true);
    expect(
      hits.every(
        (profile) =>
          profile.medicalUses?.some((use) => use.toLowerCase() === "anxiety") ||
          profile.medicalUses?.some((use) => use.toLowerCase() === "ocd"),
      ),
    ).toBe(true);
  });

  test("ADHD matches catalog focus strains", () => {
    const hits = matchingAilment("ADHD", []);
    expect(hits.length).toBeGreaterThanOrEqual(6);
    expect(hits.some((profile) => profile.name === "Jack Herer")).toBe(true);
  });
});

describe("directory", () => {
  test("includes the curated set and the 150-strain directory", () => {
    expect(CATALOG.some((profile) => profile.name === "Blue Dream")).toBe(true);
    expect(CATALOG.length).toBeGreaterThanOrEqual(150);
  });
});
