import type { DocLang } from "@/lib/text/lang";

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
}) {
  const { lang, title, company, fullName } = args;
  const contact = [args.phone, args.email].filter(Boolean).join(" | ");
  if (args.spontaneous)
    return lang === "en"
      ? {
          subject: `Unsolicited application – ${title} – ${fullName}`,
          body: `Dear Hiring Manager,\n\nI am writing to submit an unsolicited application for a ${title} position at ${company}. Please find attached my résumé and cover letter.\n\nI would be glad to discuss how I could contribute to your team.\n\nBest regards,\n${fullName}${contact ? `\n${contact}` : ""}`,
        }
      : {
          subject: `Candidature spontanée – ${title} – ${fullName}`,
          body: `Madame, Monsieur,\n\nJe me permets de vous adresser ma candidature spontanée pour un poste de ${title} au sein de ${company}. Vous trouverez ci-joints mon CV et ma lettre de motivation.\n\nJe serais heureux d'échanger sur ce que je pourrais apporter à votre équipe.\n\nCordialement,\n${fullName}${contact ? `\n${contact}` : ""}`,
        };
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
