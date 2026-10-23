import "server-only";
import { getDb } from "./index";
import { deleteDocuments } from "./documents";
import { SPONTANEOUS_SOURCE, spontaneousDescription } from "@/lib/mail/contacts-file";
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
  /** « manual » : choisi par l'utilisateur (jamais écrasé par l'IA) ; « ai » : choisi par l'IA ; null : poste par défaut. */
  role_source: "manual" | "ai" | null;
  role_reason: string | null;
  /** Dernier échec de l'envoi automatique (null : aucun, ou réussi depuis). */
  auto_error: string | null;
};

export function listSpontaneous(): SpontaneousContact[] {
  return getDb()
    .prepare(
      `SELECT o.id, o.company, o.source_id AS email, o.title, o.scraped_at AS added_at,
        EXISTS(SELECT 1 FROM documents WHERE offre_id = o.id AND type = 'cv') AS has_cv,
        EXISTS(SELECT 1 FROM documents WHERE offre_id = o.id AND type = 'lm') AS has_lm,
        (SELECT status FROM candidatures WHERE offre_id = o.id LIMIT 1) AS status,
        CASE WHEN json_valid(o.raw_payload) THEN json_extract(o.raw_payload, '$.dns.status') END AS dns,
        CASE WHEN json_valid(o.raw_payload) THEN json_extract(o.raw_payload, '$.role_source') END AS role_source,
        CASE WHEN json_valid(o.raw_payload) THEN json_extract(o.raw_payload, '$.role_reason') END AS role_reason,
              CASE WHEN json_valid(o.raw_payload) THEN json_extract(o.raw_payload, '$.auto_error') END AS auto_error
       FROM offres o WHERE o.source = ? ORDER BY o.scraped_at DESC, o.id DESC`
    )
    .all(SPONTANEOUS_SOURCE)
    .map((r) => ({ ...(r as SpontaneousContact) }));
}

/** Garde le résultat de l'envoi automatique sur l'offre ou le contact : un message d'échec, ou `null` pour l'effacer. */
export function setAutoResult(id: number, error: string | null): void {
  getDb()
    .prepare(`UPDATE offres SET raw_payload = json_set(${SAFE_JSON}, '$.auto_error', ?) WHERE id = ?`)
    .run(error, id);
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

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Change le poste visé d'un contact (ou de tous si `ids` est absent) ; le texte de l'offre suit. Renvoie le nombre de contacts. */
export function setSpontaneousRole(role: string, ids?: number[]): number {
  const db = getDb();
  const rows = (db.prepare("SELECT id, company, source_id AS email FROM offres WHERE source = ?").all(SPONTANEOUS_SOURCE) as { id: number; company: string; email: string }[]).filter(
    (r) => !ids || ids.includes(r.id)
  );
  for (const r of rows) writeRole(r, role, "manual", null);
  return rows.length;
}

const SAFE_JSON = "CASE WHEN json_valid(raw_payload) THEN raw_payload ELSE '{}' END";

function writeRole(r: { id: number; company: string; email: string }, role: string, source: "manual" | "ai", reason: string | null) {
  const text = spontaneousDescription(r.company, r.email, role);
  getDb()
    .prepare(
      `UPDATE offres SET title = ?, description_text = ?, description_html = ?,
         raw_payload = json_set(${SAFE_JSON}, '$.role_source', ?, '$.role_reason', ?) WHERE id = ?`
    )
    .run(role, text, `<p>${escHtml(text)}</p>`, source, reason, r.id);
}

/** Contacts dont le poste n'a pas été choisi à la main : seuls ceux-là passent par l'IA. */
export function contactsForAi(): { id: number; company: string; email: string }[] {
  return getDb()
    .prepare(
      `SELECT id, company, source_id AS email FROM offres WHERE source = ?
       AND COALESCE(CASE WHEN json_valid(raw_payload) THEN json_extract(raw_payload, '$.role_source') END, '') <> 'manual' ORDER BY id`
    )
    .all(SPONTANEOUS_SOURCE)
    .map((r) => ({ ...(r as { id: number; company: string; email: string }) }));
}

export function applyAiRoles(choices: { id: number; role: string; reason: string }[]) {
  const byId = new Map(contactsForAi().map((c) => [c.id, c]));
  for (const c of choices) {
    const r = byId.get(c.id);
    if (r) writeRole(r, c.role, "ai", c.reason || null);
  }
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
