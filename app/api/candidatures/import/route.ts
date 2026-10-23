import { NextRequest, NextResponse } from "next/server";
import { xlsxToCandidatures } from "@/lib/excel/io";
import { createCandidature } from "@/lib/db/candidatures";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;

export async function POST(req: NextRequest) {
  const fd = await req.formData();
  const file = fd.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "fichier manquant" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Fichier trop volumineux (5 Mo maximum)." }, { status: 413 });
  const buf = Buffer.from(await file.arrayBuffer());
  const rows = xlsxToCandidatures(buf);
  if (rows.length > MAX_ROWS) return NextResponse.json({ error: `Trop de lignes (${MAX_ROWS} maximum).` }, { status: 413 });
  let imported = 0;
  for (const r of rows) {
    if (!r.ext_company && !r.ext_title) continue;
    createCandidature({ offre_id: null, ...r });
    imported++;
  }
  return NextResponse.json({ ok: true, imported });
}
