import { NextRequest, NextResponse } from "next/server";
import { removeSpontaneousCv, saveSpontaneousCv } from "@/lib/db/spontanee-cv";

export const runtime = "nodejs";

// multipart : { role, file } enregistre (ou remplace) le CV PDF du poste.
export async function POST(req: NextRequest) {
  const fd = await req.formData().catch(() => null);
  const role = String(fd?.get("role") ?? "").trim().slice(0, 120);
  const file = fd?.get("file");
  if (!role) return NextResponse.json({ error: "Poste requis." }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
  try {
    saveSpontaneousCv(role, Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Enregistrement impossible." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const role = (new URL(req.url).searchParams.get("role") ?? "").trim();
  if (!role) return NextResponse.json({ error: "Poste requis." }, { status: 400 });
  removeSpontaneousCv(role);
  return NextResponse.json({ ok: true });
}
