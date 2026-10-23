import fs from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { getOffre } from "@/lib/db/offres";
import { getProfile } from "@/lib/db/queries";
import { buildDocFilename, listDocuments } from "@/lib/db/documents";
import { createCandidature, updateCandidature } from "@/lib/db/candidatures";
import { isEmail } from "@/lib/mail/contact";
import { getDb } from "@/lib/db";
import { claimSend, releaseSend, sendMail } from "@/lib/mail/send";
import { checkDomain } from "@/lib/mail/dns-check";

export const runtime = "nodejs";
export const maxDuration = 60;

// L'envoi est irréversible : le navigateur l'appelle seulement après le clic explicite
// de l'utilisateur, avec le destinataire, l'objet et le texte qu'il vient de relire.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const offreId = Number(b?.offreId);
  const to = String(b?.to ?? "").trim();
  const subject = String(b?.subject ?? "").trim();
  const text = String(b?.body ?? "").trim();
  if (!isEmail(to)) return NextResponse.json({ error: "Adresse du destinataire invalide." }, { status: 400 });
  if (!subject || !text) return NextResponse.json({ error: "Objet et message requis." }, { status: 400 });
  // Domaine sans MX ni adresse : le mail reviendrait en erreur. « unknown » (DNS en panne) ne bloque pas.
  if ((await checkDomain(to.split("@")[1])) === "invalid")
    return NextResponse.json({ error: `Le domaine de ${to} ne reçoit pas de courrier : vérifiez l'adresse.` }, { status: 400 });
  const offre = getOffre(offreId);
  if (!offre) return NextResponse.json({ error: "Offre introuvable." }, { status: 404 });

  const docs = listDocuments({ offreId });
  const cv = docs.find((d) => d.type === "cv" && d.format === "pdf");
  const lm = docs.find((d) => d.type === "lm" && d.format === "pdf");
  if (!cv || !lm) return NextResponse.json({ error: "Générez d'abord le CV et la lettre (PDF)." }, { status: 400 });
  const files = [cv, lm];
  if (files.some((d) => !fs.existsSync(d.file_path)))
    return NextResponse.json({ error: "Un document est introuvable sur le disque : régénérez-le." }, { status: 400 });

  // Déjà envoyée (clic double, lot automatique) : un mail ne se rattrape pas. Une candidature « en cours » n'empêche pas l'envoi.
  if (getDb().prepare("SELECT 1 FROM candidatures WHERE offre_id = ? AND status = 'envoyee'").get(offreId))
    return NextResponse.json({ error: "Une candidature a déjà été envoyée pour cette offre." }, { status: 409 });
  if (!claimSend(offreId)) return NextResponse.json({ error: "Un envoi est déjà en cours pour cette offre." }, { status: 409 });

  const fullName = getProfile()?.full_name ?? null;
  try {
    await sendMail({
      to,
      subject,
      text,
      attachments: files.map((d) => ({
        filename: buildDocFilename({ type: d.type, format: d.format, fullName, title: offre.title }),
        path: d.file_path,
      })),
    });
  } catch (e) {
    releaseSend(offreId);
    return NextResponse.json({ error: `Envoi impossible : ${e instanceof Error ? e.message : "erreur SMTP"}` }, { status: 502 });
  }

  // Le mail est parti : on enregistre la candidature « Envoyée » (même si l'offre était « En cours »).
  try {
    const id = createCandidature({ offre_id: offreId, cv_doc_id: cv.id, lm_doc_id: lm.id, status: "envoyee", contact: to });
    updateCandidature(id, { status: "envoyee", contact: to });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    // Le mail est parti : le dire clairement, pour que l'utilisateur ne le renvoie pas.
    return NextResponse.json(
      { error: `Mail envoyé, mais candidature non enregistrée (${e instanceof Error ? e.message : "erreur base"}) : ne le renvoyez pas, ajoutez-la à la main.` },
      { status: 500 }
    );
  } finally {
    releaseSend(offreId);
  }
}
