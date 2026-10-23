import "server-only";
import fs from "node:fs";
import path from "node:path";
import { callStructured, type StructuredTool } from "./llm";
import { compareRecentFirst, parseGeneratedCV } from "./cv-shape";
import { AiContentError, assertNotTruncated } from "./errors";
import { validateCVAgainstProfile } from "./validate";
import { proofreadCV, translateToEnglish } from "./proofread";
import { cvLanguageInstruction } from "./lang-prompts";
import { detectDocLanguage, sourceLanguageHint, type DocLang } from "@/lib/text/lang";
import type { ProfileFull } from "@/lib/cv/types";
import { isAnchoredSkill } from "@/lib/cv/anchor";
import type { OffreFiltered } from "@/lib/db/offres";

export type GeneratedCV = {
  identity: {
    full_name: string;
    email: string | null;
    phone: string | null;
    location: string | null;
    linkedin_url: string | null;
    portfolio_url: string | null;
  };
  /** Titre sous le nom, adapté à l'offre (ex. « Ingénieur Full Stack »). */
  headline?: string;
  summary: string;
  sections: {
    experiences: {
      title: string;
      company: string | null;
      location: string | null;
      start_date: string | null;
      end_date: string | null;
      bullet_points: string[];
    }[];
    educations: {
      school: string;
      /** Repris du profil par generateCV (le modèle ne le fournit pas). */
      location?: string | null;
      degree: string | null;
      field: string | null;
      start_date: string | null;
      end_date: string | null;
      bullet_points: string[];
    }[];
    skills_flat: string[];
    /** Compétences par section (Langages, Backend…) ; skills_flat en est l'aplatissement. */
    skill_groups?: { label: string; items: string[] }[];
    languages: { name: string; level: string | null }[];
    projects: {
      name: string;
      role: string | null;
      /** Posés par validateCVAgainstProfile depuis le profil, jamais fournis par le modèle. */
      url?: string | null;
      /** Technologies du projet (profil), affichées entre parenthèses après le nom. */
      stack?: string[];
      start_date: string | null;
      end_date: string | null;
      bullet_points: string[];
    }[];
  };
};

const TOOL = {
  name: "build_cv",
  description: "Construit le CV optimisé pour l'offre.",
  input_schema: {
    type: "object",
    properties: {
      identity: {
        type: "object",
        properties: {
          full_name: { type: "string" },
          email: { type: ["string", "null"] },
          phone: { type: ["string", "null"] },
          location: { type: ["string", "null"] },
          linkedin_url: { type: ["string", "null"] },
          portfolio_url: { type: ["string", "null"] },
        },
        required: ["full_name", "email", "phone", "location", "linkedin_url", "portfolio_url"],
      },
      headline: {
        type: "string",
        description:
          "Titre professionnel court (2 à 5 mots) affiché sous le nom, adapté à l'offre et vrai pour le profil, ex. « Ingénieur Full Stack », « Ingénieur IA & Full Stack ». Sans « H/F ».",
      },
      summary: { type: "string" },
      sections: {
        type: "object",
        properties: {
          experiences: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                company: { type: ["string", "null"] },
                location: { type: ["string", "null"] },
                start_date: { type: ["string", "null"] },
                end_date: { type: ["string", "null"] },
                bullet_points: { type: "array", items: { type: "string" } },
              },
              required: ["title", "company", "location", "start_date", "end_date", "bullet_points"],
            },
          },
          educations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                school: { type: "string" },
                degree: { type: ["string", "null"] },
                field: { type: ["string", "null"] },
                start_date: { type: ["string", "null"] },
                end_date: { type: ["string", "null"] },
                bullet_points: { type: "array", items: { type: "string" } },
              },
              required: ["school", "degree", "field", "start_date", "end_date", "bullet_points"],
            },
          },
          projects: {
            type: "array",
            description:
              "Projets personnels ou entrepreneuriaux (création d'entreprise, association, projet bénévole…) — JAMAIS dans experiences. Section rendue APRÈS les expériences salariées. 0 à 3 projets, choisis parmi ceux du profil les plus pertinents pour l'offre, 2-3 puces chacun.",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                role: { type: ["string", "null"] },
                start_date: { type: ["string", "null"] },
                end_date: { type: ["string", "null"] },
                bullet_points: { type: "array", items: { type: "string" } },
              },
              required: ["name", "role", "start_date", "end_date", "bullet_points"],
            },
          },
          skill_groups: {
            type: "array",
            description:
              "Compétences organisées par section (4 à 8 sections), ex. « Langages », « Frontend », « Backend & API », « Bases de données », « DevOps & qualité », « IA appliquée », « Méthodes ». Chaque section : un libellé court et 5 à 15 compétences/outils, les plus pertinentes pour l'offre en premier. Au total 30 à 80 compétences, vise 50 ou plus : reprends presque toutes les compétences techniques du profil utiles pour l'offre ; le surplus sera retiré automatiquement s'il ne tient pas sur la page. Aucune compétence en double d'une section à l'autre.",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                items: { type: "array", items: { type: "string" } },
              },
              required: ["label", "items"],
            },
          },
          languages: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                level: { type: ["string", "null"] },
              },
              required: ["name", "level"],
            },
          },
        },
        required: ["experiences", "educations", "skill_groups", "languages"],
      },
    },
    required: ["identity", "headline", "summary", "sections"],
  },
} as const;

