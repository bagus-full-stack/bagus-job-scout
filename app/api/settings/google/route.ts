import { NextRequest, NextResponse } from "next/server";
import { getGoogleConfig, saveGoogleConfig } from "@/lib/scrapers/google";
import { getSetting } from "@/lib/db";

export const runtime = "nodejs";

// La clé n'est jamais renvoyée : seulement « configuré ou non ».
export async function GET() {
  return NextResponse.json({ configured: !!getGoogleConfig(), cx: getSetting("google:cx") ?? "" });
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const cx = String(b?.cx ?? "").trim();
  const key = String(b?.key ?? "").trim();
  if (!cx) return NextResponse.json({ error: "L'identifiant du moteur (cx) est requis." }, { status: 400 });
  if (!getGoogleConfig() && !key) return NextResponse.json({ error: "La clé API est requise." }, { status: 400 });
  saveGoogleConfig({ cx, key: key || undefined });
  return NextResponse.json({ ok: true });
}
