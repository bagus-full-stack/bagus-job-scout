import { NextRequest, NextResponse } from "next/server";
import { deleteSpontaneous } from "@/lib/db/spontanees";

export const runtime = "nodejs";

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "id requis." }, { status: 400 });
  if (!deleteSpontaneous(id)) return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
