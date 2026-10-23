"use client";
import { useEffect, useState } from "react";
import { AlertCircle, ArrowDown, ArrowUp, Check, Layers } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { PROVIDERS, type ProviderId } from "@/lib/ai/providers";
import { LLM_CHANGED } from "@/lib/ai/events";

type State = {
  active: ProviderId;
  order: ProviderId[];
  providers: { id: ProviderId; label: string }[];
  last: { from: ProviderId; to: ProviderId; reason: string; at: string } | null;
};

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

/** Ordre des fournisseurs de secours : l'application passe au suivant quand le fournisseur actif ne répond plus. */
export function FallbackSettings() {
  const [state, setState] = useState<State | null>(null);
  const [order, setOrder] = useState<ProviderId[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const load = () =>
      fetch("/api/settings/llm/fallbacks", { cache: "no-store" })
        .then((r) => r.json())
        .then((s: State) => {
          setState(s);
          // Le fournisseur actif ne peut pas être son propre secours (il l'était peut-être avant d'être choisi).
          setOrder(s.order.filter((id) => id !== s.active));
        })
        .catch(() => setMsg({ ok: false, text: "Réglages de secours illisibles." }));
    load();
    // « Génération IA » enregistre un fournisseur : la liste des secours possibles change aussitôt.
    window.addEventListener(LLM_CHANGED, load);
    return () => window.removeEventListener(LLM_CHANGED, load);
  }, []);

  if (!state) return null;
  const label = (id: ProviderId) => PROVIDERS[id]?.label ?? id;
  // Fournisseurs configurés qui ne sont pas (encore) dans la liste de secours.
  const unused = state.providers.filter((p) => !order.includes(p.id));
  const move = (i: number, d: -1 | 1) =>
    setOrder((o) => {
      const n = [...o];
      [n[i], n[i + d]] = [n[i + d], n[i]];
      return n;
    });

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings/llm/fallbacks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ order }),
      });
      const d = await res.json().catch(() => null);
      setMsg(res.ok ? { ok: true, text: order.length ? "Ordre de secours enregistré." : "Secours désactivé." } : { ok: false, text: d?.error || "Enregistrement impossible." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <div className="mb-1 flex items-center gap-2">
        <Layers className="h-4 w-4 text-accent" />
        <h3 className="font-display text-h3">Secours automatique</h3>
      </div>
      <p className="text-small text-textSecondary">
        Si <strong>{label(state.active)}</strong> est injoignable, sans crédit ou à court de quota, l'application essaie les fournisseurs ci-dessous, dans cet ordre. Un
        fournisseur en échec est écarté 5 minutes. Les modèles de chaque fournisseur sont ceux de ses propres réglages : un secours plus léger peut donner un résultat de
        moindre qualité.
      </p>

      {state.providers.length === 0 ? (
        <p className="mt-4 text-small text-textSecondary">Aucun autre fournisseur configuré : enregistrez la clé d'un second fournisseur (ci-dessus) pour l'utiliser en secours.</p>
      ) : (
        <>
          <ol className="mt-4 space-y-2">
            {order.map((id, i) => (
              <li key={id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-small">
                <span className="w-5 text-textSecondary">{i + 1}.</span>
                <span className="flex-1 font-semibold">{label(id)}</span>
                <button type="button" aria-label="Monter" disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 hover:bg-surfaceHover disabled:opacity-30">
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button type="button" aria-label="Descendre" disabled={i === order.length - 1} onClick={() => move(i, 1)} className="rounded p-1 hover:bg-surfaceHover disabled:opacity-30">
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => setOrder((o) => o.filter((x) => x !== id))} className="rounded px-2 py-1 text-caption text-danger hover:bg-surfaceHover">
                  Retirer
                </button>
              </li>
            ))}
          </ol>
          {unused.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-caption text-textSecondary">Ajouter :</span>
              {unused.map((p) => (
                <button key={p.id} type="button" onClick={() => setOrder((o) => [...o, p.id])} className="h-8 rounded-full border border-border px-3 text-small hover:bg-surfaceHover">
                  + {p.label}
                </button>
              ))}
            </div>
          )}
          <Button className="mt-4" variant="secondary" onClick={save} disabled={busy}>
            {busy ? <Spinner size={16} className="text-current" /> : <Check className="h-4 w-4" />}
            Enregistrer l'ordre
          </Button>
        </>
      )}

      {state.last && (
        <p className="mt-4 text-caption text-textSecondary">
          Dernière bascule : {label(state.last.from)} → {label(state.last.to)} ({state.last.reason}) le {when(state.last.at)}.
        </p>
      )}
      {msg && (
        <div role={msg.ok ? "status" : "alert"} className={`mt-3 flex items-start gap-2 text-small ${msg.ok ? "text-success" : "text-danger"}`}>
          {msg.ok ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />} {msg.text}
        </div>
      )}
    </Card>
  );
}
