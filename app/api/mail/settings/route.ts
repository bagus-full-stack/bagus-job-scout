import { NextRequest, NextResponse } from "next/server";
import { getMailConfig, saveMailConfig } from "@/lib/mail/send";

export const runtime = "nodejs";

// Le mot de passe n'est jamais renvoyé : seulement « configuré ou non ».
export async function GET() {
  const c = getMailConfig();
  return NextResponse.json({
    configured: !!c,
    host: c?.host ?? "smtp.gmail.com",
    port: c?.port ?? 465,
    user: c?.user ?? "",
    fromName: c?.fromName ?? "",
  });
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const host = String(b?.host ?? "").trim();
  const user = String(b?.user ?? "").trim();
  const port = Number(b?.port);
  if (!host || !user || !Number.isInteger(port) || port < 1 || port > 65535)
    return NextResponse.json({ error: "Serveur, port et adresse sont requis." }, { status: 400 });
  if (!getMailConfig() && !String(b?.pass ?? "").trim())
    return NextResponse.json({ error: "Le mot de passe d'application est requis." }, { status: 400 });
  saveMailConfig({ host, port, user, pass: String(b?.pass ?? "").trim() || undefined, fromName: String(b?.fromName ?? "").trim() });
  return NextResponse.json({ ok: true });
}
