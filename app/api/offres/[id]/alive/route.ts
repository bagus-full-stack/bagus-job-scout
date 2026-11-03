import { NextRequest, NextResponse } from "next/server";
import { getOffre } from "@/lib/db/offres";

export const runtime = "nodejs";

// Formulations d'annonce clôturée (FR/EN) renvoyées avec un statut 200 par beaucoup de sites.
const CLOSED = /(offre|annonce|poste)[^.<]{0,40}(n'est plus|plus disponible|expir|pourvu|clôtur|cl[oô]tur)|no longer (available|accepting)|position (has been|is) (filled|closed)|job (has )?expired|this job is closed/i;

// Vérifie que l'annonce d'origine répond encore. Résultat : "open" | "closed" | "unknown".
// shortcut: pages rendues en JS et sites qui bloquent les robots donnent "unknown", pas de navigateur headless ; passer à Playwright si trop fréquent.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const offre = getOffre(Number(id));
  if (!offre) return NextResponse.json({ error: "Offre introuvable" }, { status: 404 });
  if (!/^https?:\/\//.test(offre.url)) return NextResponse.json({ state: "unknown" });
  try {
    const res = await fetch(offre.url, { redirect: "follow", signal: AbortSignal.timeout(8000), headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36" } });
    if (res.status === 404 || res.status === 410) return NextResponse.json({ state: "closed" });
    if (!res.ok) return NextResponse.json({ state: "unknown" });
    const body = (await res.text()).slice(0, 300_000);
    return NextResponse.json({ state: CLOSED.test(body) ? "closed" : "open" });
  } catch {
    return NextResponse.json({ state: "unknown" });
  }
}
