import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sonde de l'hébergeur (Docker, Caddy, plateforme) : publique, ne révèle rien.
export async function GET() {
  return NextResponse.json({ ok: true });
}
