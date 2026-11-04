"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Un CV PDF par poste visé : il est joint tel quel aux candidatures spontanées de ce poste, sans génération.
export function CvPerRole({ roles, uploaded }: { roles: string[]; uploaded: string[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const target = useRef("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(role: string, init: RequestInit, url = "/api/offres/spontanees/cv") {
    setBusy(role);
    setError(null);
    try {
      const res = await fetch(url, init);
      if (!res.ok) setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Opération impossible.");
      else router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  function onFile(file: File | undefined) {
    if (!file) return;
    const body = new FormData();
    body.set("role", target.current);
    body.set("file", file);
    void call(target.current, { method: "POST", body });
  }

  return (
    <section aria-labelledby="cv-per-role" className="glass-panel mb-4 px-5 py-4">
      <h2 id="cv-per-role" className="text-small font-semibold">CV par poste visé</h2>
      <p className="mt-0.5 text-caption text-textSecondary">Un CV PDF importé est joint tel quel aux candidatures spontanées de ce poste. Sans CV importé, il est généré.</p>
      <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      <ul className="mt-3 space-y-2">
        {roles.map((role) => {
          const has = uploaded.includes(role.trim().toLowerCase());
          return (
            <li key={role} className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-small">{role}</span>
              {has && <Badge variant="success"><FileText className="mr-1 inline h-3 w-3" />CV importé</Badge>}
              <Button
                variant="secondary"
                size="md"
                disabled={busy === role}
                onClick={() => {
                  target.current = role;
                  input.current?.click();
                }}
              >
                <Upload className="h-4 w-4" /> {has ? "Remplacer" : "Importer un CV"}
              </Button>
              {has && (
                <button
                  aria-label={`Retirer le CV de ${role}`}
                  disabled={busy === role}
                  onClick={() => void call(role, { method: "DELETE" }, `/api/offres/spontanees/cv?role=${encodeURIComponent(role)}`)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-textSecondary hover:border-danger hover:text-danger disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="mt-2 text-small text-danger">{error}</p>}
    </section>
  );
}
