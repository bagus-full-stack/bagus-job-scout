"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Rocket, Square, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type Item = { id: number; company: string; email: string; state: "waiting" | "running" | "sent" | "failed"; error?: string };
type Job = { running: boolean; stopping: boolean; startedAt: string; finishedAt: string | null; stopReason: string | null; items: Item[] };
type State = { job: Job | null; eligible: number; smtp: boolean; max: number; defaultCount: number };

const STATE_LABEL: Record<Item["state"], string> = { waiting: "En attente", running: "En cours…", sent: "Envoyée", failed: "Échec" };

/** Candidature automatique : lance un lot, suit chaque envoi, permet d'arrêter. */
export function AutoPanel() {
  const router = useRouter();
  const [s, setS] = useState<State | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wasRunning = useRef(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/offres/spontanees/auto", { cache: "no-store" });
      if (r.ok) setS(await r.json());
    } catch {
      /* le prochain tour réessaie */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const running = !!s?.job?.running;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [running, load]);

  // Fin du lot : la liste (statuts, badges) se met à jour.
  useEffect(() => {
    if (wasRunning.current && !running) router.refresh();
    wasRunning.current = running;
  }, [running, router]);

  if (!s) return null;
  const job = s.job;
  const n = Math.min(count ?? s.defaultCount, s.eligible, s.max);

  async function call(method: "POST" | "DELETE", body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/offres/spontanees/auto", {
        method,
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) return setError(d?.error || `Erreur serveur (HTTP ${res.status}).`);
      setS(d);
    } finally {
      setBusy(false);
    }
  }

  function start() {
    if (
      !window.confirm(
        `Envoyer ${n} candidature${n > 1 ? "s" : ""} spontanée${n > 1 ? "s" : ""} automatiquement, sans relecture ?\n\nPour chaque contact, JobScout génère le CV et la lettre puis envoie le mail depuis votre adresse, avec une pause de 1 à 2 minutes entre deux envois. Un envoi ne peut pas être annulé. Vous pouvez arrêter le lot à tout moment.`
      )
    )
      return;
    call("POST", { count: n });
  }

  const done = job?.items.filter((i) => i.state === "sent").length ?? 0;
  const failed = job?.items.filter((i) => i.state === "failed").length ?? 0;
  const total = job?.items.length ?? 0;
  const current = job?.items.find((i) => i.state === "running");

  return (
    <Card className="mb-5 p-5">
      <div className="mb-1 flex items-center gap-2">
        <Rocket className="h-4 w-4 text-accent" />
        <h3 className="font-display text-h3">Candidature automatique</h3>
      </div>

      {!running && (
        <>
          <p className="text-small text-textSecondary">
            Génère le CV et la lettre de chaque contact puis envoie le mail, sans relecture, avec une pause de 1 à 2 minutes entre deux envois. Les contacts déjà candidatés et
            les domaines injoignables sont ignorés. {s.eligible} contact{s.eligible > 1 ? "s" : ""} éligible{s.eligible > 1 ? "s" : ""}.
          </p>
          {!s.smtp && <p className="mt-2 text-small text-warning">Messagerie non configurée : renseignez-la dans <Link href="/profile" className="underline">Profil › Messagerie</Link>.</p>}
          {s.eligible > 0 && s.smtp && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-small">
                Nombre
                <input
                  type="number"
                  min={1}
                  max={Math.min(s.max, s.eligible)}
                  value={n}
                  onChange={(e) => setCount(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
                  className="h-9 w-20 rounded-md border border-border bg-surface px-2 text-small"
                />
                <span className="text-textSecondary">(max {s.max} par lot)</span>
              </label>
              <Button onClick={start} disabled={busy}>
                {busy ? <Spinner size={16} className="text-current" /> : <Rocket className="h-4 w-4" />}
                Lancer
              </Button>
            </div>
          )}
        </>
      )}

      {running && job && (
        <div className="mt-2">
          <p className="text-small" role="status">
            {done} envoyée{done > 1 ? "s" : ""} sur {total}
            {failed > 0 && <span className="text-danger"> · {failed} échec{failed > 1 ? "s" : ""}</span>}
            {current && <span className="text-textSecondary"> · {job.stopping ? "arrêt après " : "en cours : "}{current.company}</span>}
            {!current && !job.stopping && <span className="text-textSecondary"> · pause avant le prochain envoi</span>}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surfaceHover" aria-hidden>
            <div className="h-full bg-accent transition-all" style={{ width: `${total ? ((done + failed) / total) * 100 : 0}%` }} />
          </div>
          <Button className="mt-3" variant="secondary" onClick={() => call("DELETE")} disabled={busy || job.stopping}>
            <Square className="h-4 w-4" />
            {job.stopping ? "Arrêt en cours…" : "Arrêter"}
          </Button>
        </div>
      )}

      {job && (
        <>
          {!running && (
            <p className="mt-4 text-small">
              Dernier lot : {done} envoyée{done > 1 ? "s" : ""}, {failed} échec{failed > 1 ? "s" : ""} sur {total}.
            </p>
          )}
          {!running && job.stopReason && <p className="mt-1 text-small text-warning">{job.stopReason}</p>}
          <ul className="mt-3 max-h-64 divide-y divide-border overflow-auto rounded-md border border-border text-small">
            {job.items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                {i.state === "sent" ? <Check className="h-4 w-4 text-success" /> : i.state === "failed" ? <X className="h-4 w-4 text-danger" /> : i.state === "running" ? <Spinner size={14} /> : <span className="w-4" />}
                <span className="min-w-0 flex-1 truncate font-semibold">{i.company}</span>
                <span className="truncate text-textSecondary">{i.email}</span>
                <span className={i.state === "failed" ? "text-danger" : i.state === "sent" ? "text-success" : "text-textSecondary"}>{STATE_LABEL[i.state]}</span>
                {i.error && <span className="basis-full pl-7 text-caption text-danger">{i.error}</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {error && (
        <div role="alert" className="mt-3 flex items-start gap-2 text-small text-danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}
    </Card>
  );
}
