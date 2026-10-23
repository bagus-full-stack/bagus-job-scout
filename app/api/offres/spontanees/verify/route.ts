import { NextResponse } from "next/server";
import { verifySpontaneous } from "@/lib/db/spontanees";

export const runtime = "nodejs";
export const maxDuration = 120;

// Contrôle DNS (lecture seule, aucun mail envoyé) de tous les contacts spontanés.
export async function POST() {
  const c = await verifySpontaneous();
  return NextResponse.json({ done: true, valid: c.ok, invalid: c.invalid, unknown: c.unknown });
}
