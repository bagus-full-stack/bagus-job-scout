import "server-only";
import type { Scraper, ScrapedOffre, ScrapeCriteria, ProgressEvent } from "./base";
import { searchQueries } from "./base";
import { decryptSecret, encryptSecret } from "@/lib/mail/send";
import { getSetting, setSetting } from "@/lib/db";
import { detectVie } from "@/lib/vie";
import { capOf, pagesOf } from "./pages";
import { sleep } from "./dom";

/**
 * Annonces de recrutement trouvées dans les résultats de Google par SerpAPI, sur une liste de sites modifiable
 * (posts LinkedIn et APEC au départ ; X, Reddit… au choix) et, en option, sur les pages de recrutement d'entreprises.
 * JobScout ne contacte jamais ces sites, il ne lit que les extraits que Google a déjà indexés.
 * Chaque page de 10 résultats coûte une recherche sur le compte SerpAPI. L'adresse du service se règle par
 * SERPAPI_URL (par défaut le service public, mais aussi un serveur compatible).
 */
const SOURCE = "google";
const DEFAULT_API = "https://serpapi.com/search.json";
const PAGE_SIZE = 10;
const MAX_SITES = 10;
// shortcut: 2 pages par requête, car chaque page coûte une recherche du forfait SerpAPI et les suivantes rapportent peu ; à relever si le quota le permet.
const MAX_PAGES = 2;
const HIRING = '("recrute" OR "nous recrutons" OR "hiring" OR "we are hiring" OR "offre d\'emploi")';
const APPLY = '("envoyez votre CV" OR "envoyez votre candidature" OR "send your CV" OR "send your resume")';

export const DEFAULT_SITES = ["linkedin.com/posts", "apec.fr"];

export const GOOGLE_MISSING_MESSAGE = "SerpAPI non configuré : renseignez la clé API dans Profil › Recrutement sur le web (via Google).";

/** Clé SerpAPI enregistrée (chiffrée dans la base), ou null. */
export function getGoogleKey(): string | null {
  const stored = getSetting("google:key");
  return (stored && decryptSecret(stored)) || null;
}

export function saveGoogleKey(key: string) {
  setSetting("google:key", encryptSecret(key));
}

/** « https://www.Reddit.com/ » → « reddit.com » ; null si ce n'est pas un domaine (avec chemin éventuel). Sert aussi à écarter tout ce qui fausserait la requête Google. */
export function normalizeSite(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "").replace(/^twitter\.com(?=\/|$)/, "x.com"); // un seul nom pour X : la requête et le filtre des résultats le comparent tels quels
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/[a-z0-9_\-./]*)?$/.test(s) ? s : null;
}

/** Sites choisis (liste vide possible si seul le web libre est coché) ; LinkedIn seul tant que rien n'est enregistré. */
export function getSites(): string[] {
  try {
    const raw = JSON.parse(getSetting("google:sites") ?? "null");
    if (!Array.isArray(raw)) return DEFAULT_SITES;
    return [...new Set(raw.map((s) => normalizeSite(String(s))).filter((s): s is string => !!s))].slice(0, MAX_SITES);
  } catch {
    return DEFAULT_SITES;
  }
}

export const getWeb = (): boolean => getSetting("google:web") === "1";

export function saveTargets(sites: string[], web: boolean) {
  setSetting("google:sites", JSON.stringify(sites));
  setSetting("google:web", web ? "1" : "0");
}

const apiUrl = () => process.env.SERPAPI_URL?.trim() || DEFAULT_API;

// Sites d'emploi déjà couverts ailleurs ou qui interdisent l'extraction : jamais dans « pages de recrutement d'entreprises ».
const BOARD_HOSTS = /(^|\.)(linkedin|x|twitter|reddit|facebook|instagram|indeed|glassdoor|hellowork|talent|welcometothejungle|francetravail|pole-emploi|apec|monster|jobteaser|malt)\.[a-z.]+$/i;
const WEB_EXCLUDED = ["linkedin.com", "x.com", "twitter.com", "reddit.com", "facebook.com", "instagram.com", "indeed.com", "glassdoor.com"];

