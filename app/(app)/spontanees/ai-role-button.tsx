"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function AiRoleButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    if (!window.confirm("Laisser l'IA choisir le poste visé des contacts ? Le nom et l'adresse de chaque entreprise sont envoyés à l'IA configurée. Les postes que vous avez choisis à la main ne changent pas.")) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/offres/spontanees/choose-role", { method: "POST" });
      const d = await res.json().catch(() => null);
      const detail = d?.counts ? Object.entries(d.counts as Record<string, number>).map(([r, n]) => `${n} × ${r}`).join(" · ") : "";
      if (!res.ok) return setMsg({ ok: false, text: `${d?.error || `Erreur serveur (HTTP ${res.status}).`}${detail ? ` Déjà classés : ${detail}.` : ""}` });
      setMsg({ ok: true, text: d.chosen ? `${d.chosen}/${d.total} contacts classés : ${detail}. Régénérez les documents déjà créés.` : "Aucun contact à classer." });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Erreur réseau" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-sm flex-col items-end gap-1">
      <Button variant="secondary" onClick={run} disabled={busy} title="L'IA choisit, pour chaque entreprise, entre vos postes visés">
        {busy ? <Spinner size={16} className="text-current" /> : <Sparkles className="h-4 w-4" />}
        {busy ? "Analyse en cours…" : "Choisir le poste avec l'IA"}
      </Button>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-right text-caption text-textSecondary" : "text-right text-caption text-danger"}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
