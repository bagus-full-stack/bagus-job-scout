import "server-only";
import { getDb, plainAll, transaction } from "./index";
import { ensureOffresRepaired } from "./repair-markup";

export type CandidatureRow = {
  id: number;
  offre_id: number | null;
  applied_at: string;
  status: string;
  notes: string | null;
  contact: string | null;
  deadline: string | null;
  cv_doc_id: number | null;
  lm_doc_id: number | null;
  msg_doc_id: number | null;
  ext_company: string | null;
  ext_title: string | null;
  ext_country: string | null;
  ext_url: string | null;
  ext_score: number | null;
};

export type CandidatureWithOffre = CandidatureRow & {
  offre_company: string | null;
  offre_title: string | null;
  offre_country: string | null;
  offre_url: string | null;
  offre_score: number | null;
};

export const STATUS = ["envoyee", "en_cours", "entretien", "refusee", "acceptee", "echec"] as const;
export type Status = (typeof STATUS)[number];

export function listCandidatures(): CandidatureWithOffre[] {
  // Titres et entreprises lus dans offres sans passer par lib/db/offres.ts : réparations
  // uniques des offres d'abord (page Candidatures, export, API), sans coût ensuite.
  ensureOffresRepaired();
  const rows = getDb()
    .prepare(
      `SELECT c.*,
              o.company AS offre_company,
              o.title AS offre_title,
              o.country AS offre_country,
              o.url AS offre_url,
              o.score AS offre_score
       FROM candidatures c
       LEFT JOIN offres o ON o.id = c.offre_id
       ORDER BY c.applied_at DESC`
    )
    .all() as CandidatureWithOffre[];
  return plainAll(rows);
}

