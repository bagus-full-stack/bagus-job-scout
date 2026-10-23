import { NextRequest, NextResponse } from "next/server";
import { getGoogleKey, getSites, getWeb, normalizeSite, saveGoogleKey, saveTargets } from "@/lib/scrapers/google";

export const runtime = "nodejs";

// La clé n'est jamais renvoyée : seulement « configuré ou non ».
export async function GET() {
  return NextResponse.json({ configured: !!getGoogleKey(), sites: getSites(), web: getWeb() });
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const key = String(b?.key ?? "").trim();
  const lines: string[] = Array.isArray(b?.sites) ? b.sites.map((s: unknown) => String(s)).filter((s: string) => s.trim()) : [];
  const sites = lines.map(normalizeSite);
  if (sites.some((s) => !s)) {
    return NextResponse.json({ error: `« ${lines[sites.findIndex((s) => !s)]} » n'est pas un site valide : indiquez un domaine, par exemple reddit.com ou linkedin.com/posts.` }, { status: 400 });
  }
  const unique = [...new Set(sites as string[])];
  if (unique.length > 10) return NextResponse.json({ error: "10 sites au maximum." }, { status: 400 });
  const web = b?.web === true;
  if (!unique.length && !web) return NextResponse.json({ error: "Indiquez au moins un site, ou cochez les pages d'entreprises." }, { status: 400 });
  if (!key && !getGoogleKey()) return NextResponse.json({ error: "La clé API est requise." }, { status: 400 });
  if (key) saveGoogleKey(key);
  saveTargets(unique, web);
  return NextResponse.json({ ok: true, sites: unique, web });
}
