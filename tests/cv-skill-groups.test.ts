import { describe, expect, it } from "vitest";
import { parseGeneratedCV } from "@/lib/ai/cv-shape";

const base = (groups: unknown) => ({
  identity: { full_name: "A B", email: null, phone: null, location: null, linkedin_url: null, portfolio_url: null },
  summary: "",
  sections: {
    experiences: [{ title: "Dev", company: null, location: null, start_date: null, end_date: null, bullet_points: [] }],
    skill_groups: groups,
  },
});

describe("skill_groups", () => {
  it("aplatit les sections dans skills_flat", () => {
    const cv = parseGeneratedCV(
      base([
        { label: "Langages", items: ["Java", "SQL"] },
        { label: "DevOps", items: ["Docker"] },
      ])
    );
    expect(cv.sections.skills_flat).toEqual(["Java", "SQL", "Docker"]);
    expect(cv.sections.skill_groups).toHaveLength(2);
  });

  it("reste compatible sans sections", () => {
    const cv = parseGeneratedCV(base(undefined));
    expect(cv.sections.skill_groups).toEqual([]);
    expect(cv.sections.skills_flat).toEqual([]);
  });
});
