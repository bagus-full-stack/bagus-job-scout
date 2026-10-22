import { describe, expect, it } from "vitest";
import { isAnchoredSkill, scoreOffreLocal } from "@/lib/scoring/local";
import type { ProfileFull } from "@/lib/cv/types";

const skill = (name: string, evidence: number[] = []) => ({
  name,
  category: null,
  level: null,
  evidence_experience_ids: evidence,
});

const profile = (over: Partial<ProfileFull> = {}) =>
  ({
    sectors: ["Développement full stack"],
    target_titles: ["Développeur full stack"],
    target_countries: ["France"],
    preferred_contracts: ["cdi"],
    languages: [{ name: "Français", level: "C2" }],
    experiences: [],
    skills: [],
    projects: [],
    ...over,
  }) as unknown as ProfileFull;

const FR =
  "Mission : vous rejoignez notre équipe pour une mission avec le profil et les compétences de votre formation dans l'entreprise.";
const EN =
  "The team will hire your skills and experience for the role: the company and the team with your responsibilities for the project.";

type Offre = Parameters<typeof scoreOffreLocal>[1];

const offre = (over: Partial<Offre> = {}): Offre => ({
  title: "Développeur",
  company: "X",
  country: "France",
  description_text: FR,
  contract_type: null,
  ...over,
});

const bd = (p: ProfileFull, o: Offre) => scoreOffreLocal(p, o).breakdown;

describe("scoreCountry (via breakdown.country)", () => {
  it("100 si le pays est ciblé, 0 sinon, 50 si inconnu ou aucun pays ciblé", () => {
    expect(bd(profile(), offre({ country: "France" })).country).toBe(100);
    expect(bd(profile(), offre({ country: "france" })).country).toBe(100);
    expect(bd(profile(), offre({ country: "Suisse" })).country).toBe(0);
    expect(bd(profile(), offre({ country: null })).country).toBe(50);
    expect(bd(profile({ target_countries: [] }), offre({ country: "Suisse" })).country).toBe(50);
  });
});

describe("scoreLanguage (via breakdown.language)", () => {
  it("100 si l'offre est dans une langue maîtrisée", () => {
    expect(bd(profile(), offre()).language).toBe(100);
    const bilingue = profile({
      languages: [
        { name: "Français", level: "C2" },
        { name: "Anglais", level: "B2" },
      ] as ProfileFull["languages"],
    });
    expect(bd(bilingue, offre({ description_text: EN })).language).toBe(100);
  });

  it("30 si l'offre est dans une autre langue mais que l'anglais est maîtrisé", () => {
    const anglais = profile({ languages: [{ name: "Anglais", level: "B2" }] as ProfileFull["languages"] });
    expect(bd(anglais, offre()).language).toBe(30);
  });

  it("0 sans langue commune ni anglais, ou avec un niveau insuffisant", () => {
    expect(bd(profile(), offre({ description_text: EN })).language).toBe(0);
    const debutant = profile({
      languages: [
        { name: "Français", level: "C2" },
        { name: "Anglais", level: "A2" },
      ] as ProfileFull["languages"],
    });
    expect(bd(debutant, offre({ description_text: EN })).language).toBe(0);
  });

  it("une langue listée sans niveau compte comme parlée", () => {
    const sansNiveau = profile({ languages: [{ name: "Anglais", level: null }] as ProfileFull["languages"] });
    expect(bd(sansNiveau, offre({ description_text: EN })).language).toBe(100);
  });
});

describe("scoreContract (via breakdown.contract)", () => {
  it("100 pour un contrat recherché, 20 identifié mais non recherché, 50 inconnu", () => {
    expect(bd(profile(), offre({ contract_type: "CDI" })).contract).toBe(100);
    expect(bd(profile(), offre({ title: "Stage développeur" })).contract).toBe(20);
    expect(bd(profile(), offre()).contract).toBe(50);
  });

  it("sans préférence, CDI et CDD sont recherchés par défaut", () => {
    expect(bd(profile({ preferred_contracts: [] }), offre({ contract_type: "CDD" })).contract).toBe(100);
    expect(bd(profile({ preferred_contracts: [] }), offre({ title: "Alternance dev" })).contract).toBe(20);
  });
});

