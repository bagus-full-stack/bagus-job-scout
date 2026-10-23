"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export function DeleteContact({ id, label }: { id: number; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm(`Supprimer « ${label} » ? Ses documents générés seront aussi effacés.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/offres/spontanees?id=${id}`, { method: "DELETE" });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={remove}
      disabled={busy}
      aria-label={`Supprimer ${label}`}
      title="Supprimer ce contact"
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-textSecondary transition-colors hover:border-danger hover:text-danger disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
