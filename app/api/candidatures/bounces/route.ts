import { NextResponse } from "next/server";
import { fetchBouncedAddresses, markBounced } from "@/lib/mail/bounces";

export const runtime = "nodejs";
export const maxDuration = 60;

const DAYS = 30;

// Lit les mails de retour (adresse introuvable…) des 30 derniers jours et passe les candidatures concernées en « Échec ».
export async function POST() {
  try {
    const found = await fetchBouncedAddresses(new Date(Date.now() - DAYS * 86_400_000));
    return NextResponse.json({ ok: true, found: found.length, updated: markBounced(found) });
  } catch (e) {
    const err = e as { authenticationFailed?: boolean; message?: string };
    if (err.authenticationFailed)
      return NextResponse.json({ error: "La messagerie refuse l'identifiant IMAP : vérifiez que l'IMAP est activé chez votre fournisseur et le mot de passe d'application." }, { status: 502 });
    return NextResponse.json({ error: `Lecture de la boîte impossible : ${err.message ?? "erreur IMAP"}` }, { status: 502 });
  }
}
