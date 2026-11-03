import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { setOffreScore, upsertOffreFromSource } from "@/lib/db/offres";
import { getProfile } from "@/lib/db/queries";
import { scoreOffresLocal } from "@/lib/scoring/local";
import { extractOffre } from "@/lib/ai/extract-offre";
import { genericFailure, translateAiError } from "@/lib/ai/errors";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CHARS = 50_000;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// La fiche affiche description_html : le texte collé y devient des paragraphes.
const toHtml = (text: string) =>
  text.split(/\n{2,}/).map((p) => `<p>${esc(p.trim()).replace(/\n/g, "<br>")}</p>`).join("");

// Offre collée à la main : le modèle en tire titre/entreprise, puis elle rejoint la base
// comme une offre scrapée (CV, LM et candidature fonctionnent ensuite à l'identique).
export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}));
    const text = typeof b?.text === "string" ? b.text.trim().slice(0, MAX_CHARS) : "";
    if (text.length < 50) return NextResponse.json({ error: "Collez le texte complet de l'offre." }, { status: 400 });
    const url = typeof b?.url === "string" && /^https?:\/\//.test(b.url.trim()) ? b.url.trim() : "";

    const o = await extractOffre(text);
    const id = upsertOffreFromSource("manual", {
      source_id: createHash("sha1").update(text).digest("hex").slice(0, 16),
      url,
      ...o,
      salary: null,
      description_html: toHtml(text),
      description_text: text,
      description_status: "ok",
      posted_at: new Date().toISOString(),
      is_vie: o.contract_type === "vie",
      raw_payload: {},
    });
    // Sans score, l'offre tomberait en bas de la liste et resterait hors des lots automatiques.
    const profile = getProfile();
    if (profile && id) setOffreScore(id, scoreOffresLocal(profile, [{ ...o, description_text: text }])[0]);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    const ai = translateAiError(e);
    if (ai) return NextResponse.json({ error: ai.message }, { status: ai.status });
    return NextResponse.json({ error: genericFailure("offres/manual", e) }, { status: 500 });
  }
}
