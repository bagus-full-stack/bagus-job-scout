import "server-only";
import { ImapFlow } from "imapflow";
import { getDb } from "@/lib/db";
import { isEmail } from "./contact";
import { getMailConfig } from "./send";

/**
 * Adresses refusées d'après un mail de retour (rapport d'état de remise, RFC 3464) : chaque bloc de champs
 * qui porte `Final-Recipient` et `Action: failed` désigne un destinataire en échec définitif.
 * « delayed » (nouvelle tentative en cours) est ignoré.
 */
export function bouncedRecipients(source: string): string[] {
  const out = new Set<string>();
  for (const block of source.split(/\r?\n\r?\n/)) {
    if (!/^action:\s*failed/im.test(block)) continue;
    const m = /^final-recipient:\s*rfc822;\s*<?([^\s<>]+)>?/im.exec(block);
    if (m && isEmail(m[1])) out.add(m[1].toLowerCase());
  }
  return [...out];
}

/** Serveur IMAP déduit du serveur SMTP (smtp.gmail.com → imap.gmail.com) ; sinon le même hôte. */
export const imapHost = (smtpHost: string) => smtpHost.replace(/^smtp(-mail)?\./i, "imap$1.");

/**
 * Adresses en échec d'après les retours reçus depuis `since` dans la boîte de réception. Seuls les mails de
 * MAILER-DAEMON / postmaster sont lus, et seul le début de chacun (le rapport précède l'original joint).
 * shortcut: boîte « INBOX » seulement (un retour classé en spam n'est pas vu), 200 retours au plus.
 */
export async function fetchBouncedAddresses(since: Date): Promise<string[]> {
  const c = getMailConfig();
  if (!c) throw new Error("Messagerie non configurée : renseignez-la dans Profil › Messagerie.");
  const client = new ImapFlow({
    host: imapHost(c.host),
    port: 993,
    secure: true,
    auth: { user: c.user, pass: c.pass },
    logger: false,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
  });
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const uids = (await client.search({ since, or: [{ from: "mailer-daemon" }, { from: "postmaster" }] }, { uid: true })) || [];
    const out = new Set<string>();
    for (const uid of uids.slice(-200)) {
      const msg = await client.fetchOne(String(uid), { source: { maxLength: 100_000 } }, { uid: true });
      if (msg && msg.source) for (const a of bouncedRecipients(msg.source.toString("utf8"))) out.add(a);
    }
    return [...out];
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
}

/** Passe en « échec » les candidatures « envoyées » dont le contact est une adresse refusée. Rend leur nombre. */
export function markBounced(addresses: string[]): number {
  const stmt = getDb().prepare(
    `UPDATE candidatures
       SET status = 'echec', notes = CASE WHEN notes IS NULL OR notes = '' THEN ? ELSE notes || char(10) || ? END
     WHERE status = 'envoyee' AND lower(trim(contact)) = ?`
  );
  const note = "Adresse introuvable (retour de la messagerie).";
  let n = 0;
  for (const a of addresses) n += Number(stmt.run(note, note, a).changes);
  return n;
}
