import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { upsertOffreFromSource } from "@/lib/db/offres";
import { autoSendFailures, createCandidature, failedCandidatures, followUps, FOLLOW_UP_DAYS } from "@/lib/db/candidatures";
import { setAutoResult } from "@/lib/db/spontanees";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

const addOffre = (company: string) =>
  upsertOffreFromSource("hellowork", {
    source_id: `f-${company}`,
    url: "https://example.org/o",
    title: "Poste",
    company,
    country: "France",
    location: "Lyon",
    contract_type: "CDI",
    salary: null,
    description_html: "<p>x</p>",
    description_text: "x",
    description_status: "ok",
    posted_at: "2026-01-15",
    is_vie: false,
    raw_payload: {},
  });

describe("carte « En échec » du dashboard", () => {
  it("failedCandidatures ne liste que le statut échec, du plus récent au plus ancien", () => {
    createCandidature({ offre_id: null, ext_company: "Ancienne", ext_title: "Dev", applied_at: daysAgo(9), status: "echec" });
    createCandidature({ offre_id: null, ext_company: "Récente", ext_title: "Dev", applied_at: daysAgo(1), status: "echec" });
    createCandidature({ offre_id: null, ext_company: "Envoyée", ext_title: "Dev", applied_at: daysAgo(1), status: "envoyee" });
    expect(failedCandidatures().map((c) => c.company)).toEqual(["Récente", "Ancienne"]);
  });

  it("followUps ignore les échecs (le refactor garde son filtre)", () => {
    createCandidature({ offre_id: null, ext_company: "Vieille", ext_title: "Dev", applied_at: daysAgo(FOLLOW_UP_DAYS + 5), status: "envoyee" });
    expect(followUps().map((f) => f.company)).toEqual(["Vieille"]);
  });

  it("autoSendFailures liste les cibles en échec d'envoi sans candidature, pas celles réussies ni déjà candidatées", () => {
    const failed = addOffre("Echec");
    const cleared = addOffre("Reussi");
    const applied = addOffre("Candidatee");
    setAutoResult(failed, "SMTP refusé");
    setAutoResult(cleared, "SMTP refusé");
    setAutoResult(cleared, null);
    setAutoResult(applied, "SMTP refusé");
    createCandidature({ offre_id: applied, status: "envoyee" });
    expect(autoSendFailures().map((f) => [f.company, f.error])).toEqual([["Echec", "SMTP refusé"]]);
    expect(getDb().prepare("SELECT COUNT(*) AS c FROM offres").get()).toMatchObject({ c: 3 });
  });
});
