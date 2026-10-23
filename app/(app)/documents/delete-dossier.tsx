"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export function DeleteDossier({ offreId, docId, label }: { offreId: number | null; docId: number; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm(`Supprimer « ${label} » ? Les fichiers seront effacés du disque.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/documents?${offreId != null ? `offreId=${offreId}` : `id=${docId}`}`, { method: "DELETE" });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={remove}
      disabled={busy}
      aria-label={`Supprimer le dossier ${label}`}
      title="Supprimer ce dossier"
      className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-textSecondary transition-colors hover:border-danger hover:text-danger disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