/** Requêtes Google pour un intitulé de poste : une pour les sites de la liste (regroupés par OR), une pour le web libre. */
export function buildQueries(q: string, sites: string[], web: boolean): string[] {
  const out: string[] = [];
  if (sites.length) {
    const list = sites.flatMap((s) => (s === "x.com" ? [s, "twitter.com"] : [s])).map((s) => `site:${s}`);
    // r/recruitinghell n'annonce rien : écarté d'office quand Reddit est dans la liste.
    out.push(`(${list.join(" OR ")}) ${HIRING} "${q}"${sites.some((s) => s.startsWith("reddit.com")) ? " -inurl:recruitinghell" : ""}`);
  }
  if (web) out.push(`${HIRING} ${APPLY} "${q}" ${WEB_EXCLUDED.map((h) => `-site:${h}`).join(" ")}`);
  return out;
}

type Item = { title?: string; link?: string; snippet?: string };
type SerpResponse = { organic_results?: Item[]; error?: string };

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function hostOf(url: string): { host: string; path: string } | null {
  try {
    const u = new URL(url);
    return { host: u.hostname.replace(/^www\./, "").toLowerCase(), path: u.pathname };
  } catch {
    return null;
  }
}

/** Le résultat est-il sur l'un des sites de la liste (x.com couvre twitter.com) ? */
function onSite(url: string, sites: string[]): boolean {
  const u = hostOf(url);
  if (!u) return false;
  const host = u.host === "twitter.com" ? "x.com" : u.host;
  return sites.some((s) => {
    const [h, ...rest] = s.split("/");
    return (host === h || host.endsWith(`.${h}`)) && (!rest.length || u.path.startsWith(`/${rest.join("/")}`));
  });
}

/** Garde un résultat : sur un site de la liste, ou (web libre coché) sur une page d'entreprise hors sites d'emploi. */
export function wanted(url: string, sites: string[], web: boolean): boolean {
  const u = hostOf(url);
  return !!u && (onSite(url, sites) || (web && !BOARD_HOSTS.test(u.host)));
}

/** Auteur et début du post : « Marie Curie on LinkedIn: Nous recrutons… », « … on X: "…" / X ». */
const SOCIAL_TITLE = /^(.*?)\s+(?:on|sur)\s+(?:LinkedIn|X|Twitter)\s*:\s*(.*)$/i;
const unquote = (s: string) => s.replace(/\s*\/\s*X\s*$/i, "").replace(/^["“«\s]+|["”»\s]+$/g, "");

/** Même page, sans les paramètres de suivi (utm_*, gclid, fbclid, ref) : deux liens vers elle ne font qu'une offre. Les autres paramètres (ex. ?id=12) restent. */
function withoutTracking(url: string): string {
  const u = new URL(url);
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|gclid$|fbclid$|ref$)/i.test(k)) u.searchParams.delete(k);
  return u.toString();
}

