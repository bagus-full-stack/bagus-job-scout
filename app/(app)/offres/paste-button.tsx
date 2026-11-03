"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPaste } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";

export function PasteButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/offres/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "L'ajout a échoué.");
      router.push(`/offres/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "L'ajout a échoué.");
      setBusy(false);
    }
  }

  if (!open)
    return (
      <Button variant="ghost" onClick={() => setOpen(true)}>
        <ClipboardPaste className="h-4 w-4" /> Coller une offre
      </Button>
    );

  return (
    <div role="dialog" aria-label="Coller une offre" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex w-full max-w-xl flex-col gap-3 rounded-lg border border-border bg-bg p-4">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} placeholder="Collez ici le texte de l'offre…" aria-label="Texte de l'offre" />
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Lien de l'offre (facultatif)" aria-label="Lien de l'offre" />
        {error && <p role="alert" className="text-small text-red-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Annuler</Button>
          <Button onClick={submit} disabled={busy || text.trim().length < 50}>{busy ? "Analyse…" : "Ajouter"}</Button>
        </div>
      </div>
    </div>
  );
}
