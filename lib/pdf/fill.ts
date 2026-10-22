import "server-only";
import * as React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { CVDocument, CV_FONT_SIZES } from "./cv-template";
import { fitCVToOnePage, pdfPageCount } from "./render";
import { generateCV, type GeneratedCV } from "@/lib/ai/generate-cv";
import type { ProfileFull } from "@/lib/cv/types";
import type { OffreFiltered } from "@/lib/db/offres";
import type { DocLang } from "@/lib/text/lang";

// Place libre (pt) mesurée à cette taille de police : au-delà de MIN_FREE, une page
// « pas pleine » vaut une demande de complément à l'IA.
const REF_FONT = 10;
const MIN_FREE = 30;
const MAX_ROUNDS = 3;

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
 * précédent reste valide.
 */
export async function fitAndFillCV(
  cv: GeneratedCV,
  ctx: { profile: ProfileFull; offre: OffreFiltered; lang: DocLang }
): Promise<{ pdf: Buffer; cv: GeneratedCV; fontSize: number }> {
  let current = cv;
  let free = await freeSpace(current, ctx.lang);
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
    if ((await pagesAt(next, ctx.lang, CV_FONT_SIZES[0])) > 1) break;
    const nextFree = await freeSpace(next, ctx.lang);
    if (nextFree > free - 6) break; // rien d'ajouté
    current = next;
    free = nextFree;
  }
  return fitCVToOnePage(current, ctx.lang);
}
