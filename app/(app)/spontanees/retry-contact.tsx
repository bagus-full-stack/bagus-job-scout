"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";

// Relance l'envoi automatique pour ce seul contact (un lot d'un). L'envoi est irréversible : confirmation d'abord.
export function RetryContact({ id, label }: { id: number; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    if (!window.confirm(`Réessayer l'envoi à « ${label} » ? Le CV et la lettre manquants seront générés, puis le mail partira sans relecture.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/offres/spontanees/auto", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "spontanees", ids: [id] }),
      });
      if (!res.ok) setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Impossible de relancer l'envoi.");
      else {
        window.dispatchEvent(new Event("jobscout:auto-started"));
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={retry}
        disabled={busy}
        className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-3 text-small font-semibold transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
      >
        <RotateCw className="h-3.5 w-3.5" /> Réessayer
      </button>
      {error && <span role="alert" className="basis-full text-small text-danger">{error}</span>}
    </>
  );
}
