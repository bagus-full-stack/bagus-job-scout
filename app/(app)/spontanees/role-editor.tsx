"use client";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

async function patchRole(body: Record<string, unknown>): Promise<boolean> {
  const res = await fetch("/api/offres/spontanees", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.ok;
}

// Poste visé d'un contact : saisie libre avec les intitulés du profil en suggestions.
export function RoleEditor({ id, role, options, hasDocs, reason }: { id: number; role: string; options: string[]; hasDocs: boolean; reason?: string | null }) {
  const router = useRouter();
  const list = useId();
  const [value, setValue] = useState(role);
  const [stale, setStale] = useState(false);

  async function commit() {
    const v = value.trim();
    if (!v || v === role) return setValue(role);
    if (await patchRole({ id, role: v })) {
      setStale(hasDocs);
      router.refresh();
    } else setValue(role);
  }

  return (
    <div className="w-full sm:w-60">
      <Input
        list={list}
        value={value}
        aria-label="Poste visé"
        title="Poste visé : le CV, la lettre et le mail s'y adaptent"
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      <datalist id={list}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
      {reason && !stale && <p className="mt-1 text-caption text-textSecondary">IA : {reason}</p>}
      {stale && <p className="mt-1 text-caption text-warning">Poste changé : régénérez le CV et la lettre.</p>}
    </div>
  );
}

// Même poste pour tous les contacts d'un coup.
export function BulkRole({ options }: { options: string[] }) {
  const router = useRouter();
  const list = useId();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function apply() {
    const v = value.trim();
    if (!v || !window.confirm(`Appliquer « ${v} » à tous les contacts ? Les documents déjà générés devront être régénérés.`)) return;
    setBusy(true);
    try {
      if (await patchRole({ all: true, role: v })) {
        setValue("");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="text-small text-textSecondary">Poste visé pour tous :</span>
      <Input className="w-64" list={list} value={value} placeholder="Ex. Ingénieur Full Stack" onChange={(e) => setValue(e.target.value)} />
      <datalist id={list}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
      <Button variant="secondary" size="md" onClick={apply} disabled={busy || !value.trim()}>
        Appliquer à tous
      </Button>
    </div>
  );
}
