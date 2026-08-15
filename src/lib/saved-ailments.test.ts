import { describe, expect, test } from "bun:test";
import {
  ailmentsEqual,
  clipAilment,
  normalizeAilments,
} from "./saved-ailments";

describe("saved ailments", () => {
  test("clips, trims, and de-dupes", () => {
    expect(clipAilment("  Anxiety  ")).toBe("Anxiety");
    expect(
      normalizeAilments(["Anxiety", " anxiety ", "OCD", "", 12, "OCD"]),
    ).toEqual(["Anxiety", "OCD"]);
  });

  test("compares saved vs current selection without order", () => {
    expect(ailmentsEqual(["Anxiety", "ADHD"], ["adhd", "Anxiety"])).toBe(true);
    expect(ailmentsEqual(["Anxiety"], ["ADHD"])).toBe(false);
  });
});
