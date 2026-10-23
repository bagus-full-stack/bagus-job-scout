import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, accessPassword, hostedEnabled, publicOrigin, verifySessionToken } from "@/lib/auth/session";

/**
 * Garde-fou de JobScout.
 *
 * LOCAL (par défaut) : JobScout n'a pas de compte utilisateur ; il écoute uniquement sur la
 * machine, et son API ne doit répondre qu'à l'application elle-même.
 * - En-tête Host : uniquement localhost / 127.0.0.1 / [::1]. Bloque le « DNS rebinding » (un site
 *   qui fait pointer son propre nom vers 127.0.0.1 pour lire le profil ou les candidatures).
 * - Sec-Fetch-Site : seules les requêtes de la même origine (ou tapées dans la barre d'adresse)
 *   passent. Un site ouvert dans un autre onglet ne peut ni lancer un scan, ni écraser le profil,
 *   ni consommer la clé API par une génération.
 * - Origin (requêtes qui modifient) : si présent, il doit être local et correspondre au Host.
 * Les scripts locaux (ligne de commande, recette d'installation) n'envoient ni Origin ni
 * Sec-Fetch-Site : ils passent, tant qu'ils visent un hôte local.
 *
 * HÉBERGÉ (JOBSCOUT_HOSTED=1) : tout, pages et API, exige une session ouverte avec le mot de passe
 * d'accès (JOBSCOUT_ACCESS_PASSWORD). Sans mot de passe configuré, rien n'est servi. Les protections
 * contre les requêtes venues d'un autre site (Sec-Fetch-Site, Origin = Host) restent actives.
 */
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"] };

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Accessibles sans session : la page de connexion, sa route, et la sonde de santé de l'hébergeur.
const PUBLIC_PATHS = new Set(["/login", "/api/auth/login", "/api/health"]);

// Actions qui n'ont de sens qu'en local (ouvrir l'explorateur du serveur, changer son dossier, télécharger Chromium).
const LOCAL_ONLY: { path: string; methods: string[] }[] = [
  { path: "/api/settings/open-folder", methods: ["POST"] },
  { path: "/api/settings/docs-folder", methods: ["POST"] },
  { path: "/api/engine", methods: ["POST"] },
];

function hostnameOf(hostHeader: string): string {
  try {
    return new URL(`http://${hostHeader}`).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function forbidden(reason: string): NextResponse {
  return NextResponse.json({ error: `Requête refusée (${reason}).` }, { status: 403 });
}

function localGuard(req: NextRequest): NextResponse {
  if (!req.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();
  const host = req.headers.get("host") ?? "";
  if (!LOCAL_HOSTNAMES.has(hostnameOf(host))) return forbidden("hôte non local");

  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return forbidden("origine externe");

  const method = req.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    const origin = req.headers.get("origin");
    if (origin) {
      let o: URL;
      try {
        o = new URL(origin);
      } catch {
        return forbidden("origine invalide");
      }
      if (!LOCAL_HOSTNAMES.has(o.hostname.toLowerCase()) || o.host.toLowerCase() !== host.toLowerCase()) {
        return forbidden("origine externe");
      }
    }
  }
  return NextResponse.next();
}

async function hostedGuard(req: NextRequest): Promise<NextResponse> {
  const path = req.nextUrl.pathname;
  const isApi = path.startsWith("/api/");
  if (path === "/api/health") return NextResponse.next();
  if (!accessPassword()) {
    return new NextResponse("Version hébergée sans mot de passe : définissez JOBSCOUT_ACCESS_PASSWORD.", { status: 503 });
  }

  const method = req.method.toUpperCase();
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  // Une requête qui modifie ne doit venir que de ce site (CSRF), connecté ou non.
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    const origin = req.headers.get("origin");
    if (origin) {
      let o: URL;
      try {
        o = new URL(origin);
      } catch {
        return forbidden("origine invalide");
      }
      if (o.host.toLowerCase() !== host.toLowerCase()) return forbidden("origine externe");
    }
  }
  const site = req.headers.get("sec-fetch-site");
  if (isApi && site && site !== "same-origin" && site !== "none") return forbidden("origine externe");

  if (PUBLIC_PATHS.has(path)) return NextResponse.next();

  if (!(await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value))) {
    if (isApi) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
    const login = new URL("/login", publicOrigin(req.headers, req.url));
    if (path !== "/") login.searchParams.set("next", path + req.nextUrl.search);
    return NextResponse.redirect(login);
  }

  if (LOCAL_ONLY.some((r) => r.path === path && r.methods.includes(method))) {
    return NextResponse.json({ error: "Indisponible sur la version hébergée." }, { status: 403 });
  }
  return NextResponse.next();
}

export function middleware(req: NextRequest) {
  return hostedEnabled() ? hostedGuard(req) : localGuard(req);
}
