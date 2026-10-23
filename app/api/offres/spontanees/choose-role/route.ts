import { NextResponse } from "next/server";
import { getProfile } from "@/lib/db/queries";
import { chooseRoles } from "@/lib/ai/choose-role";
import { applyAiRoles, contactsForAi } from "@/lib/db/spontanees";
import { translateAiError, genericFailure } from "@/lib/ai/errors";

export const runtime = "nodejs";
export const maxDuration = 300;

// L'IA choisit le poste visé de chaque contact parmi les postes du profil. Les contacts dont le poste
// a été choisi à la main ne sont jamais touchés. Chaque lot est enregistré dès qu'il revient.
export async function POST() {
  const profile = getProfile();
  const options = (profile?.target_titles ?? []).filter((t) => t.trim());
  if (!profile || options.length < 2)
    return NextResponse.json({ error: "Ajoutez au moins deux postes visés dans votre profil : l'IA choisit entre eux." }, { status: 400 });
  const contacts = contactsForAi();
  if (!contacts.length) return NextResponse.json({ ok: true, chosen: 0, counts: {} });
  const counts: Record<string, number> = {};
  try {
    const chosen = await chooseRoles(profile, options, contacts, (choices) => {
      applyAiRoles(choices);
      for (const c of choices) counts[c.role] = (counts[c.role] ?? 0) + 1;
    });
    return NextResponse.json({ ok: true, chosen, total: contacts.length, counts });
  } catch (e) {
    const ai = translateAiError(e);
    if (ai) return NextResponse.json({ error: ai.message, counts }, { status: ai.status });
    return NextResponse.json({ error: genericFailure("spontanees/choose-role", e), counts }, { status: 500 });
  }
}
