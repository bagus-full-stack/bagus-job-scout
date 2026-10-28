"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SOURCES_META } from "@/lib/sources-meta";

const select = "h-9 rounded-md border border-border bg-bg px-3 text-small text-text focus:border-accent focus:outline-none";

export function PurgeButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState(0);
  const [source, setSource] = useState("");

  async function purge() {
    const scope = [days ? `de plus de ${days} jours` : "", source ? `de la source « ${source} »` : ""].filter(Boolean).join(" ");
    if (!confirm(`Supprimer toutes les offres ${scope} sans candidature ni document ? Les contacts spontanés sont conservés.`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/offres/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days, source }),
      });
      if (!res.ok) throw new Error();
      const { deleted } = await res.json();
      alert(`${deleted} offre(s) supprimée(s).`);
      router.refresh();
    } catch {
      alert("La purge a échoué.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Ancienneté à purger" className={select}>
        <option value={0}>Toutes dates</option>
        <option value={7}>+ de 7 jours</option>
        <option value={30}>+ de 30 jours</option>
        <option value={90}>+ de 90 jours</option>
      </select>
      <select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Source à purger" className={select}>
        <option value="">Toutes sources</option>
        {SOURCES_META.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      <Button variant="ghost" onClick={purge} disabled={busy}>
        <Trash2 className="h-4 w-4" /> Purger
      </Button>
    </div>
  );
}
