import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db";
import { LLM_SETTING_KEYS, byokConfigFor, currentProvider, fallbackOrder, getLastFallback, providerModelsSetting } from "@/lib/ai/client";
import { PROVIDERS, PROVIDER_IDS, isProviderId, type ProviderId } from "@/lib/ai/providers";

// Configuré = clé enregistrée ; un serveur local (Ollama, LM Studio) sans clé ne compte que si ses modèles ont été enregistrés.
const configured = (id: ProviderId) => byokConfigFor(id) !== null && (PROVIDERS[id].keyRequired || !!getSetting(providerModelsSetting(id)));

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Fournisseurs de secours : essayés dans l'ordre quand le fournisseur actif est injoignable,
 * à court de quota ou de crédit. Seuls les fournisseurs déjà configurés (clé enregistrée) sont proposés.
 */
export async function GET() {
  const active = currentProvider();
  return NextResponse.json({
    active,
    order: fallbackOrder(),
    providers: PROVIDER_IDS.filter((id) => id !== active && configured(id)).map((id) => ({ id, label: PROVIDERS[id].label })),
    last: getLastFallback(),
  });
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const raw: unknown[] = Array.isArray(b?.order) ? b.order : [];
  const order = [...new Set(raw.filter(isProviderId))];
  const active = currentProvider();
  const bad = order.find((id) => id === active || !configured(id));
  if (bad) {
    return NextResponse.json(
      { error: bad === active ? "Le fournisseur actif ne peut pas être son propre secours." : `${PROVIDERS[bad].label} n'est pas configuré : enregistrez d'abord sa clé.` },
      { status: 400 }
    );
  }
  setSetting(LLM_SETTING_KEYS.fallbacks, JSON.stringify(order));
  return NextResponse.json({ ok: true, order });
}
