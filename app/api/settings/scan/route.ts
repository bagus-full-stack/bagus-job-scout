import { NextRequest, NextResponse } from "next/server";
import { getScanPages, setScanPages } from "@/lib/scan/pages";
import { PAGES_MAX, PAGES_MIN } from "@/lib/scrapers/pages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ pages: getScanPages(), min: PAGES_MIN, max: PAGES_MAX });
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const n = Math.floor(Number(b?.pages));
  if (!(n >= PAGES_MIN && n <= PAGES_MAX)) return NextResponse.json({ error: `Choisissez entre ${PAGES_MIN} et ${PAGES_MAX} pages.` }, { status: 400 });
  return NextResponse.json({ ok: true, pages: setScanPages(n) });
}
