import "server-only";
import fs from "node:fs";
import path from "node:path";
import { callStructured, type StructuredTool } from "./llm";
import type { ProfileFull } from "@/lib/cv/types";
import { isAnchoredSkill, yearsOfExperience } from "@/lib/scoring/local";

export type ScoreResult = {
  score: number;
  breakdown: { sector: number; skills: number; title?: number; country: number };
  reason: string;
};

const SCORE_TOOL = {
  name: "score_offres",
  description: "Enregistre les scores de compatibilité pour le batch d'offres reçu.",
  input_schema: {
    type: "object",
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            offre_index: { type: "number" },
            score: { type: "number", minimum: 0, maximum: 100 },
            breakdown: {
              type: "object",
              properties: {
                sector: { type: "number" },
                skills: { type: "number" },
                title: { type: "number" },
                country: { type: "number" },
              },
              required: ["sector", "skills", "title", "country"],
            },
            reason: { type: "string" },
          },
          required: ["offre_index", "score", "breakdown", "reason"],
        },
      },
    },
    required: ["results"],
  },
} as const;

let _systemPrompt: string | null = null;
function getSystemPrompt(): string {
  if (_systemPrompt) return _systemPrompt;
  _systemPrompt = fs.readFileSync(path.join(process.cwd(), "prompts", "score-offre.md"), "utf-8");
  return _systemPrompt;
}

function buildProfileSummary(profile: ProfileFull): string {
  const skillsAnchored = profile.skills.filter((s) => isAnchoredSkill(profile, s));
  const skillsListed = profile.skills.filter((s) => !isAnchoredSkill(profile, s));
  return JSON.stringify(
    {
      sectors: profile.sectors,
      target_titles: profile.target_titles ?? [],
      preferred_contracts: profile.preferred_contracts,
      years_of_experience: yearsOfExperience(profile),
      target_countries: profile.target_countries,
      skills_anchored: skillsAnchored.map((s) => s.name),
      skills_listed_only: skillsListed.map((s) => s.name),
      experience_titles: profile.experiences.map((e) => e.title).filter(Boolean),
      project_names: (profile.projects ?? []).map((p) => p.name).filter(Boolean),
      languages: profile.languages.map((l) => `${l.name}${l.level ? ` (${l.level})` : ""}`),
    },
    null,
    0
  );
}

export async function scoreOffres(
  profile: ProfileFull,
  offres: { title: string; company: string; country: string | null; description_text: string; contract_type?: string | null }[]
): Promise<ScoreResult[]> {
  if (offres.length === 0) return [];

  const profileSummary = buildProfileSummary(profile);

  // Truncate descriptions to keep batch reasonable; full descriptions stay in DB.
  const offresPayload = offres.map((o, i) => ({
    offre_index: i,
    title: o.title,
    company: o.company,
    country: o.country,
    contract_type: o.contract_type ?? null,
    description: o.description_text.slice(0, 3000),
  }));

  const message = await callStructured({
    role: "reviewer",
    maxTokens: 8000,
    system: [
      { text: getSystemPrompt(), cache: true },
      { text: `<profil_utilisateur>\n${profileSummary}\n</profil_utilisateur>`, cache: true },
    ],
    tool: SCORE_TOOL as unknown as StructuredTool,
    user: `Score les ${offres.length} offres ci-dessous.\n\n${JSON.stringify(offresPayload)}`,
  });

  if (!message.input) {
    return offres.map(() => ({ score: 0, breakdown: { sector: 0, skills: 0, country: 0 }, reason: "" }));
  }
  const results = (message.input as { results?: unknown }).results;
  const out = (Array.isArray(results) ? results : []) as any[];
  const ordered: ScoreResult[] = offres.map((_, i) => {
    const r = out.find((x: any) => x.offre_index === i);
    if (!r) return { score: 0, breakdown: { sector: 0, skills: 0, country: 0 }, reason: "" };
    return {
      score: Math.round(r.score),
      breakdown: r.breakdown,
      reason: r.reason ?? "",
    };
  });
  return ordered;
}
