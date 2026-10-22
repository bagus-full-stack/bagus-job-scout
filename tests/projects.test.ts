import { describe, expect, it } from "vitest";
import { planMerge, applyMerge, dedupProfile } from "@/lib/cv/merge";
import { getProfile, saveProfile } from "@/lib/db/queries";
import { profile } from "./fixtures";
import type { ProfileFull } from "@/lib/cv/types";

const proj = (name: string, bullets: string[] = []) => ({
  name,
  role: null,
  url: null,
  start_date: null,
  end_date: null,
  description: null,
  bullet_points: bullets,
  skills_used: [],
});

describe("projets du profil", () => {
  const base = { ...profile, projects: [proj("JobScout", ["Moteur de scan"])] } as ProfileFull;

  it("ajoute un projet nouveau et enrichit un projet existant", () => {
    const incoming = {
      ...base,
      projects: [proj("JobScout", ["Moteur de scan", "Export Excel"]), proj("Portfolio")],
    } as ProfileFull;
    const plan = planMerge(base, incoming);
    expect(plan.newProjects.map((p) => p.name)).toEqual(["Portfolio"]);
    expect(plan.enrichedProjects).toHaveLength(1);
    const merged = applyMerge(base, plan);
    expect(merged.projects).toHaveLength(2);
    expect(merged.projects[0].bullet_points).toContain("Export Excel");
  });

  it("le nettoyage fusionne les projets en double", () => {
    const dup = { ...base, projects: [proj("JobScout", ["Moteur de scan multi-sources"]), proj("JobScout", ["Export Excel des candidatures"])] } as ProfileFull;
    const { profile: clean, report } = dedupProfile(dup);
    expect(report.projectsMerged).toBe(1);
    expect(clean.projects).toHaveLength(1);
    expect(clean.projects[0].bullet_points).toEqual(expect.arrayContaining(["Moteur de scan multi-sources", "Export Excel des candidatures"]));
  });

  it("les projets survivent à saveProfile puis getProfile", () => {
    const { id, created_at, updated_at, ...rest } = base;
    void id; void created_at; void updated_at;
    saveProfile({
      ...rest,
      projects: [{ ...proj("JobScout", ["Moteur de scan"]), url: "https://github.com/x/jobscout", skills_used: ["Next.js"] }],
    });
    const back = getProfile();
    expect(back?.projects).toHaveLength(1);
    expect(back?.projects[0]).toMatchObject({
      name: "JobScout",
      url: "https://github.com/x/jobscout",
      bullet_points: ["Moteur de scan"],
      skills_used: ["Next.js"],
    });
  });
});