export function parseItem(it: Item): ScrapedOffre | null {
  const url = (it.link ?? "").split("#")[0];
  const u = hostOf(url);
  if (!u) return null;
  const full = clean((it.title ?? "").replace(/\s*\|\s*LinkedIn\s*$/i, ""));
  const social = /(^|\.)linkedin\.com$/.test(u.host) ? "LinkedIn" : /^(x|twitter)\.com$/.test(u.host) ? "X" : null;
  let kind: string;
  let title: string;
  let company: string;
  let id = url;
  if (social) {
    // Un profil X n'est pas une annonce : seuls les posts comptent. Pour LinkedIn, le chemin saisi dans la liste décide (wanted).
    if (social === "X" && !/\/status\/\d+/.test(u.path)) return null;
    kind = social.toLowerCase();
    id = url.split("?")[0];
    const m = SOCIAL_TITLE.exec(full);
    title = unquote(m?.[2] || full) || `Post ${social}`;
    company = m?.[1] || `Post ${social}`;
  } else if (/(^|\.)reddit\.com$/.test(u.host)) {
    if (!/^\/r\/(?!recruitinghell\b)\w+\/comments\//i.test(u.path)) return null;
    kind = "reddit";
    id = url.split("?")[0];
    title = full.replace(/\s*[:\-–|]\s*r\/\w+\s*$/i, "") || "Post Reddit";
    company = `r/${/\/r\/(\w+)\//i.exec(u.path)?.[1] ?? "reddit"}`;
  } else {
    kind = "web";
    id = withoutTracking(url);
    title = full || u.host;
    company = u.host;
  }
  title = title.slice(0, 120);
  const text = clean(it.snippet ?? "") || title;
  return {
    source_id: id,
    url,
    title,
    company,
    country: null,
    location: null,
    contract_type: null,
    salary: null,
    description_html: `<p>${esc(text)}</p>`,
    description_text: text,
    description_status: text.length >= 40 ? "ok" : "failed",
    posted_at: null,
    is_vie: detectVie({ source: SOURCE, title, description: text, url }),
    raw_payload: { via: "serpapi", kind },
    scrape_errors: text.length >= 40 ? undefined : "extrait trop court",
  };
}

async function fetchPage(key: string, query: string, start: number): Promise<Item[]> {
  const params = new URLSearchParams({ engine: "google", api_key: key, q: query, num: String(PAGE_SIZE), start: String(start) });
  const res = await fetch(`${apiUrl()}?${params}`, { signal: AbortSignal.timeout(30_000) });
  const body = (await res.json().catch(() => null)) as SerpResponse | null;
  // « Google hasn't returned any results » : simplement rien à cette recherche, pas une panne.
  if (body?.error && !/hasn't returned any results/i.test(body.error)) throw new Error(`SerpAPI HTTP ${res.status} : ${body.error}`);
  if (!res.ok && !body?.error) throw new Error(`SerpAPI HTTP ${res.status}`);
  return body?.organic_results ?? [];
}

export const googleScraper: Scraper = {
  name: SOURCE,
  async *scrape(criteria: ScrapeCriteria, onEvent: (e: ProgressEvent) => void) {
    onEvent({ kind: "start", source: SOURCE });
    const key = getGoogleKey();
    if (!key) throw new Error(GOOGLE_MISSING_MESSAGE);

    const sites = getSites();
    const web = getWeb();
    const max = capOf(criteria, 30);
    const offres = new Map<string, ScrapedOffre>();
    let failure: Error | null = null;
    // Sans intitulé ciblé, la recherche serait trop large pour avoir un sens : rien n'est interrogé.
    search: for (const q of searchQueries(criteria).filter(Boolean)) {
      for (const query of buildQueries(q, sites, web)) {
        for (let page = 0; page < Math.min(pagesOf(criteria), MAX_PAGES) && offres.size < max; page++) {
          try {
            const items = await fetchPage(key, query, page * PAGE_SIZE);
            for (const it of items) {
              const o = parseItem(it);
              if (o && wanted(o.url, sites, web) && !offres.has(o.source_id)) offres.set(o.source_id, o);
            }
            if (!items.length) break; // une page pleine peut compter moins de 10 résultats (encarts Google) : seule une page vide est la dernière
            await sleep(400);
          } catch (e) {
            failure = e instanceof Error ? e : new Error(String(e));
            break search; // quota du compte atteint ou clé refusée : inutile d'insister
          }
        }
        if (offres.size >= max) break search;
      }
    }
    // Rien de récupéré et une erreur : on la remonte (journal du scan), sinon on garde ce qui est arrivé.
    if (failure && !offres.size) throw failure;

    const list = Array.from(offres.values()).slice(0, max);
    onEvent({ kind: "list", source: SOURCE, total: list.length });
    let ok = 0;
    let failed = 0;
    for (let i = 0; i < list.length; i++) {
      yield list[i];
      const good = list[i].description_status === "ok";
      if (good) ok++;
      else failed++;
      onEvent({ kind: "offre", source: SOURCE, index: i + 1, total: list.length, status: good ? "ok" : "failed" });
    }
    onEvent({ kind: "done", source: SOURCE, seen: list.length, ok, failed });
  },
};
