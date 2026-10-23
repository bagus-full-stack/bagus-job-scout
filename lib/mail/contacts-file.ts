import { findApplyEmail } from "./contact";

// Source des candidatures spontanées : les offres importées d'un fichier de contacts portent cette source.
export const SPONTANEOUS_SOURCE = "spontanee";

export type Contact = { email: string; company: string };

// Messageries grand public : le domaine ne dit rien de l'entreprise.
const FREE_MAIL = /^(gmail|googlemail|outlook|hotmail|live|msn|yahoo|ymail|icloud|me|proton|protonmail|orange|wanadoo|free|sfr|laposte|neuf|bbox)\./i;

const COMPANY_HEADER = /^(entreprise|soci[ée]t[ée]|company|organi[sz]ation|organisme|nom)$/i;

const titleCase =(s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Lit un fichier de contacts (CSV, TSV ou texte, une ligne par contact). La première
 * cellule contenant une adresse valide est le destinataire ; la première autre cellule
 * non vide est le nom de l'entreprise, à défaut le domaine de l'adresse. Les lignes sans
 * adresse (en-tête, vide) et les doublons sont ignorés.
 */
export function parseContacts(text: string): Contact[] {
  const seen = new Set<string>();
  const out: Contact[] = [];
  // Colonne « entreprise » repérée par l'en-tête (ligne sans adresse), sinon première cellule textuelle.
  let companyCol = -1;
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split(/[;,\t]/).map((c) => c.trim().replace(/^["']|["']$/g, "").trim());
    if (!cells.some((c) => findApplyEmail(c))) {
      const col = cells.findIndex((c) => COMPANY_HEADER.test(c));
      if (col >= 0) companyCol = col;
      continue;
    }
    // Une ligne peut porter plusieurs adresses (une par colonne) : chacune est un contact.
    // Les cellules purement numériques (n° de ligne) ne sont jamais un nom d'entreprise.
    const other =
      (companyCol >= 0 && cells[companyCol] && !findApplyEmail(cells[companyCol]) ? cells[companyCol] : "") ||
      cells.find((c) => c && !findApplyEmail(c) && !/^\d+$/.test(c));
    for (const cell of cells) {
      const email = findApplyEmail(cell);
      if (!email || seen.has(email)) continue;
      seen.add(email);
      const domain = email.split("@")[1];
      out.push({ email, company: other || (FREE_MAIL.test(domain) ? email : titleCase(domain.split(".")[0])) });
    }
  }
  return out;
}
