import { NextRequest, NextResponse } from "next/server";
import { AUTO_DEFAULT, AUTO_MAX, eligibleContacts, getAutoJob, startAuto, stopAuto } from "@/lib/auto/spontaneous";
import { getMailConfig } from "@/lib/mail/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function state() {
  return { job: getAutoJob(), eligible: eligibleContacts().length, smtp: !!getMailConfig(), max: AUTO_MAX, defaultCount: AUTO_DEFAULT };
}

export async function GET() {
  return NextResponse.json(state());
}

// Lance un lot : l'envoi est irréversible, le navigateur n'appelle ceci qu'après la confirmation explicite de l'utilisateur.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const r = startAuto(Number(b?.count));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json(state());
}

export async function DELETE() {
  stopAuto();
  return NextResponse.json(state());
}
