import { NextRequest, NextResponse } from "next/server";
import { deleteSpontaneous, setSpontaneousRole } from "@/lib/db/spontanees";

export const runtime = "nodejs";

// { role, id } : un contact ; { role, all: true } : tous les contacts.
export async function PATCH(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const role = String(b?.role ?? "").trim().slice(0, 120);
  if (!role) return NextResponse.json({ error: "Poste visé requis." }, { status: 400 });
  const id = Number(b?.id);
  if (b?.all !== true && !(Number.isInteger(id) && id > 0)) return NextResponse.json({ error: "id ou all requis." }, { status: 400 });
  return NextResponse.json({ ok: true, updated: setSpontaneousRole(role, b?.all === true ? undefined : [id]) });
}

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "id requis." }, { status: 400 });
  if (!deleteSpontaneous(id)) return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
