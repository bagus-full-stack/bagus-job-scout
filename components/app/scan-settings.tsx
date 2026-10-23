"use client";
import { useEffect, useState } from "react";
import { AlertCircle, Check, Layers } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type State = { pages: number; min: number; max: number };

/** Profondeur de recherche : pages de résultats parcourues par recherche et par source. */
export function ScanSettings() {
  const [s, setS] = useState<State | null>(null);
  const [pages, setPages] = useState(5);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings/scan")
      .then((r) => r.json())
      .then((d: State) => {
        setS(d);
        setPages(d.pages);
      })
      .catch(() => setMsg({ ok: false, text: "Réglage illisible." }));
  }, []);

  if (!s) return null;

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pages }) });
      const d = await res.json().catch(() => null);
      setMsg(res.ok ? { ok: true, text: "Enregistré : appliqué au prochain scan." } : { ok: false, text: d?.error || `Erreur serveur (HTTP ${res.status}).` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <div className="mb-1 flex items-center gap-2">
        <Layers className="h-4 w-4 text-accent" />
        <h3 className="font-display text-h3">Profondeur de recherche</h3>
      </div>
      <p className="text-small text-textSecondary">
        Nombre de pages de résultats parcourues pour chaque intitulé cible, sur chaque source. Plus c'est élevé, plus le scan ramène d'offres, mais plus il est long, et plus les
        sites risquent de limiter les requêtes (LinkedIn surtout). Le plafond d'offres par source suit la même proportion.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="range"
          min={s.min}
          max={s.max}
          value={pages}
          onChange={(e) => setPages(Number(e.target.value))}
          className="w-56 accent-[var(--accent,#6366f1)]"
          aria-label="Pages par recherche"
        />
        <span className="w-20 text-small font-semibold tabular-nums">
          {pages} page{pages > 1 ? "s" : ""}
        </span>
        <Button variant="secondary" onClick={save} disabled={busy || pages === s.pages}>
          {busy ? <Spinner size={16} className="text-current" /> : <Check className="h-4 w-4" />}
          Enregistrer
        </Button>
      </div>
      {msg && (
        <div role={msg.ok ? "status" : "alert"} className={`mt-3 flex items-start gap-2 text-small ${msg.ok ? "text-success" : "text-danger"}`}>
          {msg.ok ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />} {msg.text}
        </div>
      )}
    </Card>
  );
}
