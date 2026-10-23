import { NextRequest, NextResponse } from "next/server";
import { upsertOffreFromSource } from "@/lib/db/offres";
import { getProfile } from "@/lib/db/queries";
import { parseContacts, SPONTANEOUS_SOURCE } from "@/lib/mail/contacts-file";
import { sheetsToText } from "@/lib/excel/contacts";
import { verifySpontaneous } from "@/lib/db/spontanees";

export const runtime = "nodejs";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Chaque contact devient une « offre » de source spontanee : CV, lettre et envoi par e-mail
// réutilisent alors le parcours d'une offre normale, avec le destinataire déjà renseigné.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const base64 = typeof b?.file === "string" ? b.file : "";
  if (!base64 || base64.length > 7_000_000)
    return NextResponse.json({ error: "Fichier vide ou trop volumineux (5 Mo maximum)." }, { status: 400 });
  let text: string;
  try {
    text = sheetsToText(Buffer.from(base64, "base64"));
  } catch {
    return NextResponse.json({ error: "Fichier illisible : utilisez un fichier Excel (.xlsx, .xls), CSV ou texte." }, { status: 400 });
  }
  const contacts = parseContacts(text);
  if (!contacts.length) return NextResponse.json({ error: "Aucune adresse e-mail valide dans le fichier." }, { status: 400 });

  const profile = getProfile();
  const role = (profile?.target_titles ?? [])[0] || "Candidature spontanée";
  const country = (profile?.target_countries ?? [])[0] ?? null;
  const ids: number[] = [];
  for (const c of contacts) {
    const description = `Candidature spontanée adressée à ${c.company} (${c.email}). Poste visé : ${role}. Aucune offre publiée : présenter le profil du candidat pour ce type de poste.`;
    ids.push(upsertOffreFromSource(SPONTANEOUS_SOURCE, {
      source_id: c.email,
      url: `mailto:${c.email}`,
      title: role,
      company: c.company,
      country,
      location: null,
      contract_type: null,
      salary: null,
      description_html: `<p>${esc(description)}</p>`,
      description_text: description,
      description_status: "ok",
      posted_at: null,
      is_vie: false,
      raw_payload: { spontaneous: true, email: c.email },
    }));
  }
  // Contrôle DNS des contacts importés : une panne DNS ne doit jamais faire échouer l'import.
  const dns = await verifySpontaneous(ids).catch(() => null);
  return NextResponse.json({ ok: true, imported: contacts.length, dns });
}
