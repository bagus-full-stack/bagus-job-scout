import "server-only";
import * as React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { CVDocument, CV_FONT_SIZES } from "./cv-template";
import { fitCVToOnePage, pdfPageCount } from "./render";
import { generateCV, expandSkills, type GeneratedCV } from "@/lib/ai/generate-cv";
import { translateToEnglish } from "@/lib/ai/proofread";
import type { ProfileFull } from "@/lib/cv/types";
import type { OffreFiltered } from "@/lib/db/offres";
import type { DocLang } from "@/lib/text/lang";

// Place libre (pt) mesurée à cette taille de police : au-delà de MIN_FREE, une page
// « pas pleine » vaut une demande de complément à l'IA.
const REF_FONT = 10;
const MIN_FREE = 30;
const MAX_ROUNDS = 3;
const MIN_FREE_SKILLS = 15;

const pagesAt = async (cv: GeneratedCV, lang: DocLang, fontSize: number, probe = 0) =>
  pdfPageCount(await renderToBuffer(React.createElement(CVDocument, { cv, language: lang, fontSize, probe }) as any));

/** Hauteur libre en bas de page (pt), par dichotomie avec un espaceur ; 0 si le CV déborde déjà. */
async function freeSpace(cv: GeneratedCV, lang: DocLang): Promise<number> {
  if ((await pagesAt(cv, lang, REF_FONT)) > 1) return 0;
  let lo = 0;
  let hi = 700;
  while (hi - lo > 6) {
    const mid = (lo + hi) / 2;
    if ((await pagesAt(cv, lang, REF_FONT, mid)) <= 1) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Tant que la page n'est pas remplie, redemande à l'IA d'ajouter des éléments
 * pertinents du profil (3 tours au plus), puis ajuste la police sur une page.
 * Un complément qui déborde, échoue ou n'ajoute rien est abandonné : le CV
 * précédent reste valide (un tour perdu, puis nouvel essai).
 */
export async function fitAndFillCV(
  cv: GeneratedCV,
  ctx: { profile: ProfileFull; offre: OffreFiltered; lang: DocLang }
): Promise<{ pdf: Buffer; cv: GeneratedCV; fontSize: number }> {
  let current = cv;
  let free = await freeSpace(current, ctx.lang);
  console.log(`[fillCV] place libre ${Math.round(free)} pt`);
  for (let round = 0; round < MAX_ROUNDS && free >= MIN_FREE; round++) {
    let next: GeneratedCV;
    try {
      next = await generateCV(ctx.profile, ctx.offre, ctx.lang, {
        current,
        freeLines: Math.floor(free / (REF_FONT * 1.22)),
      });
    } catch (e) {
      console.error("[fillCV] complément IA ignoré :", e);
      break;
    }
    // Complément qui déborde ou qui n'ajoute rien : on garde l'ancien CV et on redemande.
    if ((await pagesAt(next, ctx.lang, CV_FONT_SIZES[0])) > 1) {
      console.log(`[fillCV] tour ${round + 1} : complément trop long, ignoré`);
      continue;
    }
    const nextFree = await freeSpace(next, ctx.lang);
    if (nextFree > free - 6) {
      console.log(`[fillCV] tour ${round + 1} : rien d'ajouté (${Math.round(nextFree)} pt libres), ignoré`);
      continue;
    }
    current = next;
    free = nextFree;
    console.log(`[fillCV] tour ${round + 1} : place libre ${Math.round(free)} pt`);
  }
  current = await fillSkills(current, free, ctx);
  return fitCVToOnePage(current, ctx.lang);
}

const withGroups = (cv: GeneratedCV, skill_groups: { label: string; items: string[] }[]): GeneratedCV => ({
  ...cv,
  sections: { ...cv.sections, skill_groups, skills_flat: skill_groups.flatMap((g) => g.items) },
});

/**
 * Enrichit la section compétences tant qu'il reste de la place : sections adaptées à
 * l'offre, garnies des compétences du profil. Les ajouts sont retirés (derniers
 * d'abord) jusqu'à ce que le CV tienne sur une page à la taille de référence.
 */
async function fillSkills(
  cv: GeneratedCV,
  free: number,
  ctx: { profile: ProfileFull; offre: OffreFiltered; lang: DocLang }
): Promise<GeneratedCV> {
  if (free < MIN_FREE_SKILLS) return cv;
  let proposed: { label: string; items: string[] }[];
  try {
    proposed = await expandSkills(ctx.profile, ctx.offre, ctx.lang, cv, Math.floor(free / (REF_FONT * 1.22)));
  } catch (e) {
    console.error("[fillCV] enrichissement des compétences ignoré :", e);
    return cv;
  }
  // CV en anglais : les compétences ajoutées viennent du profil (français) et les libellés
  // de sections sont ceux du modèle ; tout est passé par le traducteur, comme à la génération.
  if (ctx.lang === "en") {
    const texts = [...new Set(proposed.flatMap((g) => [g.label, ...g.items]))];
    const tr = await translateToEnglish(texts, "cv-skills");
    const map = new Map(texts.map((t, i) => [t, tr[i] ?? t]));
    proposed = proposed.map((g) => ({
      label: map.get(g.label) ?? g.label,
      items: [...new Set(g.items.map((i) => map.get(i) ?? i))],
    }));
  }
  const had = new Set((cv.sections.skill_groups ?? []).flatMap((g) => g.items.map((i) => i.toLowerCase())));
  // Ajouts classés par rang dans leur section puis par section : on en retire de façon équilibrée.
  const added = proposed
    .flatMap((g, gi) => g.items.map((item, ii) => ({ gi, ii, item })).filter((x) => !had.has(x.item.toLowerCase())))
    .sort((x, y) => x.ii - y.ii || x.gi - y.gi);
  const build = (keep: number) => {
    const dropped = new Set(added.slice(keep).map((x) => x.item));
    return withGroups(
      cv,
      proposed.map((g) => ({ ...g, items: g.items.filter((i) => !dropped.has(i)) })).filter((g) => g.items.length > 0)
    );
  };
  let lo = 0;
  let hi = added.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if ((await pagesAt(build(mid), ctx.lang, REF_FONT)) <= 1) lo = mid;
    else hi = mid - 1;
  }
  console.log(`[fillCV] compétences : ${lo}/${added.length} ajouts retenus`);
  return lo > 0 ? build(lo) : cv;
}
