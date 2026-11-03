// Formulations d'annonce clôturée (FR/EN), cherchées dans le texte visible de la page. Volontairement
// strictes : « Cette offre expire le 30 novembre » ou « Postes pourvus » dans une colonne de suggestions
// ne doivent pas déclencher le bandeau.
const CLOSED =
  /(offre|annonce|poste)[^.]{0,40}(n['’]est plus (disponible|en ligne|active|visible)|(est|a été) (pourvue?|clôturée?|cloturée?)|a expiré|est expirée?)|(offre|annonce) expirée|no longer (available|accepting applications)|position (has been|is) (filled|closed)|this job (has expired|is closed)|job (has )?expired/i;

export function isClosedPage(html: string): boolean {
  const text = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ");
  return CLOSED.test(text);
}

/** Hôtes que le serveur ne doit pas interroger (réseau local, métadonnées du cloud). */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    h === "localhost" ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h === "::1" ||
    /^(fc|fd|fe80)/.test(h) ||
    /^(0|10|127)\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  );
}
