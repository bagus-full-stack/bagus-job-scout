// Profondeur de recherche : nombre de pages de résultats parcourues par recherche et par source (réglage Profil › Recherche).
export const PAGES_MIN = 1;
export const PAGES_MAX = 10;
export const PAGES_DEFAULT = 5;
/** Profondeur pour laquelle les plafonds d'offres d'origine des scrapers ont été fixés. */
const PAGES_BASE = 3;

export function clampPages(n: unknown): number {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) ? Math.max(PAGES_MIN, Math.min(PAGES_MAX, v)) : PAGES_DEFAULT;
}

export const pagesOf = (c: { pages?: number }): number => clampPages(c.pages ?? PAGES_DEFAULT);

/** Plafond d'offres par source : un `maxOffres` explicite, sinon le plafond d'origine proportionnel à la profondeur. */
export const capOf = (c: { pages?: number; maxOffres?: number }, base: number): number =>
  c.maxOffres ?? Math.max(1, Math.round((base * pagesOf(c)) / PAGES_BASE));
