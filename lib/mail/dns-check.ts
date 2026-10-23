import "server-only";
import dns from "node:dns/promises";

// « ok » : le domaine reçoit du courrier. « invalid » : il n'existe pas ou refuse tout courrier.
// « unknown » : DNS injoignable ou en erreur (réseau coupé, délai) : on ne condamne pas l'adresse.
export type DomainStatus = "ok" | "invalid" | "unknown";

const DISPOSABLE = new Set([
  "mailinator.com", "yopmail.com", "yopmail.fr", "guerrillamail.com", "10minutemail.com", "tempmail.com",
  "temp-mail.org", "trashmail.com", "sharklasers.com", "getnada.com", "throwawaymail.com",
]);

const NOT_FOUND = new Set(["ENOTFOUND", "ENODATA"]);
const code = (e: unknown) => (e as { code?: string })?.code ?? "";

/** Un seul domaine : MX, à défaut A/AAAA (RFC 5321 § 5.1, MX implicite). Un MX nul (« . ») refuse tout courrier. */
export async function checkDomain(domain: string): Promise<DomainStatus> {
  const d = domain.trim().toLowerCase();
  if (!d || DISPOSABLE.has(d)) return "invalid";
  try {
    const mx = await dns.resolveMx(d);
    if (mx.length) return mx.every((m) => !m.exchange || m.exchange === ".") ? "invalid" : "ok";
  } catch (e) {
    if (!NOT_FOUND.has(code(e))) return "unknown";
  }
  for (const resolve of [dns.resolve4, dns.resolve6]) {
    try {
      if ((await resolve(d)).length) return "ok";
    } catch (e) {
      if (!NOT_FOUND.has(code(e))) return "unknown";
    }
  }
  return "invalid";
}

/** Plusieurs domaines, 10 requêtes à la fois, une seule requête par domaine distinct. */
export async function checkDomains(domains: string[]): Promise<Map<string, DomainStatus>> {
  const unique = [...new Set(domains.map((d) => d.trim().toLowerCase()))];
  const out = new Map<string, DomainStatus>();
  for (let i = 0; i < unique.length; i += 10) {
    const chunk = unique.slice(i, i + 10);
    const res = await Promise.all(chunk.map((d) => checkDomain(d)));
    chunk.forEach((d, j) => out.set(d, res[j]));
  }
  return out;
}
