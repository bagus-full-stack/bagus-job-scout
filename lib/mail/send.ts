import "server-only";
import nodemailer from "nodemailer";
import { getSetting, setSetting } from "@/lib/db";

// Réglages SMTP dans la table `settings`, comme les clés LLM (base locale, jamais renvoyés au navigateur).
export type MailConfig = { host: string; port: number; user: string; pass: string; fromName: string };

export function getMailConfig(): MailConfig | null {
  const host = getSetting("mail:host");
  const user = getSetting("mail:user");
  const pass = getSetting("mail:pass");
  if (!host || !user || !pass) return null;
  return { host, port: Number(getSetting("mail:port")) || 465, user, pass, fromName: getSetting("mail:from_name") ?? "" };
}

export function saveMailConfig(c: { host: string; port: number; user: string; pass?: string; fromName: string }) {
  setSetting("mail:host", c.host);
  setSetting("mail:port", String(c.port));
  setSetting("mail:user", c.user);
  setSetting("mail:from_name", c.fromName);
  if (c.pass) setSetting("mail:pass", c.pass);
}

export async function sendMail(args: {
  to: string;
  subject: string;
  text: string;
  attachments: { filename: string; path: string }[];
}) {
  const c = getMailConfig();
  if (!c) throw new Error("Messagerie non configurée : renseignez le serveur SMTP.");
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
