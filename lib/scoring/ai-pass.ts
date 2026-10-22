import "server-only";
import { getDb, parseJson } from "@/lib/db";
import { getProfile } from "@/lib/db/queries";
import { getLlmConfig } from "@/lib/ai/client";
import { scoreOffres } from "@/lib/ai/score-offre";

/** Nombre d'offres affinées par l'IA à chaque passage (les mieux classées par le scoring local). */
export const AI_PASS_LIMIT = 60;

/** Taille d'un appel IA : au-delà, la génération dépasse le délai du fournisseur (Gemini : 180 s). */
const AI_BATCH_SIZE = 20;

/** Répartit les offres (triées par score) en lots entrelacés : chaque lot a le même mélange de niveaux. */
export function interleave<T>(items: T[], size = AI_BATCH_SIZE): T[][] {
  const n = Math.max(1, Math.ceil(items.length / size));
  const lots: T[][] = Array.from({ length: n }, () => []);
  items.forEach((it, i) => lots[i % n].push(it));
  return lots;
}

/** Score final : moyenne du scoring local (mots-clés) et du jugement de l'IA. */
export function blendScores(local: number, ai: number): number {
  return Math.max(0, Math.min(100, Math.round((local + ai) / 2)));
}

type Row = {
  id: number;
  title: string;
  company: string;
  country: string | null;
  contract_type: string | null;
  description_text: string;
  score: number;
  score_breakdown: string | null;
};

/**
 * Second passage : l'IA re-note les `limit` meilleures offres du scoring local qu'elle n'a pas
 * encore vues (un seul appel). Ne fait rien si l'IA n'est pas configurée. Coûte des jetons.
 */
export async function aiRerankTop(
  limit = AI_PASS_LIMIT,
  opts: { force?: boolean } = {}
): Promise<{ reranked: number; note?: string }> {
  if (getLlmConfig().mode === "unset") return { reranked: 0, note: "IA non configurée, second passage ignoré" };
  const profile = getProfile();
  if (!profile) return { reranked: 0, note: "aucun profil" };

  const db = getDb();
  const rows = (
    db
      .prepare(
        `SELECT id, title, company, country, contract_type, description_text, score, score_breakdown
         FROM offres WHERE description_status = 'ok' ORDER BY score DESC LIMIT ?`
      )
      .all(limit * 3) as Row[]
  )
    .filter((r) => opts.force || parseJson<{ ai_score?: number } | null>(r.score_breakdown, null)?.ai_score == null)
    .slice(0, limit);
  if (!rows.length) return { reranked: 0, note: "meilleures offres déjà affinées" };

  // Lots en parallèle : un lot en échec n'empêche pas les autres d'être appliqués.
  const lots = interleave(rows);
  // Un lot en échec (503, délai) est retenté une fois.
  const scoreLot = (lot: Row[]) => scoreOffres(profile, lot).catch(() => scoreOffres(profile, lot));
  const settled = await Promise.allSettled(lots.map(scoreLot));
  const scored: { row: Row; ai: Awaited<ReturnType<typeof scoreOffres>>[number] }[] = [];
  let firstError: unknown;
  let failedLots = 0;
  settled.forEach((s, k) => {
    if (s.status === "rejected") return void ((firstError ??= s.reason), failedLots++);
    lots[k].forEach((row, i) => scored.push({ row, ai: s.value[i] }));
  });
  if (!scored.length && firstError) throw firstError;

  const upd = db.prepare("UPDATE offres SET score = ?, score_breakdown = ? WHERE id = ?");
  let reranked = 0;
  scored.forEach(({ row: r, ai }) => {
    // Un résultat absent revient en score 0 et raison vide : on garde alors le score local.
    if (!ai || (ai.score === 0 && !ai.reason)) return;
    const local = parseJson<Record<string, unknown>>(r.score_breakdown, {});
    // Le score local d'origine est conservé : une re-notation ne mélange jamais deux moyennes.
    const localScore = typeof local.local_score === "number" ? local.local_score : r.score;
    upd.run(
      blendScores(localScore, ai.score),
      JSON.stringify({
        ...local,
        local_score: localScore,
        ai_score: ai.score,
        ai_title: ai.breakdown?.title ?? null,
        reason: ai.reason,
      }),
      r.id
    );
    reranked++;
  });
  return failedLots ? { reranked, note: `${failedLots} lot(s) en échec après nouvel essai` } : { reranked };
}
