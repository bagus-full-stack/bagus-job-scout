import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import { getSetting, setSetting } from "@/lib/db";
import { ensureDir, userDataDir } from "@/lib/paths";

// Réglages SMTP dans la table `settings`, comme les clés LLM (base locale, jamais renvoyés au navigateur).
export type MailConfig = { host: string; port: number; user: string; pass: string; fromName: string };

// Mot de passe SMTP chiffré (AES-256-GCM) dans la base ; la clé vit dans un fichier à part (secret.key, lisible par
// l'utilisateur seul), si bien qu'une copie de la base seule ne livre pas le mot de passe.
// shortcut: la clé est sur le même disque que la base, donc rien contre quelqu'un qui lit tout le dossier de données ; passer à un trousseau système si besoin.
const PREFIX = "enc:v1:";

function secretKey(): Buffer {
  const file = path.join(userDataDir(), "secret.key");
  try {
    return Buffer.from(fs.readFileSync(file, "utf8").trim(), "base64");
  } catch {
    const key = randomBytes(32);
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, key.toString("base64"), { mode: 0o600, flag: "wx" });
    return key;
  }
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", secretKey(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return PREFIX + [iv, c.getAuthTag(), ct].map((b) => b.toString("base64")).join(".");
}

/** Texte clair d'une valeur chiffrée ; une valeur sans préfixe (ancienne base) est rendue telle quelle. null si illisible (clé perdue). */
export function decryptSecret(stored: string): string | null {
  if (!stored.startsWith(PREFIX)) return stored;
  try {
    const [iv, tag, ct] = stored.slice(PREFIX.length).split(".").map((p) => Buffer.from(p, "base64"));
    const d = createDecipheriv("aes-256-gcm", secretKey(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function getMailConfig(): MailConfig | null {
  const host = getSetting("mail:host");
  const user = getSetting("mail:user");
  const stored = getSetting("mail:pass");
  const pass = stored && decryptSecret(stored);
  // Ancienne base : le mot de passe était en clair, on le chiffre à la première lecture.
  if (pass && stored && !stored.startsWith(PREFIX)) setSetting("mail:pass", encryptSecret(pass));
  if (!host || !user || !pass) return null;
  return { host, port: Number(getSetting("mail:port")) || 465, user, pass, fromName: getSetting("mail:from_name") ?? "" };
}

export function saveMailConfig(c: { host: string; port: number; user: string; pass?: string; fromName: string }) {
  setSetting("mail:host", c.host);
  setSetting("mail:port", String(c.port));
  setSetting("mail:user", c.user);
  setSetting("mail:from_name", c.fromName);
  if (c.pass) setSetting("mail:pass", encryptSecret(c.pass));
}

// Offres dont un envoi est en cours dans ce processus (manuel ou lot automatique) : jamais deux mails en même temps pour la même offre.
const sending = ((globalThis as { __jobscoutSending?: Set<number> }).__jobscoutSending ??= new Set<number>());

/** Réserve l'envoi pour cette offre ; false si un envoi est déjà en cours. À libérer avec releaseSend. */
export const claimSend = (offreId: number) => !sending.has(offreId) && !!sending.add(offreId);
export const releaseSend = (offreId: number) => void sending.delete(offreId);

export async function sendMail(args: {
  to: string;
  subject: string;
  text: string;
  attachments: { filename: string; path: string }[];
}) {
  const c = getMailConfig();
  if (!c) throw new Error("Messagerie non configurée : renseignez-la dans Profil › Messagerie.");
  const transport = nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.port === 465,
    auth: { user: c.user, pass: c.pass },
  });
  await transport.sendMail({
    from: c.fromName ? { name: c.fromName, address: c.user } : c.user,
    to: args.to,
    subject: args.subject,
    text: args.text,
    attachments: args.attachments,
  });
}
