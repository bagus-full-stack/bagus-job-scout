/**
 * Texte avec mots-clés en gras balisés `**mot**` (le modèle marque technologies et
 * chiffres, comme sur le CV LaTeX de référence). Client-safe, partagé PDF/DOCX.
 */
export function splitBold(text: string): { text: string; bold: boolean }[] {
  return text
    .split(/\*\*(.+?)\*\*/g)
    .map((t, i) => ({ text: t, bold: i % 2 === 1 }))
    .filter((p) => p.text);
}

/** Retire les balises (texte brut : relecture, comptage, formats sans gras). */
export const stripBold = (text: string): string => text.replace(/\*\*(.+?)\*\*/g, "$1");
