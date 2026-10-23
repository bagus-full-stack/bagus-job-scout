import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { searchOffres, setOffreScore, upsertOffreFromSource, type ScrapedOffre } from "@/lib/db/offres";

/** Filtre « années d'expérience » : base SQLite temporaire (tests/setup.ts), offres fictives. */

let seq = 0;
function add(text: string, title?: string): number {
  seq++;
  const offre: ScrapedOffre = {
    source_id: `x-${seq}`,
    url: `https://example.org/offre/${seq}`,
    title: title ?? `Développeur ${seq}`,
    company: "Entreprise Exemple",
    country: "France",
    location: "Lyon",
    contract_type: "CDI",
    salary: null,
    description_html: `<p>${text}</p>`,
    description_text: text,
    description_status: "ok",
    posted_at: "2026-01-15",
    is_vie: false,
    raw_payload: {},
  };
  const id = upsertOffreFromSource("hellowork", offre);
  setOffreScore(id, { score: 50, breakdown: { sector: 0, skills: 0, country: 0 }, reason: "r" });
  return id;
}

beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM documents");
  db.exec("DELETE FROM offres");
});

describe("filtre par années d'expérience", () => {
  it("garde les offres dont l'exigence chevauche la fourchette, compte celles sans précision", () => {
    const junior = add("Débutant accepté.");
    const two = add("2 ans d'expérience minimum.");
    const range = add("Profil : 3 à 5 ans d'expérience.");
    const five = add("5 ans d'expérience minimum requis.");
    const senior = add("Mission.", "Senior Engineer");
    const unknown = add("Mission variée.");

    const ids = (o: Parameters<typeof searchOffres>[0]) => searchOffres(o).offers.map((x) => x.id).sort((a, b) => a - b);
    expect(ids({})).toHaveLength(6);

    const r = searchOffres({ expFrom: 0, expTo: 3 });
    expect(r.offers.map((x) => x.id).sort((a, b) => a - b)).toEqual([junior, two, range]);
    expect(r.facets.experience.unknown).toBe(1);
    expect(ids({ expFrom: 0, expTo: 3, includeUnknownExp: true })).toEqual([junior, two, range, unknown]);

    expect(ids({ expFrom: 5, expTo: 10 })).toEqual([two, range, five, senior]); // « 2 ans minimum » convient aussi à 5-10 ans
    expect(ids({ expTo: 1 })).toEqual([junior]);
    expect(searchOffres({}).facets.experience.unknown).toBe(0);
    expect(searchOffres({ expFrom: 0, expTo: 3 }).offers.find((x) => x.id === range)?.experience).toEqual({ min: 3, max: 5 });
  });
});
