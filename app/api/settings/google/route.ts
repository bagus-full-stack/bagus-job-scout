import { NextRequest, NextResponse } from "next/server";
import { getGoogleKey, saveGoogleKey } from "@/lib/scrapers/google";

export const runtime = "nodejs";

// La clé n'est jamais renvoyée : seulement « configuré ou non ».
export async function GET() {
  return NextResponse.json({ configured: !!getGoogleKey() });
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const key = String(b?.key ?? "").trim();
  if (!key) return NextResponse.json({ error: "La clé API est requise." }, { status: 400 });
  saveGoogleKey(key);
  return NextResponse.json({ ok: true });
}
