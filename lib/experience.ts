// Expérience demandée par une offre, lue dans son intitulé et son texte (français et anglais).
// Heuristique : une annonce n'a pas de champ « expérience » ; `null` = rien de précis n'est indiqué.

export type Experience = { min: number; max: number | null };

function strip(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const YEARS = String.raw`(?:ans?|annees?|years?|yrs?)`;
const EXP = String.raw`(?:d['’ ]?\s*experience|of\s+(?:\w+\s+){0,3}experience|experience|exp\b)`;
const NUM = String.raw`(\d{1,2})`;
const MIN_WORD = String.raw`(?:au\s+moins|minimum|min\.?|plus\s+de|a\s+partir\s+de|at\s+least|over|more\s+than|minimum\s+of)`;

// Une tranche « 2 à 5 ans », « 2-5 ans », « 2 to 5 years », suivie ou précédée du mot expérience.
const RANGE = new RegExp(String.raw`${NUM}\s*(?:a|-|–|—|to|et)\s*${NUM}\s*\+?\s*${YEARS}\b(?:\s*${EXP})?`);
// Un minimum : « 3 ans d'expérience », « au moins 3 ans », « 3+ years », « 3 ans minimum ».
const SINGLE = new RegExp(String.raw`(?:${MIN_WORD}\s*)?${NUM}\s*(\+)?\s*${YEARS}\b(\s*(?:${EXP}|minimum|min\b|et\s+plus|ou\s+plus|mini\b|or\s+more))?`);

const NEAR_EXP = new RegExp(EXP);

/** Une expérience est demandée si le texte dit « N ans » à côté du mot expérience (évite « 20 ans d'existence »). */
function near(text: string, index: number, length: number): boolean {
  return NEAR_EXP.test(text.slice(Math.max(0, index - 45), index + length + 45));
}

export function extractExperience(title: string, text: string): Experience | null {
  const t = strip(text);
  const range = RANGE.exec(t);
  if (range && near(t, range.index, range[0].length)) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (a <= b && b <= 40) return { min: a, max: b };
  }
  // Premier « N ans » proche du mot expérience, dans l'ordre du texte.
  const re = new RegExp(SINGLE.source, "g");
  for (let m = re.exec(t); m; m = re.exec(t)) {
    const n = Number(m[1]);
    if (n > 40 || !near(t, m.index, m[0].length)) continue;
    return { min: n, max: null };
  }
  const head = `${strip(title)} ${t.slice(0, 600)}`;
  if (/\b(debutants?\s+accepte|sans\s+experience|no\s+experience\s+required|entry[\s-]level|jeunes?\s+diplome|graduate\s+program|premiere\s+experience)/.test(head)) return { min: 0, max: 1 };
  if (/\b(junior|jr\.?)\b/.test(strip(title))) return { min: 0, max: 2 };
  if (/\b(senior|sr\.?|lead|principal|staff|expert|confirme)\b/.test(strip(title))) return { min: 5, max: null };
  return null;
}

/** L'offre convient-elle à quelqu'un qui a entre `from` et `to` ans d'expérience ? Sa fourchette doit chevaucher la vôtre. */
export function experienceMatches(exp: Experience, from: number, to: number): boolean {
  return exp.min <= to && (exp.max === null || exp.max >= from);
}

export function experienceLabel(exp: Experience): string {
  if (exp.max === null) return exp.min === 0 ? "Débutant accepté" : `${exp.min} ans et plus`;
  return exp.min === exp.max ? `${exp.min} an${exp.min > 1 ? "s" : ""}` : `${exp.min} à ${exp.max} ans`;
}
