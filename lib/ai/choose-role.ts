import "server-only";
import { callStructured, type StructuredTool } from "./llm";
import type { ProfileFull } from "@/lib/cv/types";

export type RoleChoice = { id: number; role: string; reason: string };
type Candidate = { id: number; company: string; email: string };

const BATCH = 40;

const SYSTEM = `Tu aides un candidat à choisir, pour chaque entreprise, LE profil sous lequel envoyer sa candidature spontanée. Il a plusieurs postes visés ; tu ne peux répondre que par l'un d'eux, recopié à l'identique.

Tu reçois, pour chaque entreprise, son nom et l'adresse e-mail de contact. Raisonne à partir de :
- ce que tu sais de l'entreprise (secteur, activité, taille) d'après son nom et le domaine de l'adresse ;
- l'adresse elle-même : une boîte « data@ », « ia@ », « ai@ », « recherche@ » penche vers l'IA ; « recrutement@ », « jobs@ », « rh@ » ne dit rien.

Règles :
- Entreprise de services numériques, conseil, éditeur de logiciels, banque, assurance, e-commerce, industrie : le poste le plus généraliste (développement full stack) sauf indice clair d'un pôle data/IA.
- Entreprise dont le cœur de métier est la donnée, l'IA, le machine learning, la vision par ordinateur ou la recherche : le poste IA.
- Entreprise que tu ne connais pas, ou nom ambigu : le premier poste de la liste, avec la raison « entreprise inconnue ». N'invente jamais une activité.
- La raison tient en 12 mots maximum, en français, et cite l'indice (ex. « ESN généraliste », « éditeur de logiciels de data »).

Renvoie exactement une décision par entreprise, via l'outil.`;

function tool(options: string[]): StructuredTool {
  return {
    name: "choose_roles",
    description: "Un poste visé par entreprise.",
    input_schema: {
      type: "object",
      properties: {
        choices: {
          type: "array",
          items: {
            type: "object",
            properties: {
              n: { type: "integer", description: "Numéro de l'entreprise dans la liste." },
              role: { type: "string", enum: options },
              reason: { type: "string" },
            },
            required: ["n", "role", "reason"],
          },
        },
      },
      required: ["choices"],
    },
  } as unknown as StructuredTool;
}

/**
 * Choisit le poste visé de chaque contact parmi les postes du profil. Le modèle ne voit que
 * le nom et l'adresse de l'entreprise (rien d'autre n'est envoyé) ; sa réponse est contrainte
 * à la liste des postes (enum) puis revérifiée. `onBatch` reçoit chaque lot dès qu'il est
 * prêt : un échec en cours de route laisse les lots précédents enregistrés.
 */
export async function chooseRoles(
  profile: ProfileFull,
  options: string[],
  contacts: Candidate[],
  onBatch: (choices: RoleChoice[]) => void
): Promise<number> {
  let done = 0;
  const skills = profile.skills.slice(0, 30).map((s) => s.name).join(", ");
  const system = `${SYSTEM}\n\n## Postes visés (réponses autorisées)\n${options.map((o, i) => `${i + 1}. ${o}`).join("\n")}\n\n## Profil du candidat\n${profile.summary ?? ""}\nCompétences : ${skills}`;
  for (let i = 0; i < contacts.length; i += BATCH) {
    const batch = contacts.slice(i, i + BATCH);
    const message = await callStructured({
      role: "reviewer",
      maxTokens: 4000,
      system: [{ text: system, cache: true }],
      tool: tool(options),
      user: batch.map((c, j) => `${j + 1}. ${c.company} <${c.email}>`).join("\n"),
    });
    const raw = Array.isArray(message.input?.choices) ? (message.input!.choices as Record<string, unknown>[]) : [];
    const choices: RoleChoice[] = [];
    for (const r of raw) {
      const c = batch[Number(r.n) - 1];
      const role = typeof r.role === "string" ? options.find((o) => o === r.role) : undefined;
      if (c && role) choices.push({ id: c.id, role, reason: String(r.reason ?? "").trim().slice(0, 120) });
    }
    onBatch(choices);
    done += choices.length;
  }
  return done;
}
