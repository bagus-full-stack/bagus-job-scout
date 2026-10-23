import "server-only";
import type { Scraper, ScrapedOffre, ScrapeCriteria, ProgressEvent } from "./base";
import { searchQueries } from "./base";
import { decryptSecret, encryptSecret } from "@/lib/mail/send";
import { getSetting, setSetting } from "@/lib/db";
import { detectVie } from "@/lib/vie";
import { capOf, pagesOf } from "./pages";
import { sleep } from "./dom";

/**
 * Posts LinkedIn publics, trouvés par l'API officielle Google Programmable Search (Custom Search JSON API) :
 * JobScout ne contacte jamais LinkedIn, il ne lit que les extraits que Google a déjà indexés.
 * Offre gratuite : 100 requêtes par jour ; chaque page de 10 résultats en coûte une.
 */
const SOURCE = "google";
const API = "https://www.googleapis.com/customsearch/v1";
const PAGE_SIZE = 10;
const MAX_START = 91; // l'API ne va pas au-delà du 100e résultat
const HIRING = '("recrute" OR "nous recrutons" OR "hiring" OR "we are hiring" OR "offre d\'emploi")';

export const GOOGLE_MISSING_MESSAGE =
  "Google non configuré : renseignez la clé API et l'identifiant du moteur (cx) dans Profil › Posts LinkedIn (via Google).";

export function getGoogleConfig(): { key: string; cx: string } | null {
  const stored = getSetting("google:key");
  const key = stored && decryptSecret(stored);
  const cx = getSetting("google:cx");
  return key && cx ? { key, cx } : null;
}

export function saveGoogleConfig(c: { cx: string; key?: string }) {
  setSetting("google:cx", c.cx);
  if (c.key) setSetting("google:key", encryptSecret(c.key));
}

type Item = { title?: string; link?: string; snippet?: string };

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
    raw_payload: { via: "google" },
    scrape_errors: text.length >= 40 ? undefined : "extrait trop court",
  };
}

async function fetchPage(cfg: { key: string; cx: string }, q: string, start: number): Promise<Item[]> {
  const params = new URLSearchParams({ key: cfg.key, cx: cfg.cx, q: `site:linkedin.com/posts ${HIRING} "${q}"`, num: String(PAGE_SIZE), start: String(start) });
  const res = await fetch(`${API}?${params}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) {
    const msg = ((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message;
    throw new Error(`Google HTTP ${res.status}${msg ? ` : ${msg}` : ""}`);
  }
  return ((await res.json()) as { items?: Item[] }).items ?? [];
}

export const googleScraper: Scraper = {
  name: SOURCE,
  async *scrape(criteria: ScrapeCriteria, onEvent: (e: ProgressEvent) => void) {
    onEvent({ kind: "start", source: SOURCE });
    const cfg = getGoogleConfig();
    if (!cfg) throw new Error(GOOGLE_MISSING_MESSAGE);

    const max = capOf(criteria, 30);
    const offres = new Map<string, ScrapedOffre>();
    let failure: Error | null = null;
    // Sans intitulé ciblé, la recherche serait trop large pour avoir un sens : rien n'est interrogé.
    search: for (const q of searchQueries(criteria).filter(Boolean)) {
      for (let page = 0; page < pagesOf(criteria) && offres.size < max; page++) {
        const start = 1 + page * PAGE_SIZE;
        if (start > MAX_START) break;
        try {
          const items = await fetchPage(cfg, q, start);
          for (const it of items) {
            const o = parseItem(it);
            if (o && !offres.has(o.source_id)) offres.set(o.source_id, o);
          }
          if (items.length < PAGE_SIZE) break;
          await sleep(400);
        } catch (e) {
          failure = e instanceof Error ? e : new Error(String(e));
          break search; // quota du jour atteint ou clé refusée : inutile d'insister
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
