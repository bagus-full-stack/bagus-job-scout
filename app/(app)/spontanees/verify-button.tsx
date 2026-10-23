"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function VerifyButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function verify() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/offres/spontanees/verify", { method: "POST" });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d) return setMsg("Vérification impossible.");
      setMsg(`${d.valid} valide(s) · ${d.invalid} injoignable(s)${d.unknown ? ` · ${d.unknown} non vérifié(s) (DNS en erreur)` : ""}`);
      router.refresh();
    } catch {
      setMsg("Vérification impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="secondary" onClick={verify} disabled={busy} title="Contrôle DNS : le domaine de chaque adresse reçoit-il du courrier ? Aucun mail n'est envoyé.">
        {busy ? <Spinner size={16} className="text-current" /> : <ShieldCheck className="h-4 w-4" />}
        Vérifier les domaines
      </Button>
      {msg && <p role="status" className="text-caption text-textSecondary">{msg}</p>}
    </div>
  );
}
