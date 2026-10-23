import { NextRequest, NextResponse } from "next/server";
import { upsertOffreFromSource } from "@/lib/db/offres";
import { getProfile } from "@/lib/db/queries";
import { parseContacts, SPONTANEOUS_SOURCE } from "@/lib/mail/contacts-file";

export const runtime = "nodejs";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Chaque contact devient une « offre » de source spontanee : CV, lettre et envoi par e-mail
// réutilisent alors le parcours d'une offre normale, avec le destinataire déjà renseigné.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const text = typeof b?.text === "string" ? b.text : "";
  if (!text.trim() || text.length > 1_000_000)
    return NextResponse.json({ error: "Fichier vide ou trop volumineux (1 Mo maximum)." }, { status: 400 });
  const contacts = parseContacts(text);
  if (!contacts.length) return NextResponse.json({ error: "Aucune adresse e-mail valide dans le fichier." }, { status: 400 });

  const profile = getProfile();
  const role = (profile?.target_titles ?? [])[0] || "Candidature spontanée";
  const country = (profile?.target_countries ?? [])[0] ?? null;
  for (const c of contacts) {
    const description = `Candidature spontanée adressée à ${c.company} (${c.email}). Poste visé : ${role}. Aucune offre publiée : présenter le profil du candidat pour ce type de poste.`;
    upsertOffreFromSource(SPONTANEOUS_SOURCE, {
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
    });
  }
  return NextResponse.json({ ok: true, imported: contacts.length });
}
