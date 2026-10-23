"use client";
import { useEffect, useState } from "react";
import { AlertCircle, Check, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";

/** Clé de l'API Google Programmable Search, pour la source « Posts LinkedIn (via Google) ». */
export function GoogleSettings() {
  const [cfg, setCfg] = useState<{ configured: boolean; cx: string } | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings/google")
      .then((r) => r.json())
      .then(setCfg)
      .catch(() => setMsg({ ok: false, text: "Réglages Google illisibles." }));
  }, []);

  if (!cfg) return null;

  async function save() {
    if (!cfg) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings/google", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cx: cfg.cx, key }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) return setMsg({ ok: false, text: d?.error || `Erreur serveur (HTTP ${res.status}).` });
      setKey("");
      setCfg({ ...cfg, configured: true });
      setMsg({ ok: true, text: "Réglages Google enregistrés." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <div className="mb-1 flex items-center gap-2">
        <Search className="h-4 w-4 text-accent" />
        <h3 className="font-display text-h3">Posts LinkedIn (via Google)</h3>
        {cfg.configured && <span className="text-caption text-success">Configuré</span>}
      </div>
      <p className="text-small text-textSecondary">
        Cherche les posts LinkedIn publics qui annoncent un recrutement, sans jamais contacter LinkedIn : seuls les extraits indexés par Google sont lus. Créez un moteur sur
        programmablesearchengine.google.com (« Rechercher sur tout le web »), puis une clé API « Custom Search API » sur console.cloud.google.com. Gratuit jusqu'à 100 requêtes par jour (une page de
        10 résultats = une requête). Activez ensuite la source dans Profil › Recherche › Sources. La clé est chiffrée dans la base locale et n'est jamais renvoyée au navigateur.
      </p>
      <div className="mt-4 space-y-2">
        <Input value={cfg.cx} onChange={(e) => setCfg({ ...cfg, cx: e.target.value })} placeholder="Identifiant du moteur (cx)" aria-label="Identifiant du moteur (cx)" />
        <Input
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={cfg.configured ? "Clé inchangée" : "Clé API"}
          aria-label="Clé API Google"
        />
      </div>
      <Button className="mt-4" variant="secondary" onClick={save} disabled={busy}>
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
