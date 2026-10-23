import { detectVie } from "./vie";

export type ContractCategory = "cdi" | "cdd" | "vie" | "stage" | "alternance" | "graduate" | "autre";

export const CONTRACT_LABELS: Record<ContractCategory, string> = {
  cdi: "CDI",
  cdd: "CDD",
  vie: "V.I.E",
  stage: "Stage",
  alternance: "Alternance",
  graduate: "Graduate program",
  autre: "Autre",
};

export const CONTRACT_ORDER: ContractCategory[] = ["cdi", "cdd", "vie", "stage", "alternance", "graduate", "autre"];

// graduate program(me), graduate scheme/trainee/rotation, new grad, early careers program, programme jeunes diplômés.
const GRADUATE_RE =
  /\bgraduate\s+(program(me)?s?|scheme|trainee(ship)?|rotation(al)?|development|engineer\s+program(me)?)\b|\b(program(me)?|scheme)\s+graduate\b|\bnew[\s-]grad(uate)?s?\b|\bearly[\s-]careers?\s+(program(me)?|scheme)\b|\bprogram(me)?\s+(pour\s+)?(les\s+)?jeunes\s+diplomes\b|\bgraduate\b.{0,20}\bprogram/;

function strip(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function classifyContract(input: {
  contract_type: string | null;
  title: string;
  description_text: string;
  is_vie?: number | boolean; // legacy, ignored — we re-detect on the fly
  source?: string | null;
  url?: string | null;
}): ContractCategory {
  // 1. V.I.E with strict detection (re-evaluated, ignores any stale is_vie flag).
  //    We check this BEFORE alternance/stage so "V.I.E Marketing" is V.I.E, not "stage".
  if (
    detectVie({
      source: input.source ?? "",
      title: input.title,
      description: input.description_text,
      url: input.url,
    })
  ) {
    return "vie";
  }

  const haystack = `${strip(input.contract_type)} ${strip(input.title)} ${strip(input.description_text).slice(0, 1500)}`;

  // 2. Alternance / apprentissage (very specific keywords)
  if (/\b(alternance|alternant|apprentissage|apprenti|contrat\s+pro|professionnalisation)\b/.test(haystack)) {
    return "alternance";
  }
  // 3. Graduate program : parcours d'entrée pour jeunes diplômés (CDI à la clé), distinct du stage. Cherché dans l'intitulé,
  //    le type de contrat et le début de la description seulement : une entreprise qui cite son programme plus loin
  //    dans l'annonce d'un poste confirmé n'est pas un graduate program.
  const head = `${strip(input.contract_type)} ${strip(input.title)} ${strip(input.description_text).slice(0, 400)}`;
  if (GRADUATE_RE.test(head)) return "graduate";
  // 4. Stage / internship
  if (/\b(stage|stagiaire|internship|intern)\b/.test(haystack)) {
    return "stage";
  }
  // 5. CDD
  if (/\bcdd\b|\bfixed[\s-]term\b|\btemporary\b|\btemporaire\b|\bcontrat\s+a\s+duree\s+determinee\b/.test(haystack)) {
    return "cdd";
  }
  // 6. CDI
  if (/\bcdi\b|\bpermanent\b|\bcontrat\s+a\s+duree\s+indeterminee\b/.test(haystack)) {
    return "cdi";
  }

  // 7. JSON-LD employmentType fallback
  const ct = strip(input.contract_type);
  if (ct.includes("intern")) return "stage";
  if (ct.includes("temporary") || ct.includes("contractor")) return "cdd";
  if (ct.includes("full_time") || ct.includes("part_time") || ct.includes("full time") || ct.includes("part time")) {
    return "cdi";
  }

  return "autre";
}