export function createCandidature(args: {
  offre_id: number | null;
  cv_doc_id?: number | null;
  lm_doc_id?: number | null;
  msg_doc_id?: number | null;
  status?: Status;
  ext_company?: string | null;
  ext_title?: string | null;
  ext_country?: string | null;
  ext_url?: string | null;
  ext_score?: number | null;
  applied_at?: string | null;
  deadline?: string | null;
  notes?: string | null;
  contact?: string | null;
}): number {
  const db = getDb();
  // De-dup: if a candidature already exists for this offre, return it
  if (args.offre_id) {
    const existing = db.prepare("SELECT id FROM candidatures WHERE offre_id = ?").get(args.offre_id) as
      | { id: number }
      | undefined;
    if (existing) {
      // Update doc references
      db.prepare(
        "UPDATE candidatures SET cv_doc_id = COALESCE(?, cv_doc_id), lm_doc_id = COALESCE(?, lm_doc_id), msg_doc_id = COALESCE(?, msg_doc_id) WHERE id = ?"
      ).run(args.cv_doc_id ?? null, args.lm_doc_id ?? null, args.msg_doc_id ?? null, existing.id);
      return existing.id;
    }
  }
  const res = db
    .prepare(
      `INSERT INTO candidatures (offre_id, applied_at, status, notes, contact, deadline, cv_doc_id, lm_doc_id, msg_doc_id, ext_company, ext_title, ext_country, ext_url, ext_score)
       VALUES (?, COALESCE(?, datetime('now')), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      args.offre_id,
      args.applied_at ?? null,
      args.status ?? "envoyee",
      args.notes ?? null,
      args.contact ?? null,
      args.deadline ?? null,
      args.cv_doc_id ?? null,
      args.lm_doc_id ?? null,
      args.msg_doc_id ?? null,
      args.ext_company ?? null,
      args.ext_title ?? null,
      args.ext_country ?? null,
      args.ext_url ?? null,
      args.ext_score ?? null
    );
  return Number(res.lastInsertRowid);
}

// Seules ces colonnes sont modifiables via l'API — empêche le mass-assignment
// (injection de nom de colonne / écriture de champs non prévus).
const UPDATABLE_COLUMNS = ["status", "notes", "contact", "deadline"] as const;

export function updateCandidature(
  id: number,
  patch: Partial<{ status: Status; notes: string; contact: string; deadline: string }>
) {
  const fields: string[] = [];
  const params: any[] = [];
  for (const col of UPDATABLE_COLUMNS) {
    if (Object.prototype.hasOwnProperty.call(patch, col)) {
      fields.push(`${col} = ?`);
      params.push((patch as Record<string, unknown>)[col] ?? null);
    }
  }
  if (!fields.length) return;
  params.push(id);
  getDb().prepare(`UPDATE candidatures SET ${fields.join(", ")} WHERE id = ?`).run(...params);
}

export function deleteCandidature(id: number) {
  getDb().prepare("DELETE FROM candidatures WHERE id = ?").run(id);
}

// Même règle pour le compteur « N échéances à venir » et la liste de l'accueil :
// une échéance illisible par SQLite (date(...) NULL) n'apparaît ni dans l'un ni dans l'autre.
const UPCOMING_WHERE = "c.deadline IS NOT NULL AND date(c.deadline) >= date('now')";

export function candidaturesCounts() {
  const db = getDb();
  const rows = db
    .prepare("SELECT status, COUNT(*) AS c FROM candidatures GROUP BY status")
    .all() as { status: string; c: number }[];
  const total = (db.prepare("SELECT COUNT(*) AS c FROM candidatures").get() as { c: number }).c;
  const upcoming = (
    db.prepare(`SELECT COUNT(*) AS c FROM candidatures c WHERE ${UPCOMING_WHERE}`).get() as { c: number }
  ).c;
  return { total, upcoming, byStatus: rows };
}

export type UpcomingDeadline = {
  id: number;
  offre_id: number | null;
  deadline: string;
  status: string;
  title: string | null;
  company: string | null;
};

/**
 * Prochaines échéances avec l'intitulé de la candidature (poste + entreprise).
 * Les chaînes vides comptent comme absentes : certaines sources n'ont pas d'entreprise.
 */
export function upcomingDeadlines(limit = 5): UpcomingDeadline[] {
  ensureOffresRepaired(); // comme listCandidatures
  const rows = getDb()
    .prepare(
      `SELECT c.id, c.offre_id, c.deadline, c.status,
              COALESCE(NULLIF(TRIM(o.title), ''), NULLIF(TRIM(c.ext_title), '')) AS title,
              COALESCE(NULLIF(TRIM(o.company), ''), NULLIF(TRIM(c.ext_company), '')) AS company
       FROM candidatures c
       LEFT JOIN offres o ON o.id = c.offre_id
       WHERE ${UPCOMING_WHERE}
       ORDER BY date(c.deadline) ASC, c.id ASC
       LIMIT ?`
    )
    .all(Math.max(1, Math.min(20, Math.trunc(limit)))) as UpcomingDeadline[];
  return plainAll(rows);
}

/** Jours sans réponse au-delà desquels une candidature « envoyée » mérite une relance. */
export const FOLLOW_UP_DAYS = 10;

/** Candidatures envoyées depuis plus de FOLLOW_UP_DAYS jours et toujours sans réponse (calculé, rien n'est stocké). */
export function followUps(limit = 5) {
  return statusList(`c.status = 'envoyee' AND julianday(c.applied_at) <= julianday('now', '-${FOLLOW_UP_DAYS} days')`, "ASC", limit);
}

/** Candidatures en échec (mail revenu en erreur), les plus récentes d'abord. */
export function failedCandidatures(limit = 5) {
  return statusList("c.status = 'echec'", "DESC", limit);
}

function statusList(where: string, order: "ASC" | "DESC", limit: number): (UpcomingDeadline & { contact: string | null; country: string | null })[] {
  ensureOffresRepaired();
  const rows = getDb()
    .prepare(
      `SELECT c.id, c.offre_id, c.applied_at AS deadline, c.status, c.contact, COALESCE(o.country, c.ext_country) AS country,
              COALESCE(NULLIF(TRIM(o.title), ''), NULLIF(TRIM(c.ext_title), '')) AS title,
              COALESCE(NULLIF(TRIM(o.company), ''), NULLIF(TRIM(c.ext_company), '')) AS company
       FROM candidatures c
       LEFT JOIN offres o ON o.id = c.offre_id
       WHERE ${where}
       ORDER BY c.applied_at ${order}
       LIMIT ?`
    )
    .all(Math.max(1, Math.min(20, Math.trunc(limit)))) as (UpcomingDeadline & { contact: string | null; country: string | null })[];
  return plainAll(rows);
}

export type SourceStat = { source: string; total: number; positive: number };

/** Par source : candidatures suivies et celles qui ont mené à un entretien ou une acceptation. */
export function successBySource(): SourceStat[] {
  return getDb()
    .prepare(
      `SELECT COALESCE(o.source, 'import') AS source, COUNT(*) AS total,
              SUM(c.status IN ('entretien', 'acceptee')) AS positive
       FROM candidatures c LEFT JOIN offres o ON o.id = c.offre_id
       GROUP BY 1 ORDER BY total DESC`
    )
    .all() as SourceStat[];
}

type ImportRow = Parameters<typeof createCandidature>[0];

/**
 * Importe des candidatures sans offre, en une transaction (un échec n'en laisse pas la moitié) et sans
 * doubler celles déjà présentes : même entreprise, même poste et, si le fichier la donne, même date.
 */
export function importCandidatures(rows: ImportRow[]): number {
  const exists = getDb().prepare(
    `SELECT 1 FROM candidatures WHERE offre_id IS NULL AND ext_company IS ? AND ext_title IS ?
       AND (? IS NULL OR substr(applied_at, 1, 10) = ?)`
  );
  return transaction(() => {
    let imported = 0;
    for (const r of rows) {
      const date = r.applied_at?.slice(0, 10) ?? null;
      if (exists.get(r.ext_company ?? null, r.ext_title ?? null, date, date)) continue;
      createCandidature(r);
      imported++;
    }
    return imported;
  });
}
