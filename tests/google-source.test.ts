import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, getSetting } from "@/lib/db";
import { GOOGLE_MISSING_MESSAGE, getGoogleKey, googleScraper, parseItem, saveGoogleKey } from "@/lib/scrapers/google";
import { findApplyEmail } from "@/lib/mail/contact";
import type { ScrapedOffre } from "@/lib/scrapers/base";

const POST = "https://fr.linkedin.com/posts/marie-curie_recrutement-activity-123-abcd?trk=public_post";
const SNIPPET = "Nous recrutons un développeur full stack à Lyon. Envoyez votre CV à rh@acme-tech.fr avant le 30 juin.";

const item = (over: Record<string, string> = {}) => ({ title: "Marie Curie sur LinkedIn : Nous recrutons un développeur | LinkedIn", link: POST, snippet: SNIPPET, ...over });
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

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

describe("source Google (SerpAPI)", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    saveGoogleKey("serp-secret");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("stocke la clé chiffrée", () => {
    expect(getSetting("google:key")).toMatch(/^enc:v1:/);
    expect(getGoogleKey()).toBe("serp-secret");
  });

  it("interroge SerpAPI (jamais LinkedIn), une requête par intitulé, et dédoublonne", async () => {
    fetchMock.mockResolvedValue(reply({ organic_results: [item(), item()] }));
    const offres = await collect({ sectors: [], queries: ["développeur"], countries: [], pages: 1 });
    expect(offres).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe("https://serpapi.com/search.json");
    expect(url.searchParams.get("engine")).toBe("google");
    expect(url.searchParams.get("api_key")).toBe("serp-secret");
    expect(url.searchParams.get("start")).toBe("0");
    expect(url.searchParams.get("q")).toContain("site:linkedin.com/posts");
    expect(url.searchParams.get("q")).toContain('"développeur"');
  });

  it("utilise l'adresse de SERPAPI_URL quand elle est définie", async () => {
    vi.stubEnv("SERPAPI_URL", "https://serp.exemple.test/search.json");
    fetchMock.mockResolvedValue(reply({ organic_results: [item()] }));
    await collect({ sectors: [], queries: ["dev"], countries: [], pages: 1 });
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/^https:\/\/serp\.exemple\.test\/search\.json\?/);
  });

  it("n'interroge rien sans intitulé ciblé", async () => {
    expect(await collect({ sectors: [], queries: [], countries: [] })).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("« aucun résultat » n'est pas une erreur", async () => {
    fetchMock.mockResolvedValue(reply({ error: "Google hasn't returned any results for this query." }));
    expect(await collect({ sectors: [], queries: ["dev"], countries: [], pages: 1 })).toHaveLength(0);
  });

  it("remonte l'erreur de SerpAPI (clé refusée, quota) quand rien n'a été récupéré", async () => {
    fetchMock.mockResolvedValue(reply({ error: "Invalid API key." }, 401));
    await expect(collect({ sectors: [], queries: ["dev"], countries: [], pages: 1 })).rejects.toThrow(/HTTP 401.*Invalid API key/);
  });

  it("garde les résultats déjà reçus si une page suivante est refusée", async () => {
    const ten = Array.from({ length: 10 }, (_, i) => item({ link: `https://fr.linkedin.com/posts/u-${i}-activity-1` }));
    fetchMock.mockResolvedValueOnce(reply({ organic_results: ten })).mockResolvedValueOnce(reply({ error: "Your account has run out of searches." }, 429));
    expect(await collect({ sectors: [], queries: ["dev"], countries: [], pages: 2 })).toHaveLength(10);
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get("start")).toBe("10");
  });
});

describe("source Google non configurée", () => {
  it("échoue avec un message qui dit quoi faire", async () => {
    getDb().prepare("DELETE FROM settings WHERE key = 'google:key'").run();
    await expect(collect({ sectors: [], queries: ["dev"], countries: [] })).rejects.toThrow(GOOGLE_MISSING_MESSAGE);
  });
});
