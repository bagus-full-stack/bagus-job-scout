import "server-only";
import { callStructured, type StructuredTool } from "./llm";

export type ExtractedOffre = {
  title: string;
  company: string;
  country: string | null;
  location: string | null;
  contract_type: string | null;
};

const SYSTEM = `Tu extrais les champs d'une offre d'emploi collée telle quelle. Recopie ce que le texte dit, n'invente rien : un champ absent vaut null. Le pays s'écrit en français (« France », « Allemagne »). Le contrat est l'un de : cdi, cdd, vie, stage, alternance, freelance, ou null.`;

const TOOL: StructuredTool = {
  name: "extract_offre",
  description: "Champs de l'offre.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      company: { type: "string" },
      country: { type: ["string", "null"] },
      location: { type: ["string", "null"] },
      contract_type: { type: ["string", "null"] },
    },
    required: ["title", "company"],
  },
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null);

export async function extractOffre(text: string): Promise<ExtractedOffre> {
  const m = await callStructured({
    role: "writer",
    maxTokens: 500,
    system: SYSTEM,
    tool: TOOL,
    user: text.slice(0, 12000),
  });
  const i = m.input ?? {};
  return {
    title: str(i.title) ?? "Offre sans titre",
    company: str(i.company) ?? "Entreprise inconnue",
    country: str(i.country),
    location: str(i.location),
    contract_type: str(i.contract_type),
  };
}
