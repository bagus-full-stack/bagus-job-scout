import fs from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { getOffre } from "@/lib/db/offres";
import { getProfile } from "@/lib/db/queries";
import { buildDocFilename, listDocuments } from "@/lib/db/documents";
import { createCandidature, updateCandidature } from "@/lib/db/candidatures";
import { isEmail } from "@/lib/mail/contact";
import { sendMail } from "@/lib/mail/send";
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
    return NextResponse.json({ error: `Envoi impossible : ${e instanceof Error ? e.message : "erreur SMTP"}` }, { status: 502 });
  }

  // Le mail est parti : on enregistre la candidature « Envoyée » (même si l'offre était « En cours »).
  const id = createCandidature({ offre_id: offreId, cv_doc_id: cv.id, lm_doc_id: lm.id, status: "envoyee", contact: to });
  updateCandidature(id, { status: "envoyee", contact: to });
  return NextResponse.json({ ok: true, id });
}
