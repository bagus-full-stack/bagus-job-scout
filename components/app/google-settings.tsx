"use client";
import { useEffect, useState } from "react";
import { AlertCircle, Check, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";

/** Clé SerpAPI, pour la source « Posts LinkedIn (via Google) ». */
export function GoogleSettings() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings/google")
      .then((r) => r.json())
      .then((d: { configured: boolean }) => setConfigured(d.configured))
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
        body: JSON.stringify({ key }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) return setMsg({ ok: false, text: d?.error || `Erreur serveur (HTTP ${res.status}).` });
      setKey("");
      setConfigured(true);
      setMsg({ ok: true, text: "Clé SerpAPI enregistrée." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <div className="mb-1 flex items-center gap-2">
        <Search className="h-4 w-4 text-accent" />
        <h3 className="font-display text-h3">Posts LinkedIn (via Google)</h3>
        {configured && <span className="text-caption text-success">Configuré</span>}
      </div>
      <p className="text-small text-textSecondary">
        Cherche les posts LinkedIn publics qui annoncent un recrutement, sans jamais contacter LinkedIn : seuls les extraits que Google a indexés sont lus, par l'intermédiaire de
        SerpAPI. Créez un compte sur serpapi.com et collez votre clé API ci-dessous (une page de 10 résultats = une recherche de votre forfait ; l'offre gratuite est limitée). Activez
        ensuite la source dans Profil › Recherche › Sources. La clé est chiffrée dans la base locale et n'est jamais renvoyée au navigateur.
      </p>
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
      <Button className="mt-4" variant="secondary" onClick={save} disabled={busy || !key.trim()}>
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
