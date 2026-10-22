import { describe, expect, it } from "vitest";
import { scoreOffreLocal, scoreTitle } from "@/lib/scoring/local";
import { profile } from "./fixtures";
import type { ProfileFull } from "@/lib/cv/types";

const base = {
  ...profile,
  sectors: ["Développement full stack"],
  target_titles: ["Développeur full stack", "Ingénieur IA"],
  target_countries: ["France"],
  preferred_contracts: ["cdi"],
  experiences: [
    { title: "Développeur web", company: "Acme", start_date: "2023-01", end_date: "2024-06", bullet_points: [], skills_used: [] },
  ],
  skills: [],
  projects: [],
} as unknown as ProfileFull;

const offre = (title: string, description = "") => ({
  title,
  company: "X",
  country: "France",
  description_text: description,
  contract_type: "CDI",
});

describe("scoring local", () => {
  it("secteur multi-mots : un seul mot générique ne suffit pas", () => {
    const faux = scoreOffreLocal(base, offre("Assistant RH", "Développement commercial et RH"));
    const vrai = scoreOffreLocal(base, offre("Développeur full stack", "Stack React"));
    expect(faux.breakdown.sector).toBeLessThan(vrai.breakdown.sector);
    expect(faux.breakdown.sector).toBeLessThan(50);
  });

  it("titre : poste recherché > poste sans rapport", () => {
    expect(scoreTitle(base, "Développeur Full Stack H/F").score).toBe(100);
    expect(scoreTitle(base, "Assistant comptable").score).toBe(0);
    expect(scoreTitle(base, "Ingénieur IA générative").score).toBeGreaterThanOrEqual(100);
  });

  it("titre : offre senior pénalisée pour un profil de moins de 3 ans", () => {
    expect(scoreTitle(base, "Senior Développeur full stack").score).toBe(60);
  });

  it("compétences : une longue liste ne fait pas baisser le score", () => {
    const skill = (name: string) => ({ name, category: null, level: null, evidence_experience_ids: [] });
    const court = { ...base, skills: [skill("React"), skill("Node")] } as ProfileFull;
    const long = {
      ...base,
      skills: [skill("React"), skill("Node"), ...Array.from({ length: 30 }, (_, i) => skill(`Outil${i}`))],
    } as ProfileFull;
    const o = offre("Dev", "React et Node requis");
    expect(scoreOffreLocal(long, o).breakdown.skills).toBe(scoreOffreLocal(court, o).breakdown.skills);
  });
});
