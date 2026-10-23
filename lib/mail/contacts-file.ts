import { findApplyEmail } from "./contact";

// Source des candidatures spontanées : les offres importées d'un fichier de contacts portent cette source.
export const SPONTANEOUS_SOURCE = "spontanee";

export type Contact = { email: string; company: string };

// Messageries grand public : le domaine ne dit rien de l'entreprise.
const FREE_MAIL = /^(gmail|googlemail|outlook|hotmail|live|msn|yahoo|ymail|icloud|me|proton|protonmail|orange|wanadoo|free|sfr|laposte|neuf|bbox)\./i;

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Lit un fichier de contacts (CSV, TSV ou texte, une ligne par contact). La première
 * cellule contenant une adresse valide est le destinataire ; la première autre cellule
 * non vide est le nom de l'entreprise, à défaut le domaine de l'adresse. Les lignes sans
 * adresse (en-tête, vide) et les doublons sont ignorés.
 */
export function parseContacts(text: string): Contact[] {
  const seen = new Set<string>();
  const out: Contact[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split(/[;,\t]/).map((c) => c.trim().replace(/^["']|["']$/g, "").trim());
    const idx = cells.findIndex((c) => findApplyEmail(c));
    if (idx < 0) continue;
    const email = findApplyEmail(cells[idx])!;
    if (seen.has(email)) continue;
    seen.add(email);
    const domain = email.split("@")[1];
    const other = cells.find((c, i) => i !== idx && c && !findApplyEmail(c));
    const company = other || (FREE_MAIL.test(domain) ? email : titleCase(domain.split(".")[0]));
    out.push({ email, company });
  }
  return out;
}
