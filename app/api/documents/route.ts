import { NextRequest, NextResponse } from "next/server";
import { deleteDocuments } from "@/lib/db/documents";

export const runtime = "nodejs";

// ?offreId=N supprime tout le dossier d'une offre, ?id=N un document isolé.
export async function DELETE(req: NextRequest) {
  const p = new URL(req.url).searchParams;
  const offreId = Number(p.get("offreId"));
  const docId = Number(p.get("id"));
  if (Number.isInteger(offreId) && offreId > 0) return NextResponse.json({ ok: true, deleted: deleteDocuments({ offreId }) });
  if (Number.isInteger(docId) && docId > 0) return NextResponse.json({ ok: true, deleted: deleteDocuments({ docId }) });
  return NextResponse.json({ error: "offreId ou id requis." }, { status: 400 });
}
