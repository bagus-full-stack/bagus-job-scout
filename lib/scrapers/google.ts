import "server-only";
import type { Scraper, ScrapedOffre, ScrapeCriteria, ProgressEvent } from "./base";
import { searchQueries } from "./base";
import { decryptSecret, encryptSecret } from "@/lib/mail/send";
import { getSetting, setSetting } from "@/lib/db";
import { detectVie } from "@/lib/vie";
import { capOf, pagesOf } from "./pages";
import { sleep } from "./dom";

/**
 * Posts LinkedIn publics, trouvés dans les résultats de Google par SerpAPI :
 * JobScout ne contacte jamais LinkedIn, il ne lit que les extraits que Google a déjà indexés.
 * Chaque page de 10 résultats coûte une recherche sur le compte SerpAPI. L'adresse du service se règle par
 * SERPAPI_URL (par défaut le service public, mais aussi un serveur compatible).
 */
const SOURCE = "google";
const DEFAULT_API = "https://serpapi.com/search.json";
const PAGE_SIZE = 10;
const HIRING = '("recrute" OR "nous recrutons" OR "hiring" OR "we are hiring" OR "offre d\'emploi")';

export const GOOGLE_MISSING_MESSAGE = "SerpAPI non configuré : renseignez la clé API dans Profil › Posts LinkedIn (via Google).";

/** Clé SerpAPI enregistrée (chiffrée dans la base), ou null. */
export function getGoogleKey(): string | null {
  const stored = getSetting("google:key");
  return (stored && decryptSecret(stored)) || null;
}

export function saveGoogleKey(key: string) {
  setSetting("google:key", encryptSecret(key));
}

const apiUrl = () => process.env.SERPAPI_URL?.trim() || DEFAULT_API;

type Item = { title?: string; link?: string; snippet?: string };
type SerpResponse = { organic_results?: Item[]; error?: string };

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** « Marie Curie on LinkedIn: Nous recrutons… » → auteur et début du post. */
export function parseItem(it: Item): ScrapedOffre | null {
  const url = (it.link ?? "").split("?")[0];
  if (!url.includes("linkedin.com/posts/")) return null;
  const full = clean((it.title ?? "").replace(/\s*\|\s*LinkedIn\s*$/i, ""));
  const m = /^(.*?)\s+(?:on|sur)\s+LinkedIn\s*:\s*(.*)$/i.exec(full);
  const title = (m?.[2] || full || "Post LinkedIn").slice(0, 120);
  const company = m?.[1] || "Post LinkedIn";
  const text = clean(it.snippet ?? "") || title;
  return {
    source_id: url,
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
    raw_payload: { via: "serpapi" },
    scrape_errors: text.length >= 40 ? undefined : "extrait trop court",
  };
}

async function fetchPage(key: string, q: string, start: number): Promise<Item[]> {
  const params = new URLSearchParams({ engine: "google", api_key: key, q: `site:linkedin.com/posts ${HIRING} "${q}"`, num: String(PAGE_SIZE), start: String(start) });
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

    const max = capOf(criteria, 30);
    const offres = new Map<string, ScrapedOffre>();
    let failure: Error | null = null;
    // Sans intitulé ciblé, la recherche serait trop large pour avoir un sens : rien n'est interrogé.
    search: for (const q of searchQueries(criteria).filter(Boolean)) {
      for (let page = 0; page < pagesOf(criteria) && offres.size < max; page++) {
        try {
          const items = await fetchPage(key, q, page * PAGE_SIZE);
          for (const it of items) {
            const o = parseItem(it);
            if (o && !offres.has(o.source_id)) offres.set(o.source_id, o);
          }
          if (items.length < PAGE_SIZE) break;
          await sleep(400);
        } catch (e) {
          failure = e instanceof Error ? e : new Error(String(e));
          break search; // quota du compte atteint ou clé refusée : inutile d'insister
        }
      }
      if (offres.size >= max) break;
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
