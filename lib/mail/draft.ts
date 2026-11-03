import type { DocLang } from "@/lib/text/lang";

/** Début du résumé du profil (deux phrases au plus, 300 caractères) : la personne en quelques mots, sans rien inventer. */
export function shortIntro(summary: string | null | undefined): string {
  const text = (summary ?? "").replace(/\s+/g, " ").trim();
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [];
  let out = "";
  for (const sentence of sentences.slice(0, 2)) {
    if ((out + sentence).trim().length > 300) break;
    out += sentence;
  }
  return (out || text.slice(0, 300)).trim();
}

const CONTRACT_LABELS: Record<string, string> = { cdi: "CDI", cdd: "CDD", stage: "stage", alternance: "alternance", vie: "V.I.E", freelance: "freelance", interim: "intérim" };

/** Contrats recherchés, d'après le profil : « CDI ou CDD ». */
export function contractsText(contracts: string[] | undefined, lang: DocLang): string {
  const labels = (contracts ?? []).map((c) => CONTRACT_LABELS[c.toLowerCase()] ?? c).filter(Boolean);
  return labels.join(lang === "en" ? " or " : " ou ");
}

/** Relance d'une candidature restée sans réponse : courte, sans reproche, sans accord de genre. */
export function followUpDraft(args: { lang: DocLang; title: string; company: string; fullName: string; sentOn: string }) {
  const { lang, title, company, fullName, sentOn } = args;
  return lang === "en"
    ? {
        subject: `Follow-up – ${title} – ${fullName}`,
        body: `Dear Hiring Manager,\n\nI am following up on my application for the ${title} position at ${company}, sent on ${sentOn}. My application remains current, and I would be glad to discuss it at your convenience.\n\nBest regards,\n${fullName}`,
      }
    : {
        subject: `Relance – candidature ${title} – ${fullName}`,
        body: `Madame, Monsieur,\n\nJe me permets de revenir vers vous au sujet de ma candidature au poste de ${title} au sein de ${company}, envoyée le ${sentOn}. Elle reste d'actualité, et je me tiens à votre disposition pour en échanger.\n\nCordialement,\n${fullName}`,
      };
}

/** Mail d'accompagnement : court et factuel, le fond est dans la lettre jointe. */
export function mailDraft(args: {
  lang: DocLang;
  title: string;
  company: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  /** Contact importé d'un fichier : pas d'offre, le poste est celui que le candidat vise. */
  spontaneous?: boolean;
  /** Profil du candidat : présente la personne et ce qu'elle cherche dans une candidature spontanée. */
  profile?: { summary?: string | null; location?: string | null; portfolio_url?: string | null; preferred_contracts?: string[] } | null;
}) {
  const { lang, title, company, fullName } = args;
  const contact = [args.phone, args.email, args.profile?.location].filter(Boolean).join(" | ");
  if (args.spontaneous) {
    const about = shortIntro(args.profile?.summary);
    const contracts = contractsText(args.profile?.preferred_contracts, lang);
    const portfolio = args.profile?.portfolio_url?.trim();
    return lang === "en"
      ? {
          subject: `Unsolicited application – ${title} – ${fullName}`,
          body: [
            "Dear Hiring Manager,",
            `I am writing to submit an unsolicited application for a ${title} position at ${company}.`,
            [about && `About me: ${about}`, `I am looking for a ${title} role${contracts ? ` (${contracts})` : ""}.`].filter(Boolean).join("\n"),
            "Please find attached my résumé and cover letter, which detail my background.",
            "I would be glad to discuss how I could contribute to your team.",
            `Best regards,\n${fullName}${contact ? `\n${contact}` : ""}${portfolio ? `\nPortfolio: ${portfolio}` : ""}`,
          ].join("\n\n"),
        }
      : {
          subject: `Candidature spontanée – ${title} – ${fullName}`,
          body: [
            "Madame, Monsieur,",
            `Je me permets de vous adresser ma candidature spontanée pour un poste de ${title} au sein de ${company}.`,
            [about && `Mon profil : ${about}`, `Je recherche un poste de ${title}${contracts ? ` (${contracts})` : ""}.`].filter(Boolean).join("\n"),
            "Vous trouverez ci-joints mon CV et ma lettre de motivation, qui détaillent mon parcours.",
            "Je reste à votre disposition pour échanger sur ce que je pourrais apporter à votre équipe.",
            `Cordialement,\n${fullName}${contact ? `\n${contact}` : ""}${portfolio ? `\nPortfolio : ${portfolio}` : ""}`,
          ].join("\n\n"),
        };
  }
  if (lang === "en")
    return {
      subject: `Application – ${title} – ${fullName}`,
      body: `Dear Hiring Manager,\n\nPlease find attached my résumé and cover letter for the ${title} position at ${company}.\n\nI would be glad to discuss my application in an interview.\n\nBest regards,\n${fullName}${contact ? `\n${contact}` : ""}`,
    };
  return {
    subject: `Candidature – ${title} – ${fullName}`,
    body: `Madame, Monsieur,\n\nJe vous adresse ma candidature au poste de ${title} au sein de ${company}. Vous trouverez ci-joints mon CV et ma lettre de motivation.\n\nJe reste disponible pour échanger lors d'un entretien.\n\nCordialement,\n${fullName}${contact ? `\n${contact}` : ""}`,
  };
}