let _system: string | null = null;

/**
 * `lang` : langue du document (déduite de l'offre par défaut). Elle est
 * imposée au modèle, au validateur, à la relecture et aux templates.
 */
export async function generateCV(
  profile: ProfileFull,
  offre: OffreFiltered,
  lang: DocLang = detectDocLanguage(offre.title, offre.description_text, sourceLanguageHint(offre.source, offre.raw_payload), offre.country),
  /** CV déjà rendu mais incomplet : `freeLines` lignes vides à remplir (lib/pdf/fill.ts). */
  fill?: { current: GeneratedCV; freeLines: number }
): Promise<GeneratedCV> {
  if (!_system) _system = fs.readFileSync(path.join(process.cwd(), "prompts", "generate-cv.md"), "utf-8");
  // CV en anglais : le vocabulaire de compétences du profil (français) est
  // traduit une fois, en parallèle de la génération, pour que l'ancrage
  // anti-hallucination reconnaisse les compétences traduites par le modèle.
  const vocab =
    lang === "en"
      ? [...new Set([...profile.skills.map((s) => s.name), ...profile.experiences.flatMap((e) => e.skills_used ?? []), ...(profile.projects ?? []).flatMap((pr) => pr.skills_used ?? [])].filter(Boolean))]
      : [];
  const vocabPromise = vocab.length ? translateToEnglish(vocab, "profile-skills") : null;
  // Levier cache (même motif que score-offre.ts) : le profil vit dans un
  // 2ᵉ bloc system avec cache_control sur LES DEUX blocs — en mode pack, le
  // préfixe tools+prompt est partagé entre tous les utilisateurs via la clé
  // unique du proxy, et le profil est réutilisé d'une offre à l'autre pendant
  // un burst de candidatures. Le bloc user ne garde que l'offre + la consigne.
  const message = await callStructured({
    role: "writer",
    maxTokens: 4000,
    system: [
      { text: _system, cache: true },
      { text: `## Profil utilisateur\n${JSON.stringify(stripIds(profile), null, 2)}`, cache: true },
    ],
    tool: TOOL as unknown as StructuredTool,
    user: `${cvLanguageInstruction(lang)}

## Offre cible\n- Titre: ${offre.title}\n- Entreprise: ${offre.company}\n- Pays: ${offre.country ?? ""}\n- Description:\n${offre.description_text.slice(0, 6000)}\n\nGénère le CV optimisé${lang === "en" ? " — entièrement en anglais" : ""}.${
      fill
        ? `\n\n## CV actuel à compléter\n${JSON.stringify(fill.current)}\n\nLa page n'est pas pleine : il reste environ ${fill.freeLines} lignes vides. Renvoie le CV COMPLET en recopiant À L'IDENTIQUE tout l'existant (profil, intitulés, puces, chiffres et noms propres compris : ne reformule, ne raccourcis et ne supprime rien) et en y AJOUTANT uniquement, tirés UNIQUEMENT du profil, des éléments pertinents pour l'offre : puces supplémentaires d'expériences (jusqu'à 4 par poste), un projet de plus (3 au plus), une puce de formation, compétences manquantes, et de NOUVELLES SECTIONS de compétences si le profil les justifie et qu'elles manquent (obligatoire : « IA appliquée » dès que le profil a au moins 3 compétences d'IA/data ; sinon « Data & ML », « Cloud », « Tests & qualité »). Tu DOIS ajouter au moins ${Math.max(2, Math.floor(fill.freeLines / 2))} lignes de contenu nouveau (un CV renvoyé identique est refusé), sans dépasser ${fill.freeLines} lignes.`
        : ""
    }`,
  });
  assertNotTruncated(message, "le CV");
  if (!message.input)
    throw new AiContentError(
      "La réponse IA pour le CV est vide (aucun contenu structuré) — relancez la génération ; si cela se reproduit, choisissez un modèle plus capable dans Profil › Génération IA."
    );
  // Validation d'EXÉCUTION, jamais un cast nu : le proxy a déjà répondu 200 et
  // débité les points, un plantage ici serait payé sans rien livrer.
  const raw = parseGeneratedCV(message.input);
  // Anti-hallucination : strip companies/skills not anchored in the profile
  const vocabEn = vocabPromise ? await vocabPromise : [];
  // strict = la traduction a bien eu lieu ; sinon (échec silencieux du
  // traducteur) le validateur garde les compétences génériques avec avertissement.
  const validation = vocabEn.length
    ? { extraKnownSkills: vocabEn, strict: vocabEn.some((v, i) => v !== vocab[i]) }
    : {};
  const { cv: validated, report } = validateCVAgainstProfile(raw, profile, lang, validation);
  if (report.warnings.length > 0) {
    console.log(
      `[generateCV] anti-hallucination: ${report.stripped.experiences} exp + ${report.stripped.skills} skills supprimées`
    );
    for (const w of report.warnings) console.log(`  • ${w}`);
  }
  // Les sections ne gardent que les compétences que le validateur a conservées.
  const kept = new Set(validated.sections.skills_flat);
  const skill_groups = (validated.sections.skill_groups ?? [])
    .map((g) => ({ label: g.label, items: g.items.filter((s) => kept.has(s)) }))
    .filter((g) => g.items.length > 0);
  // Relecture (orthographe, accords, typographie, faits non étayés) — jamais bloquante.
  return proofreadCV(
    enforceAtsLimits({ ...validated, sections: { ...validated.sections, skill_groups } }, profile),
    profile,
    lang
  );
}

const SKILLS_TOOL = {
  name: "build_skills",
  description: "Renvoie les sections de compétences complétées.",
  input_schema: {
    type: "object",
    properties: {
      skill_groups: {
        type: "array",
        items: {
          type: "object",
          properties: { label: { type: "string" }, items: { type: "array", items: { type: "string" } } },
          required: ["label", "items"],
        },
      },
    },
    required: ["skill_groups"],
  },
} as const;

/**
 * Enrichit les sections de compétences d'un CV qui a encore de la place : sections
 * adaptées à l'offre (nouvelles sections comprises), garnies avec les compétences
 * du profil pas encore affichées. Retourne les sections complètes, filtrées par le
 * validateur anti-invention (jamais de compétence absente du profil). L'ajustement
 * à la page est fait par l'appelant (lib/pdf/fill.ts).
 */
export async function expandSkills(
  profile: ProfileFull,
  offre: OffreFiltered,
  lang: DocLang,
  current: GeneratedCV,
  freeLines: number
): Promise<{ label: string; items: string[] }[]> {
  const groups = current.sections.skill_groups ?? [];
  const shown = new Set(groups.flatMap((g) => g.items.map((i) => i.toLowerCase())));
  // Compétences techniques du profil pas encore affichées (les soft skills creuses restent exclues).
  const remaining = profile.skills
    .filter((sk) => sk.category !== "soft" && !shown.has(sk.name.toLowerCase()))
    .map((sk) => ({ name: sk.name, anchored: isAnchoredSkill(profile, sk) }));
  if (!remaining.length) return groups;

  const vocab =
    lang === "en"
      ? [...new Set([...profile.skills.map((x) => x.name), ...profile.experiences.flatMap((e) => e.skills_used ?? []), ...(profile.projects ?? []).flatMap((pr) => pr.skills_used ?? [])].filter(Boolean))]
      : [];
  const vocabEn = vocab.length ? await translateToEnglish(vocab, "profile-skills") : [];

  const message = await callStructured({
    role: "writer",
    maxTokens: 3000,
    system: [
      {
        text: "Tu enrichis la section COMPÉTENCES d'un CV. Tu renvoies TOUTES les sections (celles qui existent, en gardant leurs compétences, plus les ajouts), via l'outil `build_skills`. Règles : (1) tu n'ajoutes que des compétences de la liste « disponibles », jamais d'autres ; (2) tu peux créer de nouvelles sections pertinentes pour l'offre (ex. « IA appliquée », « Data & ML », « Cloud », « Tests & qualité », « Architecture ») et ranger les compétences dans la section la plus juste ; (3) une compétence n'apparaît que dans une section ; (4) ordre : sections les plus pertinentes pour l'offre d'abord, et dans chaque section les compétences les plus pertinentes d'abord ; (5) AJOUTE AUTANT de compétences disponibles que possible : elles sont toutes vraies, la place est libre ; commence par celles que l'offre mentionne ou qui sont ancrées ; (6) libellés courts, 6 à 8 sections au plus ; (7) AUCUN quasi-doublon, y compris entre sections : garde la forme la plus complète (« MQ Series » sans « MQ », « Swagger / OpenAPI » sans « Swagger », « HTML/CSS » sans « HTML » ni « CSS », « Tests unitaires (JUnit) » sans « JUnit ») ; (8) uniquement des outils, technologies, méthodes ou domaines techniques, jamais une activité (« Développement full stack ») ni un mot vague (« Cloud » seul).",
      },
    ],
    tool: SKILLS_TOOL as unknown as StructuredTool,
    user: `${cvLanguageInstruction(lang)}

## Offre cible
- Titre: ${offre.title}
- Description:
${offre.description_text.slice(0, 4000)}

## Sections actuelles
${JSON.stringify(groups)}

## Compétences disponibles (à ajouter)
${JSON.stringify(remaining)}

Il reste environ ${freeLines} lignes libres : remplis-les.`,
  });
  assertNotTruncated(message, "les compétences");
  const raw = parseGeneratedCV({
    ...current,
    sections: { ...current.sections, skill_groups: (message.input as { skill_groups?: unknown })?.skill_groups },
  });
  const validation = vocabEn.length
    ? { extraKnownSkills: vocabEn, strict: vocabEn.some((v, i) => v !== vocab[i]) }
    : {};
  const { cv: validated } = validateCVAgainstProfile(raw, profile, lang, validation);
  const kept = new Set(validated.sections.skills_flat);
  return (raw.sections.skill_groups ?? [])
    .map((g) => ({ label: g.label, items: [...new Set(g.items.filter((i) => kept.has(i)))] }))
    .filter((g) => g.items.length > 0);
}

/**
 * Hard guards to keep the CV on a single page even if the model overshoots the prompt limits.
 * - Max 4 experiences (most recent first; the model already sorts but we re-sort defensively)
 * - Max 3 bullet points per experience
 * - Max 3 educations
 * - Summary trimmed to ~55 words
 */
function enforceAtsLimits(cv: GeneratedCV, profile: ProfileFull): GeneratedCV {
  const sortedExp = [...cv.sections.experiences].sort(compareRecentFirst);
  const experiences = sortedExp.slice(0, 4).map((e) => ({
    ...e,
    bullet_points: (e.bullet_points ?? []).slice(0, 4),
  }));
  // Formation sans puces (elles répétaient le diplôme) ; le lieu vient du profil.
  const norm = (v: string) => v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const educations = [...cv.sections.educations].sort(compareRecentFirst).slice(0, 3).map((e) => {
    const known = profile.educations.find((k) => norm(k.school).includes(norm(e.school)) || norm(e.school).includes(norm(k.school)));
    return { ...e, location: known?.location ?? null, bullet_points: [] };
  });

  let summary = cv.summary ?? "";
  const words = summary.split(/\s+/);
  if (words.length > 90) summary = words.slice(0, 90).join(" ").replace(/[,;:]?$/, "") + ".";

  // 8 sections de 15 compétences au plus ; skills_flat reste l'aplatissement des sections.
  const skill_groups = (cv.sections.skill_groups ?? []).slice(0, 8).map((g) => ({ ...g, items: g.items.slice(0, 15) }));
  const skills_flat = skill_groups.length
    ? skill_groups.flatMap((g) => g.items)
    : (cv.sections.skills_flat ?? []).slice(0, 25);
  // Projets personnels : au plus trois, 3 puces chacun — il ne doit jamais évincer une expérience salariée.
  const projects = (cv.sections.projects ?? []).slice(0, 3).map((p) => ({
    ...p,
    bullet_points: (p.bullet_points ?? []).slice(0, 3),
  }));

  return {
    ...cv,
    summary,
    sections: {
      ...cv.sections,
      experiences,
      educations,
      skills_flat,
      skill_groups,
      projects,
    },
  };
}

function stripIds(p: ProfileFull) {
  return {
    identity: {
      full_name: p.full_name,
      email: p.email,
      phone: p.phone,
      location: p.location,
      linkedin_url: p.linkedin_url,
      portfolio_url: p.portfolio_url,
    },
    summary: p.summary,
    experiences: p.experiences.map((e) => ({
      title: e.title,
      company: e.company,
      location: e.location,
      start_date: e.start_date,
      end_date: e.end_date,
      description: e.description,
      bullet_points: e.bullet_points,
      skills_used: e.skills_used,
    })),
    educations: p.educations,
    projects: (p.projects ?? []).map((pr) => ({
      name: pr.name,
      role: pr.role,
      url: pr.url,
      start_date: pr.start_date,
      end_date: pr.end_date,
      description: pr.description,
      bullet_points: pr.bullet_points,
      skills_used: pr.skills_used,
    })),
    skills: p.skills.map((s) => ({
      name: s.name,
      category: s.category,
      level: s.level,
      anchored: isAnchoredSkill(p, s),
    })),
    languages: p.languages,
  };
}
