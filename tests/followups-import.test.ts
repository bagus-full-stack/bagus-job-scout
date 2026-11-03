import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { createCandidature, followUps, importCandidatures, successBySource, FOLLOW_UP_DAYS } from "@/lib/db/candidatures";
import { normDate } from "@/lib/excel/io";
import { followUpDraft, mailDraft } from "@/lib/mail/draft";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

describe("normDate", () => {
  it("rend une date ISO pour les formats d'un fichier Excel ou saisi à la main", () => {
    expect(normDate("2026-11-03 10:00:00")).toBe("2026-11-03");
    expect(normDate("03/11/2026")).toBe("2026-11-03");
    expect(normDate("3.1.2026")).toBe("2026-01-03");
    expect(normDate(46_329)).toBe("2026-11-03");
    expect(normDate("bientôt")).toBeNull();
    expect(normDate("")).toBeNull();
  });
});

describe("relances et réussite par source", () => {
  it("relance seulement les candidatures « envoyée » de plus de FOLLOW_UP_DAYS jours", () => {
    createCandidature({ offre_id: null, ext_company: "Vieille", ext_title: "Dev", applied_at: daysAgo(FOLLOW_UP_DAYS + 5), status: "envoyee" });
    createCandidature({ offre_id: null, ext_company: "Récente", ext_title: "Dev", applied_at: daysAgo(2), status: "envoyee" });
    createCandidature({ offre_id: null, ext_company: "Répondue", ext_title: "Dev", applied_at: daysAgo(30), status: "entretien" });
    expect(followUps().map((f) => f.company)).toEqual(["Vieille"]);
  });

  it("compte entretiens et acceptations par source, « import » pour les candidatures sans offre", () => {
    const stat = successBySource().find((s) => s.source === "import");
    expect(stat).toMatchObject({ total: 3, positive: 1 });
  });
});

describe("importCandidatures", () => {
  const row = (company: string, applied_at: string | null = "2026-05-01") => ({ offre_id: null, ext_company: company, ext_title: "Dev", applied_at });
  const count = () => (getDb().prepare("SELECT COUNT(*) AS c FROM candidatures").get() as { c: number }).c;

  it("ne double pas une candidature déjà importée, y compris en relançant le même fichier", () => {
    const before = count();
    expect(importCandidatures([row("Acme"), row("Acme", "2026-06-01")])).toBe(2);
    expect(importCandidatures([row("Acme"), row("Acme", "2026-06-01")])).toBe(0);
    expect(importCandidatures([row("Acme", null)])).toBe(0);
    expect(count()).toBe(before + 2);
  });

  it("n'en laisse pas la moitié si une ligne échoue", () => {
    const before = count();
    const bad = { ...row("Zeta"), status: "inconnu" as never, notes: Symbol("x") as never };
    expect(() => importCandidatures([row("Beta"), bad])).toThrow();
    expect(count()).toBe(before);
  });
});

describe("followUpDraft", () => {
  const base = { title: "Chef de projet", company: "Acme", fullName: "Sami B.", sentOn: "03/11/2026" };

  it("rédige la relance dans la langue demandée, avec poste, entreprise et date d'envoi", () => {
    const fr = followUpDraft({ ...base, lang: "fr" });
    expect(fr.subject).toContain("Relance");
    for (const s of ["Chef de projet", "Acme", "03/11/2026", "Sami B."]) expect(fr.body).toContain(s);
    expect(followUpDraft({ ...base, lang: "en" }).body).toContain("following up");
  });

  it("followUps rend le contact et le pays pour choisir destinataire et langue", () => {
    createCandidature({ offre_id: null, ext_company: "Contactée", ext_title: "Dev", ext_country: "Royaume-Uni", contact: "rh@contactee.fr", applied_at: daysAgo(FOLLOW_UP_DAYS + 5) });
    expect(followUps(20).find((f) => f.company === "Contactée")).toMatchObject({ contact: "rh@contactee.fr", country: "Royaume-Uni" });
  });
});

describe("mail de candidature spontanée", () => {
  const args = { title: "Chef de projet", company: "Acme", fullName: "Sami B.", phone: "06 00 00 00 00", email: "s@x.fr" };
  const profile = { summary: "Chef de projet digital, 6 ans d'expérience en agence. Pilote des refontes web de bout en bout. Aime les équipes petites.", location: "Lyon", portfolio_url: "https://bagus-full-stack.me/", preferred_contracts: ["cdi", "cdd"] };

  it("présente le candidat, ce qu'il cherche et où le joindre", () => {
    const { body } = mailDraft({ ...args, lang: "fr", spontaneous: true, profile });
    expect(body).toContain("Mon profil : Chef de projet digital, 6 ans d'expérience en agence. Pilote des refontes web de bout en bout.");
    expect(body).not.toContain("Aime les équipes"); // deux phrases au plus
    expect(body).toContain("Je recherche un poste de Chef de projet (CDI ou CDD).");
    expect(body.endsWith("Sami B.\n06 00 00 00 00 | s@x.fr | Lyon\nPortfolio : https://bagus-full-stack.me/")).toBe(true);
    expect(mailDraft({ ...args, lang: "en", spontaneous: true, profile }).body).toContain("About me:");
  });

  it("sans résumé ni contrats, le message reste valable", () => {
    const { body } = mailDraft({ ...args, lang: "fr", spontaneous: true, profile: { summary: null, preferred_contracts: [] } });
    expect(body).not.toContain("Mon profil");
    expect(body).not.toContain("Portfolio");
    expect(body).toContain("Je recherche un poste de Chef de projet.");
  });

  it("une candidature sur offre garde son message court", () => {
    expect(mailDraft({ ...args, lang: "fr", profile }).body).not.toContain("Mon profil");
  });
});
