import { describe, expect, it } from "vitest";
import { blendScores, interleave } from "@/lib/scoring/ai-pass";

describe("second passage IA", () => {
  it("score final = moyenne local / IA, borné 0-100", () => {
    expect(blendScores(90, 70)).toBe(80);
    expect(blendScores(95, 40)).toBe(68);
    expect(blendScores(120, 120)).toBe(100);
    expect(blendScores(-10, -10)).toBe(0);
  });

  it("interleave : lots de 20 max, chaque lot mélange les rangs", () => {
    const lots = interleave(Array.from({ length: 40 }, (_, i) => i));
    expect(lots).toHaveLength(2);
    expect(lots[0]).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38]);
    expect(interleave([1, 2, 3])).toEqual([[1, 2, 3]]);
  });
});
