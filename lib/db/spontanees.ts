import "server-only";
import { getDb } from "./index";
import { deleteDocuments } from "./documents";
import { SPONTANEOUS_SOURCE } from "@/lib/mail/contacts-file";
import { checkDomains, type DomainStatus } from "@/lib/mail/dns-check";

export type SpontaneousContact = {
  id: number;
  company: string;
  email: string;
  title: string;
  added_at: string;
  has_cv: number;
  has_lm: number;
  status: string | null;
  /** Résultat du dernier contrôle DNS ; null = jamais vérifié. */
  dns: DomainStatus | null;
};

export function listSpontaneous(): SpontaneousContact[] {
  return getDb()
    .prepare(
      `SELECT o.id, o.company, o.source_id AS email, o.title, o.scraped_at AS added_at,
        EXISTS(SELECT 1 FROM documents WHERE offre_id = o.id AND type = 'cv') AS has_cv,
        EXISTS(SELECT 1 FROM documents WHERE offre_id = o.id AND type = 'lm') AS has_lm,
        (SELECT status FROM candidatures WHERE offre_id = o.id LIMIT 1) AS status,
        CASE WHEN json_valid(o.raw_payload) THEN json_extract(o.raw_payload, '$.dns.status') END AS dns
       FROM offres o WHERE o.source = ? ORDER BY o.scraped_at DESC, o.id DESC`
    )
    .all(SPONTANEOUS_SOURCE)
    .map((r) => ({ ...(r as SpontaneousContact) }));
}

/** Contrôle DNS des contacts (tous, ou ceux d'`ids`) ; le résultat est gardé dans leur raw_payload. */
export async function verifySpontaneous(ids?: number[]): Promise<Record<DomainStatus, number>> {
  const db = getDb();
  const rows = (db.prepare("SELECT id, source_id AS email FROM offres WHERE source = ?").all(SPONTANEOUS_SOURCE) as { id: number; email: string }[]).filter(
    (r) => !ids || ids.includes(r.id)
  );
  const status = await checkDomains(rows.map((r) => r.email.split("@")[1] ?? ""));
  const update = db.prepare("UPDATE offres SET raw_payload = json_set(CASE WHEN json_valid(raw_payload) THEN raw_payload ELSE '{}' END, '$.dns', json(?)) WHERE id = ?");
  const counts: Record<DomainStatus, number> = { ok: 0, invalid: 0, unknown: 0 };
  const checked_at = new Date().toISOString();
  for (const r of rows) {
    const s = status.get((r.email.split("@")[1] ?? "").toLowerCase()) ?? "unknown";
    counts[s]++;
    update.run(JSON.stringify({ status: s, checked_at }), r.id);
  }
  return counts;
}

/** Supprime le contact, ses documents (fichiers compris) et sa candidature. Ne touche jamais une vraie offre. */
export function deleteSpontaneous(id: number): boolean {
  const db = getDb();
  const row = db.prepare("SELECT id FROM offres WHERE id = ? AND source = ?").get(id, SPONTANEOUS_SOURCE);
  if (!row) return false;
  deleteDocuments({ offreId: id });
  db.prepare("DELETE FROM candidatures WHERE offre_id = ?").run(id);
  db.prepare("DELETE FROM offres WHERE id = ?").run(id);
  return true;
}
