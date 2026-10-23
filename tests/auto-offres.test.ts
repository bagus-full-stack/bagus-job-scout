import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { setOffreScore, upsertOffreFromSource, type ScrapedOffre } from "@/lib/db/offres";
import { createCandidature } from "@/lib/db/candidatures";
import { setAutoResult } from "@/lib/db/spontanees";
import { eligibleOffres, startAuto } from "@/lib/auto/apply";

/** Sélection des offres des sources pour la candidature automatique : base SQLite temporaire (tests/setup.ts). */

let seq = 0;
function add(over: { text?: string; score?: number; source?: string } = {}): number {
  seq++;
  const offre: ScrapedOffre = {
    source_id: `a-${seq}`,
    url: `https://example.org/offre/${seq}`,
    title: `Poste ${seq}`,
    company: `Société ${seq}`,
    country: "France",
    location: "Lyon",
    contract_type: "CDI",
    salary: null,
    description_html: "<p>x</p>",
    description_text: over.text ?? "Envoyez votre candidature à recrutement@societe.test",
    description_status: "ok",
    posted_at: "2026-01-15",
    is_vie: false,
    raw_payload: {},
  };
  const id = upsertOffreFromSource(over.source ?? "hellowork", offre);
  setOffreScore(id, { score: over.score ?? 80, breakdown: { sector: 0, skills: 0, country: 0 }, reason: "r" });
  return id;
}

beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM candidatures");
  db.exec("DELETE FROM documents");
  db.exec("DELETE FROM offres");
});

describe("offres éligibles à la candidature automatique", () => {
  it("garde les offres avec adresse, assez bien notées, sans candidature, triées par score", () => {
    const low = add({ score: 60 });
    const best = add({ score: 95 });
    const good = add({ score: 75 });
    const noMail = add({ text: "Postulez sur notre site." });
    const applied = add();
    createCandidature({ offre_id: applied, status: "envoyee", contact: "x@y.test" });
    const spont = add({ source: "spontanee" });
    const ids = eligibleOffres(70).map((o) => o.id);
    expect(ids).toEqual([best, good]);
    expect(ids).not.toContain(low);
    expect(ids).not.toContain(noMail);
    expect(ids).not.toContain(applied);
    expect(ids).not.toContain(spont);
    expect(eligibleOffres(70)[0]).toMatchObject({ email: "recrutement@societe.test" });
    expect(eligibleOffres(50).map((o) => o.id)).toContain(low);
  });

  it("écarte une offre dont l'envoi automatique a déjà échoué, jusqu'à ce que l'échec soit effacé", () => {
    const id = add();
    setAutoResult(id, "Le domaine ne reçoit pas de courrier.");
    expect(eligibleOffres(70)).toHaveLength(0);
    setAutoResult(id, null);
    expect(eligibleOffres(70)).toHaveLength(1);
  });

  it("refuse de démarrer sans messagerie configurée, sans rien envoyer", () => {
    add();
    const r = startAuto("offres", 5, 70);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/Messagerie non configurée/);
  });
});
