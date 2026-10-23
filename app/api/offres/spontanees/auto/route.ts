import { NextRequest, NextResponse } from "next/server";
import { AUTO_DEFAULT, AUTO_MAX, AUTO_MIN_SCORE, eligibleContacts, eligibleOffres, getAutoJob, startAuto, stopAuto, type AutoKind } from "@/lib/auto/apply";
import { getMailConfig } from "@/lib/mail/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const kindOf = (v: unknown): AutoKind => (v === "offres" ? "offres" : "spontanees");
const scoreOf = (v: unknown) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : AUTO_MIN_SCORE;
};

function state(kind: AutoKind, minScore: number) {
  const eligible = kind === "offres" ? eligibleOffres(minScore).length : eligibleContacts().length;
  return { job: getAutoJob(), eligible, smtp: !!getMailConfig(), max: AUTO_MAX, defaultCount: AUTO_DEFAULT, minScore };
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  return NextResponse.json(state(kindOf(p.get("kind")), scoreOf(p.get("minScore"))));
}

// Lance un lot : l'envoi est irréversible, le navigateur n'appelle ceci qu'après la confirmation explicite de l'utilisateur.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const kind = kindOf(b?.kind);
  const minScore = scoreOf(b?.minScore);
  const r = startAuto(kind, Number(b?.count), minScore);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json(state(kind, minScore));
}

export async function DELETE() {
  stopAuto();
  return NextResponse.json(state(getAutoJob()?.kind ?? "spontanees", AUTO_MIN_SCORE));
}
