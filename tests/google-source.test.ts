import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, getSetting } from "@/lib/db";
import { GOOGLE_MISSING_MESSAGE, buildQueries, getGoogleKey, getSites, getWeb, googleScraper, normalizeSite, parseItem, saveGoogleKey, saveTargets, wanted } from "@/lib/scrapers/google";
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
  });
  it("marque « failed » un extrait trop court", () => {
    expect(parseItem(item({ snippet: "Court." }))).toMatchObject({ description_status: "failed" });
  });
});

describe("parseItem : X, Reddit, pages d'entreprises", () => {
  it("X : auteur et texte du tweet, sans guillemets ni suffixe", () => {
    expect(parseItem({ title: 'Marie Curie on X: "Nous recrutons un dev" / X', link: "https://x.com/mcurie/status/123456", snippet: SNIPPET })).toMatchObject({
      company: "Marie Curie",
      title: "Nous recrutons un dev",
      raw_payload: { kind: "x" },
    });
    expect(parseItem({ title: "t", link: "https://x.com/mcurie", snippet: SNIPPET })).toBeNull(); // profil, pas un post
  });
  it("Reddit : sous-forum en entreprise, r/recruitinghell écarté", () => {
    expect(parseItem({ title: "[Hiring] Dev React : r/forhire", link: "https://www.reddit.com/r/forhire/comments/abc/hiring/", snippet: SNIPPET })).toMatchObject({
      company: "r/forhire",
      title: "[Hiring] Dev React",
      raw_payload: { kind: "reddit" },
    });
    expect(parseItem({ title: "t", link: "https://www.reddit.com/r/recruitinghell/comments/abc/x/", snippet: SNIPPET })).toBeNull();
  });
  it("autre site : domaine en entreprise", () => {
    expect(parseItem({ title: "Rejoignez Acme - Offres", link: "https://www.acme-tech.fr/carrieres/dev", snippet: SNIPPET })).toMatchObject({
      company: "acme-tech.fr",
      raw_payload: { kind: "web" },
    });
  });
});

describe("normalizeSite", () => {
  it("garde un domaine (avec chemin), refuse le reste", () => {
    expect(normalizeSite(" https://www.Reddit.com/ ")).toBe("reddit.com");
    expect(normalizeSite("linkedin.com/posts")).toBe("linkedin.com/posts");
    expect(normalizeSite("Twitter.com")).toBe("x.com");
    for (const bad of ["", "reddit", 'x.com" OR site:evil.com', "a b.com", "x.com?q=1"]) expect(normalizeSite(bad)).toBeNull();
  });
});

describe("wanted", () => {
  const sites = ["linkedin.com/posts", "x.com"];
  it("liste de sites : domaine, sous-domaine, chemin, x.com couvre twitter.com", () => {
    expect(wanted(POST, sites, false)).toBe(true);
    expect(wanted("https://twitter.com/a/status/1", sites, false)).toBe(true);
    expect(wanted("https://www.linkedin.com/in/marie", sites, false)).toBe(false); // hors chemin /posts
    expect(wanted("https://www.reddit.com/r/forhire/comments/a/b", sites, false)).toBe(false);
    expect(wanted("https://acme-tech.fr/jobs", sites, false)).toBe(false);
  });
  it("web libre : pages d'entreprises oui, sites d'emploi et réseaux non", () => {
    expect(wanted("https://acme-tech.fr/jobs", [], true)).toBe(true);
    for (const u of ["https://fr.indeed.com/viewjob?jk=1", "https://www.hellowork.com/fr-fr/emplois/1.html", "https://www.facebook.com/x/posts/1", "https://www.reddit.com/r/a/comments/b/c"])
      expect(wanted(u, [], true)).toBe(false);
  });
});

describe("buildQueries", () => {
  it("regroupe les sites de la liste dans une requête, le web libre dans une autre", () => {
    const q = buildQueries("dev", ["linkedin.com/posts", "x.com", "reddit.com"], true);
    expect(q).toHaveLength(2);
    expect(q[0]).toContain("(site:linkedin.com/posts OR site:x.com OR site:twitter.com OR site:reddit.com)");
    expect(q[0]).toContain("-inurl:recruitinghell");
    expect(q[1]).not.toContain("site:linkedin.com/posts");
    expect(q[1]).toContain("-site:linkedin.com");
    expect(q[1]).toContain("-site:indeed.com");
  });
  it("LinkedIn seul : une seule requête, sans filtre Reddit ; web seul : une seule aussi", () => {
    const q = buildQueries("dev", ["linkedin.com/posts"], false);
    expect(q).toHaveLength(1);
    expect(q[0]).not.toContain("recruitinghell");
    expect(buildQueries("dev", [], true)).toHaveLength(1);
    expect(buildQueries("dev", [], false)).toHaveLength(0);
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

  it("la liste de sites et le web libre décident des requêtes et de ce qui est gardé", async () => {
    expect(getSites()).toEqual(["linkedin.com/posts", "apec.fr"]); // défaut
    expect(getWeb()).toBe(false);
    saveTargets(["x.com"], true);
    fetchMock.mockResolvedValue(
      reply({
        organic_results: [
          item(), // post LinkedIn : plus dans la liste, ignoré
          { title: 'Marie Curie on X: "Nous recrutons"', link: "https://x.com/mcurie/status/1", snippet: SNIPPET },
          { title: "Rejoignez Acme", link: "https://acme-tech.fr/jobs", snippet: SNIPPET },
        ],
      })
    );
    const offres = await collect({ sectors: [], queries: ["dev"], countries: [], pages: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2); // liste de sites + web libre
    expect(offres.map((o) => o.raw_payload.kind).sort()).toEqual(["web", "x"]);
    saveTargets(["linkedin.com/posts"], false);
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

  it("lit la page suivante même si la première compte moins de 10 résultats, mais pas plus de 2 pages", async () => {
    const page = (n: number, k: number) => reply({ organic_results: Array.from({ length: n }, (_, i) => item({ link: `https://fr.linkedin.com/posts/u-${k}-${i}-activity-1` })) });
    fetchMock.mockResolvedValueOnce(page(8, 1)).mockResolvedValueOnce(page(8, 2)).mockResolvedValue(page(8, 3));
    const offres = await collect({ sectors: [], queries: ["dev"], countries: [], pages: 5, maxOffres: 100 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(offres).toHaveLength(16);
  });

  it("s'arrête à la première page vide", async () => {
    fetchMock.mockResolvedValue(reply({ organic_results: [] }));
    await collect({ sectors: [], queries: ["dev"], countries: [], pages: 5 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("twitter.com saisi dans la liste garde les posts X", async () => {
    saveTargets(["twitter.com"], false);
    fetchMock.mockResolvedValue(reply({ organic_results: [{ title: 'Marie on X: "Nous recrutons"', link: "https://twitter.com/m/status/9", snippet: SNIPPET }] }));
    expect(await collect({ sectors: [], queries: ["dev"], countries: [], pages: 1 })).toHaveLength(1);
    saveTargets(["linkedin.com/posts", "apec.fr"], false);
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
