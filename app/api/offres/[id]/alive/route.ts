import { NextRequest, NextResponse } from "next/server";
import { getOffre } from "@/lib/db/offres";
import { isClosedPage, isPrivateHost } from "@/lib/offres/alive";

export const runtime = "nodejs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36";

// Vérifie que l'annonce d'origine répond encore. Résultat : "open" | "closed" | "unknown".
// shortcut: pages rendues en JS et sites qui bloquent les robots donnent "unknown", pas de navigateur headless ; passer à Playwright si trop fréquent.
// shortcut: un nom de domaine public qui résout vers une adresse privée (rebinding DNS) n'est pas détecté.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const offre = getOffre(Number(id));
  if (!offre) return NextResponse.json({ error: "Offre introuvable" }, { status: 404 });
  try {
    let url = new URL(offre.url);
    // Redirections suivies à la main : chaque saut est revérifié (une annonce publique ne doit pas rediriger vers le réseau local).
    for (let hop = 0; hop < 4; hop++) {
      if (!/^https?:$/.test(url.protocol) || isPrivateHost(url.hostname)) return NextResponse.json({ state: "unknown" });
      const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(8000), headers: { "User-Agent": UA } });
      const next = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && next) {
        url = new URL(next, url);
        continue;
      }
      if (res.status === 404 || res.status === 410) return NextResponse.json({ state: "closed" });
      if (!res.ok) return NextResponse.json({ state: "unknown" });
      return NextResponse.json({ state: isClosedPage((await res.text()).slice(0, 300_000)) ? "closed" : "open" });
    }
  } catch {}
  return NextResponse.json({ state: "unknown" });
}
