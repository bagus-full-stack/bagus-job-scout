// Protection d'accès de la version hébergée. Sans « server-only » ni module Node : ce fichier est
// aussi chargé par le middleware (runtime Edge), qui ne connaît que Web Crypto.

export const SESSION_COOKIE = "jobscout_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Version hébergée : activée par JOBSCOUT_HOSTED=1 ; sans elle, JobScout reste une application locale. */
export function hostedEnabled(): boolean {
  return process.env.JOBSCOUT_HOSTED === "1";
}

export function accessPassword(): string {
  return process.env.JOBSCOUT_ACCESS_PASSWORD ?? "";
}

/** Clé de signature des sessions : JOBSCOUT_SESSION_SECRET, à défaut le mot de passe d'accès. */
function sessionSecret(): string {
  return process.env.JOBSCOUT_SESSION_SECRET || accessPassword();
}

const enc = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Comparaison en temps constant (la longueur seule peut fuir, jamais le contenu). */
export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Jeton de session : « v1.<expiration en ms>.<HMAC-SHA256> ». */
export async function createSessionToken(now = Date.now()): Promise<string> {
  const body = `v1.${now + SESSION_TTL_MS}`;
  return `${body}.${await hmacHex(sessionSecret(), body)}`;
}

export async function verifySessionToken(token: string | undefined | null, now = Date.now()): Promise<boolean> {
  if (!token || !sessionSecret()) return false;
  const m = /^(v1\.(\d{10,16}))\.([0-9a-f]{64})$/.exec(token);
  if (!m || Number(m[2]) <= now) return false;
  return safeEqual(await hmacHex(sessionSecret(), m[1]), m[3]);
}

/** Adresse publique de la requête, derrière un proxy (Caddy, Nginx) : le serveur écoute en interne sur 0.0.0.0. */
export function publicOrigin(headers: Headers, fallbackUrl: string): string {
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return new URL(fallbackUrl).origin;
  const proto = (headers.get("x-forwarded-proto") ?? "http").split(",")[0].trim();
  return `${proto === "https" ? "https" : "http"}://${host}`;
}

/** Destination après connexion : un chemin du site uniquement, jamais une adresse externe (redirection ouverte). */
export function safeNext(next: string | null | undefined): string {
  return next && /^\/(?![/\\])/.test(next) ? next : "/";
}