describe("scoreDuration (via breakdown.duration, V.I.E seulement)", () => {
  const vie = (txt: string) => offre({ description_text: `Offre V.I.E Business France. ${txt}` });
  const p = profile({ preferred_contracts: ["vie"] as ProfileFull["preferred_contracts"] });

  it("100 entre 12 et 24 mois, 60 entre 6 et 11, 20 au-delà, 30 sans durée", () => {
    expect(bd(p, vie("Mission de 12 mois.")).duration).toBe(100);
    expect(bd(p, vie("Mission de 24 mois.")).duration).toBe(100);
    expect(bd(p, vie("Mission de 8 mois.")).duration).toBe(60);
    expect(bd(p, vie("Mission de 30 mois.")).duration).toBe(20);
    expect(bd(p, vie("Mission à Dubaï.")).duration).toBe(30);
  });

  it("0 hors V.I.E, même avec une durée dans le texte", () => {
    const o = offre({ contract_type: "CDI", description_text: `${FR} Période d'essai de 12 mois.` });
    expect(bd(p, o).duration).toBe(0);
  });
});

describe("scoreOffreLocal de bout en bout", () => {
  it("applique la pondération 20/40/20/20 puis les bonus langue, durée et contrat", () => {
    const p = profile({ skills: [skill("React", [1])] });
    const o = offre({
      title: "Développeur full stack",
      contract_type: "CDI",
      description_text: `${FR} Stack React.`,
    });
    const r = scoreOffreLocal(p, o);
    const b = r.breakdown;
    const base = b.sector * 0.2 + b.skills * 0.4 + b.title * 0.2 + b.country * 0.2;
    const attendu = Math.round(
      Math.max(0, Math.min(100, base + (b.language / 100) * 8 + (b.duration / 100) * 5 + ((b.contract - 50) / 50) * 10))
    );
    expect(r.score).toBe(attendu);
    expect(b.title).toBe(100);
    expect(b.country).toBe(100);
    expect(b.contract).toBe(100);
    expect(r.reason).toMatch(/CDI recherché/);
  });

  it("reste entre 95 et 100 pour une offre idéale", () => {
    const noms = Array.from({ length: 12 }, (_, i) => `Tech${i}`);
    const p = profile({ skills: noms.map((n) => skill(n, [1])) });
    const o = offre({
      title: "Développeur full stack",
      contract_type: "CDI",
      description_text: `${FR} ${noms.join(" ")}`,
    });
    const r = scoreOffreLocal(p, o);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.score).toBeGreaterThanOrEqual(95);
  });

  it("une offre sans rapport reste basse et jamais négative", () => {
    const o = offre({ title: "Boulanger", country: "Suisse", description_text: EN, contract_type: "Stage" });
    const r = scoreOffreLocal(profile({ skills: [skill("React", [1])] }), o);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThan(25);
  });

  it("le contrat recherché ajoute 10 points au contrat inconnu, un contrat non recherché en retire", () => {
    const p = profile({ skills: [skill("React", [1])] });
    const o = { title: "Développeur full stack", description_text: `${FR} React` };
    const cdi = scoreOffreLocal(p, offre({ ...o, contract_type: "CDI" })).score;
    const neutre = scoreOffreLocal(p, offre({ ...o })).score;
    const stage = scoreOffreLocal(p, offre({ ...o, title: "Stage développeur full stack" })).score;
    expect(cdi - neutre).toBe(10);
    expect(stage).toBeLessThan(neutre);
  });
});

describe("isAnchoredSkill", () => {
  const react = skill("React");

  it("vrai si une expérience atteste la compétence", () => {
    expect(isAnchoredSkill(profile(), skill("React", [3]))).toBe(true);
  });

  it("vrai si un projet l'utilise, sans tenir compte de la casse ni des accents", () => {
    const p = profile({
      projects: [{ name: "JobScout", skills_used: ["react", "Générateur"], bullet_points: [] }] as ProfileFull["projects"],
    });
    expect(isAnchoredSkill(p, react)).toBe(true);
    expect(isAnchoredSkill(p, skill("Generateur"))).toBe(true);
  });

  it("faux sans expérience ni projet, ou si projects est absent", () => {
    expect(isAnchoredSkill(profile(), react)).toBe(false);
    const sansProjets = { ...profile(), projects: undefined } as unknown as ProfileFull;
    expect(isAnchoredSkill(sansProjets, react)).toBe(false);
  });
});
