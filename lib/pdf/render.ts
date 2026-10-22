import "server-only";
import * as React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { CVDocument, LMDocument, CV_FONT_SIZES } from "./cv-template";
import { compareRecentFirst } from "@/lib/ai/cv-shape";
import type { GeneratedCV } from "@/lib/ai/generate-cv";
import type { GeneratedLM } from "@/lib/ai/generate-lm";
import type { DocLang } from "@/lib/text/lang";

// Compte les objets /Type /Page du PDF produit par react-pdf. pdf-parse échouait
// sans bruit dans le serveur (le catch renvoyait 1), donc un CV de 2 pages passait
// pour une page et n'était jamais réduit.
export async function pdfPageCount(buf: Buffer): Promise<number> {
  return Math.max(1, (buf.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length);
}

// =============================================================
// CV — render with 1-page guard (progressive shrinking)
// =============================================================

function shrinkCV(cv: GeneratedCV, level: number): GeneratedCV {
  const expCap = Math.max(2, 4 - level);
  const bulletCap = Math.max(2, 4 - level);
  const eduCap = Math.max(1, 3 - level);
  const skillsCap = Math.max(10, 25 - level * 4);
  const summaryWords = Math.max(35, 90 - level * 18);
  const eduBulletCap = Math.max(0, 2 - level);

  // Même comparateur que generate-cv : les dates arrivent en MM/AAAA, pas en ISO.
  const sortedExp = [...cv.sections.experiences].sort(compareRecentFirst);

  const experiences = sortedExp.slice(0, expCap).map((e) => ({
    ...e,
    bullet_points: (e.bullet_points ?? [])
      .slice(0, bulletCap)
      .map((b) => trimSentence(b, level)),
  }));
  const educations = cv.sections.educations.slice(0, eduCap).map((e) => ({
    ...e,
    bullet_points: (e.bullet_points ?? []).slice(0, eduBulletCap),
  }));
  let summary = cv.summary ?? "";
  const words = summary.split(/\s+/);
  if (words.length > summaryWords) {
    summary = words.slice(0, summaryWords).join(" ").replace(/[,;:]?$/, "") + ".";
  }
  const skill_groups = (cv.sections.skill_groups ?? []).map((g) => ({
    ...g,
    items: g.items.slice(0, Math.max(4, 10 - level * 2)),
  }));
  const skills_flat = skill_groups.length
    ? skill_groups.flatMap((g) => g.items)
    : (cv.sections.skills_flat ?? []).slice(0, skillsCap);
  // Le projet personnel est le premier sacrifié quand la page déborde.
  const projects = (cv.sections.projects ?? [])
    .slice(0, level >= 3 ? 0 : 1)
    .map((p) => ({ ...p, bullet_points: (p.bullet_points ?? []).slice(0, Math.max(1, 3 - level)) }));

  return {
    ...cv,
    summary,
    sections: { ...cv.sections, experiences, educations, skills_flat, skill_groups, projects },
  };
}

function trimSentence(s: string, level: number): string {
  if (level < 2) return s;
  // For aggressive shrinking, hard cap at ~140 chars
  const max = level >= 3 ? 110 : 140;
  if (s.length <= max) return s;
  // Cut at last word boundary before max
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 60 ? cut.slice(0, lastSpace) : cut).trim() + "…";
}

/**
 * Renders CV to PDF. Le contenu complet est d'abord rendu avec la plus grande
 * taille de police qui tient sur une page (pas de vide en bas) ; si même la plus
 * petite déborde, le contenu est réduit progressivement.
 * Returns the buffer, the final cv data AND the font size used (so DOCX matches).
 */
export async function fitCVToOnePage(
  cv: GeneratedCV,
  language: DocLang = "fr"
): Promise<{ pdf: Buffer; cv: GeneratedCV; fontSize: number }> {
  const render = (c: GeneratedCV, fontSize: number) =>
    renderToBuffer(React.createElement(CVDocument, { cv: c, language, fontSize }) as any);
  const fits = async (c: GeneratedCV, fontSize: number) => (await pdfPageCount(await render(c, fontSize))) <= 1;
  const smallest = CV_FONT_SIZES[0];
  let current = cv;
  for (let level = 0; level < 4; level++) {
    if (await fits(current, smallest)) {
      // Plus grande taille qui tient (la mise en page croît avec la taille : recherche dichotomique).
      let lo = 0;
      let hi = CV_FONT_SIZES.length - 1;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (await fits(current, CV_FONT_SIZES[mid])) lo = mid;
        else hi = mid - 1;
      }
      return { pdf: await render(current, CV_FONT_SIZES[lo]), cv: current, fontSize: CV_FONT_SIZES[lo] };
    }
    current = shrinkCV(current, level + 1);
  }
  // Last resort : contenu réduit au maximum, police sous le minimum jusqu'à tenir sur une page.
  const final = shrinkCV(current, 4);
  for (const fontSize of [smallest, 8, 7.5]) {
    if (await fits(final, fontSize)) return { pdf: await render(final, fontSize), cv: final, fontSize };
  }
  return { pdf: await render(final, 7.5), cv: final, fontSize: 7.5 };
}

export async function renderCVPdf(cv: GeneratedCV, language: DocLang = "fr"): Promise<Buffer> {
  const { pdf } = await fitCVToOnePage(cv, language);
  return pdf;
}

// =============================================================
// LM — render with 1-page guard
// =============================================================

function shrinkLM(lm: GeneratedLM, level: number): GeneratedLM {
  // Trim each paragraph to a fraction of original length
  const factor = Math.max(0.55, 1 - level * 0.18);
  const paragraphs = lm.body_paragraphs.map((p) => {
    const words = p.split(/\s+/).filter(Boolean);
    const target = Math.max(20, Math.floor(words.length * factor));
    if (words.length <= target) return p;
    const cut = words.slice(0, target).join(" ").replace(/[,;:]?$/, "");
    return cut.endsWith(".") || cut.endsWith("!") || cut.endsWith("?") ? cut : cut + ".";
  });
  return { ...lm, body_paragraphs: paragraphs };
}

export async function fitLMToOnePage(args: {
  identity: GeneratedCV["identity"];
  company: string;
  companyLocation?: string | null;
  lm: GeneratedLM;
  language?: DocLang;
}): Promise<{ pdf: Buffer; lm: GeneratedLM }> {
  let current = args.lm;
  for (let level = 0; level < 4; level++) {
    const buf = await renderToBuffer(
      React.createElement(LMDocument, {
        identity: args.identity,
        recipient: { company: args.company, location: args.companyLocation ?? null },
        object: current.object,
        body_paragraphs: current.body_paragraphs,
        language: args.language ?? "fr",
      }) as any
    );
    const pages = await pdfPageCount(buf);
    if (pages <= 1) return { pdf: buf, lm: current };
    current = shrinkLM(current, level + 1);
  }
  const final = shrinkLM(current, 4);
  const buf = await renderToBuffer(
    React.createElement(LMDocument, {
      identity: args.identity,
      recipient: { company: args.company, location: args.companyLocation ?? null },
      object: final.object,
      body_paragraphs: final.body_paragraphs,
      language: args.language ?? "fr",
    }) as any
  );
  return { pdf: buf, lm: final };
}

export async function renderLMPdf(args: {
  identity: GeneratedCV["identity"];
  company: string;
  lm: GeneratedLM;
}): Promise<Buffer> {
  const { pdf } = await fitLMToOnePage(args);
  return pdf;
}
