import { describe, expect, it } from "vitest";
import { blendScores } from "@/lib/scoring/ai-pass";

describe("second passage IA", () => {
  it("score final = moyenne local / IA, borné 0-100", () => {
    expect(blendScores(90, 70)).toBe(80);
    expect(blendScores(95, 40)).toBe(68);
    expect(blendScores(120, 120)).toBe(100);
    expect(blendScores(-10, -10)).toBe(0);
  });
});
