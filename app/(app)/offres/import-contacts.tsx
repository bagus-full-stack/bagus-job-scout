"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

function toBase64(buf: ArrayBuffer): string {
  let s = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// Fichier Excel, CSV ou texte : une ligne par contact, adresse et entreprise (n'importe quelle colonne).
export function ImportContacts() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/offres/import-contacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file: toBase64(await file.arrayBuffer()) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) return setMsg({ ok: false, text: data?.error || `Erreur serveur (HTTP ${res.status}).` });
      const bad = data.dns?.invalid ? ` · ${data.dns.invalid} domaine(s) injoignable(s)` : "";
      setMsg({ ok: true, text: `${data.imported} contact(s) importé(s)${bad}.` });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Erreur réseau" });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <input ref={input} type="file" accept=".xlsx,.xls,.xlsm,.ods,.csv,.tsv,.txt,text/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      <Button variant="secondary" onClick={() => input.current?.click()} disabled={busy} title="Fichier Excel, CSV ou texte : une ligne par contact, adresse et entreprise">
        {busy ? <Spinner size={16} className="text-current" /> : <Upload className="h-4 w-4" />}
        Importer des contacts
      </Button>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-caption text-success" : "text-caption text-danger"}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
