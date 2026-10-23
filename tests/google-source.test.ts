import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSetting } from "@/lib/db";
import { GOOGLE_MISSING_MESSAGE, getGoogleConfig, googleScraper, parseItem, saveGoogleConfig } from "@/lib/scrapers/google";
import { findApplyEmail } from "@/lib/mail/contact";
import type { ScrapedOffre } from "@/lib/scrapers/base";

const POST = "https://fr.linkedin.com/posts/marie-curie_recrutement-activity-123-abcd?trk=public_post";
const SNIPPET = "Nous recrutons un développeur full stack à Lyon. Envoyez votre CV à rh@acme-tech.fr avant le 30 juin.";

const item = (over: Record<string, string> = {}) => ({ title: "Marie Curie sur LinkedIn : Nous recrutons un développeur | LinkedIn", link: POST, snippet: SNIPPET, ...over });

async function collect(criteria: Parameters<typeof googleScraper.scrape>[0]): Promise<ScrapedOffre[]> {
  const out: ScrapedOffre[] = [];
  for await (const o of googleScraper.scrape(criteria, () => {})) out.push(o);
  return out;
}

describe("parseItem", () => {
  it("sépare l'auteur et le début du post, sans le suffixe LinkedIn ni les paramètres d'URL", () => {
    const o = parseItem(item())!;
    expect(o).toMatchObject({
      source_id: POST.split("?")[0],
      company: "Marie Curie",
      title: "Nous recrutons un développeur",
      description_status: "ok",
    });
    expect(findApplyEmail(o.description_text)).toBe("rh@acme-tech.fr");
  });
  it("comprend le titre anglais « on LinkedIn: »", () => {
    expect(parseItem(item({ title: "John Doe on LinkedIn: We are hiring" }))).toMatchObject({ company: "John Doe", title: "We are hiring" });
  });
  it("ignore ce qui n'est pas un post LinkedIn", () => {
    expect(parseItem(item({ link: "https://www.linkedin.com/in/marie-curie" }))).toBeNull();
    expect(parseItem(item({ link: "https://example.org/x" }))).toBeNull();
  });
  it("marque « failed » un extrait trop court", () => {
    expect(parseItem(item({ snippet: "Court." }))).toMatchObject({ description_status: "failed" });
  });
});

describe("source Google", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("stocke la clé chiffrée et ne la rend qu'avec le cx", () => {
    saveGoogleConfig({ cx: "cx-1", key: "AIza-secret" });
    expect(getSetting("google:key")).toMatch(/^enc:v1:/);
    expect(getGoogleConfig()).toEqual({ key: "AIza-secret", cx: "cx-1" });
  });

  it("interroge l'API officielle (jamais LinkedIn), une requête par intitulé, et dédoublonne", async () => {
    saveGoogleConfig({ cx: "cx-1", key: "AIza-secret" });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ items: [item(), item()] }), { status: 200 }));
    const offres = await collect({ sectors: [], queries: ["développeur"], countries: [], pages: 1 });
    expect(offres).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe("https://www.googleapis.com/customsearch/v1");
    expect(url.searchParams.get("q")).toContain('site:linkedin.com/posts');
    expect(url.searchParams.get("q")).toContain('"développeur"');
  });

  it("n'interroge rien sans intitulé ciblé", async () => {
    saveGoogleConfig({ cx: "cx-1", key: "AIza-secret" });
    expect(await collect({ sectors: [], queries: [], countries: [] })).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("remonte l'erreur de l'API (quota, clé refusée) quand rien n'a été récupéré", async () => {
    saveGoogleConfig({ cx: "cx-1", key: "AIza-secret" });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: "Quota exceeded" } }), { status: 429 }));
    await expect(collect({ sectors: [], queries: ["dev"], countries: [], pages: 1 })).rejects.toThrow(/HTTP 429.*Quota exceeded/);
  });

  it("garde les résultats déjà reçus si l'API refuse une page suivante", async () => {
    saveGoogleConfig({ cx: "cx-1", key: "AIza-secret" });
    const ten = Array.from({ length: 10 }, (_, i) => item({ link: `https://fr.linkedin.com/posts/u-${i}-activity-1` }));
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: ten }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Quota exceeded" } }), { status: 429 }));
    expect(await collect({ sectors: [], queries: ["dev"], countries: [], pages: 2 })).toHaveLength(10);
  });
});

describe("source Google non configurée", () => {
  it("échoue avec un message qui dit quoi faire", async () => {
    // Base de test propre à ce fichier : on efface la config posée plus haut.
    const { getDb } = await import("@/lib/db");
    getDb().prepare("DELETE FROM settings WHERE key LIKE 'google:%'").run();
    await expect(collect({ sectors: [], queries: ["dev"], countries: [] })).rejects.toThrow(GOOGLE_MISSING_MESSAGE);
  });
});
