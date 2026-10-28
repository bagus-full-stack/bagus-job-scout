import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { SPONTANEOUS_SOURCE } from "@/lib/mail/contacts-file";

export const runtime = "nodejs";

// Supprime les offres sans candidature ni document ; les contacts spontanés restent.
// Filtres facultatifs : days (offres de plus de N jours), source.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const days = Number.isInteger(b?.days) && b.days > 0 ? b.days : null;
  const source = typeof b?.source === "string" && b.source ? b.source : null;
  const { changes } = getDb()
    .prepare(
      `DELETE FROM offres WHERE source != ?
         AND NOT EXISTS(SELECT 1 FROM candidatures WHERE offre_id = offres.id)
         AND NOT EXISTS(SELECT 1 FROM documents WHERE offre_id = offres.id)
         AND (? IS NULL OR julianday(COALESCE(posted_at, scraped_at)) < julianday('now', '-' || ? || ' days'))
         AND (? IS NULL OR source = ?)`
    )
    .run(SPONTANEOUS_SOURCE, days, days, source, source);
  return NextResponse.json({ ok: true, deleted: changes });
}
