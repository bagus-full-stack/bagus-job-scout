// Adresses qui ne mènent à aucun recruteur : jamais proposées comme destinataire.
const IGNORED_LOCAL = /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|support|privacy|dpo|rgpd|gdpr|unsubscribe|abuse|webmaster|postmaster|newsletter|notifications?)$/i;
const IGNORED_DOMAIN = /(^|\.)(example\.(com|org)|sentry\.io|wixpress\.com)$/i;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(s.trim());

/** Première adresse de contact écrite dans le texte de l'offre (jamais devinée). */
export function findApplyEmail(text: string | null | undefined): string | null {
  for (const m of (text ?? "").matchAll(EMAIL_RE)) {
    const addr = m[0].replace(/\.+$/, "").toLowerCase();
    const [local, domain] = addr.split("@");
    if (/\.(png|jpe?g|gif|svg|webp)$/.test(addr)) continue;
    if (IGNORED_LOCAL.test(local) || IGNORED_DOMAIN.test(domain)) continue;
    return addr;
  }
  return null;
}
