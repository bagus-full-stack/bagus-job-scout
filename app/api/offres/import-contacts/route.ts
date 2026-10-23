import { NextRequest, NextResponse } from "next/server";
import { upsertOffreFromSource } from "@/lib/db/offres";
import { getProfile } from "@/lib/db/queries";
import { getDb } from "@/lib/db";
import { parseContacts, spontaneousDescription, SPONTANEOUS_SOURCE } from "@/lib/mail/contacts-file";
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
  // Réimport : le poste choisi (et son origine, le contrôle DNS) pour un contact est conservé.
  const known = new Map(
    (getDb().prepare("SELECT source_id, title, raw_payload FROM offres WHERE source = ?").all(SPONTANEOUS_SOURCE) as { source_id: string; title: string; raw_payload: string | null }[]).map((r) => [r.source_id, r])
  );
  const ids: number[] = [];
  for (const c of contacts) {
    const prev = known.get(c.email);
    const contactRole = prev?.title ?? role;
    let kept: Record<string, unknown> = {};
    try {
      kept = prev?.raw_payload ? JSON.parse(prev.raw_payload) : {};
    } catch {}
    const description = spontaneousDescription(c.company, c.email, contactRole);
    ids.push(upsertOffreFromSource(SPONTANEOUS_SOURCE, {
      source_id: c.email,
      url: `mailto:${c.email}`,
      title: contactRole,
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
      raw_payload: { ...kept, spontaneous: true, email: c.email },
    }));
  }
  // Contrôle DNS des contacts importés : une panne DNS ne doit jamais faire échouer l'import.
  const dns = await verifySpontaneous(ids).catch(() => null);
  return NextResponse.json({ ok: true, imported: contacts.length, dns });
}
