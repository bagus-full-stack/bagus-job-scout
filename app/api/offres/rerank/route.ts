import { NextResponse } from "next/server";
import { aiRerankTop } from "@/lib/scoring/ai-pass";
import { translateAiError, genericFailure } from "@/lib/ai/errors";

export const runtime = "nodejs";
export const maxDuration = 120;

// Second passage IA sur les meilleures offres (consomme des jetons de l'IA configurée).
export async function POST(req: Request) {
  const params = new URL(req.url).searchParams;
  const force = params.get("force") === "1";
  const n = Number(params.get("limit"));
  const limit = n >= 1 ? Math.min(100, Math.floor(n)) : undefined;
  try {
    return NextResponse.json({ ok: true, ...(await aiRerankTop(limit, { force })) });
  } catch (e) {
    const ai = translateAiError(e);
    if (ai) return NextResponse.json({ error: ai.message }, { status: ai.status });
    return NextResponse.json({ error: genericFailure("offres/rerank", e) }, { status: 500 });
  }
}
