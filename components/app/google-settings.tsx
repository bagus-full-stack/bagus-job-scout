"use client";
import { useEffect, useState } from "react";
import { AlertCircle, Check, ExternalLink, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";

/** Clé SerpAPI et sites où chercher, pour la source « Recrutement sur le web (via Google) ». */
export function GoogleSettings() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [sites, setSites] = useState("");
  const [web, setWeb] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings/google")
      .then((r) => r.json())
      .then((d: { configured: boolean; sites: string[]; web: boolean }) => {
        setConfigured(d.configured);
        setSites(d.sites.join("\n"));
        setWeb(d.web);
      })
      .catch(() => setMsg({ ok: false, text: "Réglages SerpAPI illisibles." }));
  }, []);

  if (configured === null) return null;

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings/google", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, sites: sites.split(/[\n,;]+/), web }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) return setMsg({ ok: false, text: d?.error || `Erreur serveur (HTTP ${res.status}).` });
      if (key.trim()) setConfigured(true);
      setKey("");
      setSites((d.sites as string[]).join("\n"));
      setMsg({ ok: true, text: "Réglages enregistrés." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <div className="mb-1 flex items-center gap-2">
        <Search className="h-4 w-4 text-accent" />
        <h3 className="font-display text-h3">Recrutement sur le web (via Google)</h3>
        {configured && <span className="text-caption text-success">Configuré</span>}
      </div>
      <p className="text-small text-textSecondary">
        Cherche les annonces de recrutement publiques sans jamais contacter les sites eux-mêmes : seuls les extraits que Google a indexés sont lus, par l'intermédiaire de SerpAPI. Créez
        un compte sur serpapi.com et collez votre clé API ci-dessous (une page de 10 résultats = une recherche de votre forfait ; l'offre gratuite est limitée). Activez ensuite la source
        dans Profil › Recherche › Sources. La clé est chiffrée dans la base locale et n'est jamais renvoyée au navigateur.{" "}
        <a className="inline-flex items-center gap-0.5 text-accent hover:underline" href="https://serpapi.com/manage-api-key" target="_blank" rel="noreferrer">
          Créer une clé <ExternalLink className="h-3 w-3" />
        </a>
      </p>
      <label className="mt-4 block">
        <span className="text-caption text-textSecondary">Sites où chercher (un par ligne, 10 au maximum)</span>
        <textarea
          value={sites}
          onChange={(e) => setSites(e.target.value)}
          rows={4}
          spellCheck={false}
          placeholder={"linkedin.com/posts\nx.com\nreddit.com"}
          className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-small text-text focus:border-accent focus:outline-none"
          aria-label="Sites où chercher"
        />
      </label>
      <label className="mt-2 flex items-start gap-2 text-small">
        <input type="checkbox" className="mt-1" checked={web} onChange={(e) => setWeb(e.target.checked)} />
        <span>
          <span className="font-semibold">Pages de recrutement d'entreprises</span>{" "}
          <span className="text-textSecondary">· tout le web, hors sites d'emploi : plus riche, mais plus bruyant, et une requête de plus par intitulé</span>
        </span>
      </label>
      <div className="mt-4">
        <Input
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={configured ? "Clé inchangée (saisissez-en une pour la remplacer)" : "Clé API SerpAPI"}
          aria-label="Clé API SerpAPI"
        />
      </div>
      <Button className="mt-4" variant="secondary" onClick={save} disabled={busy || (!configured && !key.trim())}>
        {busy ? <Spinner size={16} className="text-current" /> : <Check className="h-4 w-4" />}
        Enregistrer
      </Button>
      {msg && (
        <div role={msg.ok ? "status" : "alert"} className={`mt-3 flex items-start gap-2 text-small ${msg.ok ? "text-success" : "text-danger"}`}>
          {msg.ok ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />} {msg.text}
        </div>
      )}
    </Card>
  );
}
