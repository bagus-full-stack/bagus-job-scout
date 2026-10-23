import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_TTL_MS, accessPassword, createSessionToken, hostedEnabled, safeNext } from "@/lib/auth/session";

export const runtime = "nodejs";

// Limite les essais de mot de passe : 5 échecs par adresse et par 15 minutes (mémoire du processus : un seul serveur).
const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 5;
const failures = new Map<string, { count: number; resetAt: number }>();

const digest = (s: string) => createHash("sha256").update(s).digest();

function clientKey(req: NextRequest): string {
  // Derrière le proxy, la vraie adresse est la dernière valeur ajoutée par lui (les précédentes viennent du client).
  const xff = req.headers.get("x-forwarded-for");
  return xff ? xff.split(",").pop()!.trim() : "direct";
}

export async function POST(req: NextRequest) {
  if (!hostedEnabled() || !accessPassword()) return NextResponse.json({ error: "Connexion indisponible." }, { status: 404 });

  const key = clientKey(req);
  const now = Date.now();
  const f = failures.get(key);
  if (f && f.resetAt > now && f.count >= MAX_FAILURES) {
    const minutes = Math.ceil((f.resetAt - now) / 60_000);
    return NextResponse.json({ error: `Trop d'essais : réessayez dans ${minutes} min.` }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";
  if (!password || !timingSafeEqual(digest(password), digest(accessPassword()))) {
    const cur = f && f.resetAt > now ? f : { count: 0, resetAt: now + WINDOW_MS };
    failures.set(key, { count: cur.count + 1, resetAt: cur.resetAt });
    await new Promise((r) => setTimeout(r, 600)); // ralentit aussi les essais sous la limite
    return NextResponse.json({ error: "Mot de passe incorrect." }, { status: 401 });
  }

  failures.delete(key);
  const https = (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol).startsWith("https");
  const res = NextResponse.json({ ok: true, next: safeNext(body?.next) });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: https,
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return res;
}
