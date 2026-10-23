"use client";
import { useEffect, useState } from "react";
import { AlertCircle, Check, ExternalLink, Mail } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";

type MailSettings = { configured: boolean; host: string; port: number; user: string; fromName: string };

/** Messagerie (SMTP) : un seul réglage pour tous les envois, candidatures sur offre comme spontanées. */
export function MailSettings() {
  const [cfg, setCfg] = useState<MailSettings | null>(null);
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/mail/settings")
      .then((r) => r.json())
      .then(setCfg)
      .catch(() => setMsg({ ok: false, text: "Réglages de messagerie illisibles." }));
  }, []);

  if (!cfg) return null;

  async function save() {
    if (!cfg) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/mail/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...cfg, pass }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) return setMsg({ ok: false, text: d?.error || `Erreur serveur (HTTP ${res.status}).` });
      setPass("");
      setCfg({ ...cfg, configured: true });
      setMsg({ ok: true, text: "Messagerie enregistrée." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <div className="mb-1 flex items-center gap-2">
        <Mail className="h-4 w-4 text-accent" />
        <h3 className="font-display text-h3">Messagerie</h3>
        {cfg.configured && <span className="text-caption text-success">Configurée</span>}
      </div>
      <p className="text-small text-textSecondary">
        Un seul réglage pour tous les envois (candidatures sur offre et spontanées). Gmail : activez la validation en 2 étapes, puis créez un « mot de passe d'application ». Le mot de
        passe reste dans la base locale et n'est jamais renvoyé au navigateur.{" "}
        <a className="inline-flex items-center gap-0.5 text-accent hover:underline" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">
          Créer un mot de passe d'application <ExternalLink className="h-3 w-3" />
        </a>
      </p>
      <div className="mt-4 space-y-2">
        <div className="flex gap-2">
          <Input value={cfg.host} onChange={(e) => setCfg({ ...cfg, host: e.target.value })} placeholder="smtp.gmail.com" aria-label="Serveur SMTP" />
          <Input className="w-24" type="number" value={cfg.port} onChange={(e) => setCfg({ ...cfg, port: Number(e.target.value) })} aria-label="Port" />
        </div>
        <Input type="email" value={cfg.user} onChange={(e) => setCfg({ ...cfg, user: e.target.value })} placeholder="Votre adresse e-mail" aria-label="Adresse e-mail" />
        <Input value={cfg.fromName} onChange={(e) => setCfg({ ...cfg, fromName: e.target.value })} placeholder="Nom affiché (optionnel)" aria-label="Nom affiché" />
        <Input
          type="password"
          autoComplete="off"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          placeholder={cfg.configured ? "Mot de passe inchangé" : "Mot de passe d'application"}
          aria-label="Mot de passe d'application"
        />
      </div>
      <Button className="mt-4" variant="secondary" onClick={save} disabled={busy}>
        {busy ? <Spinner size={16} className="text-current" /> : <Check className="h-4 w-4" />}
        Enregistrer la messagerie
      </Button>
      {msg && (
        <div role={msg.ok ? "status" : "alert"} className={`mt-3 flex items-start gap-2 text-small ${msg.ok ? "text-success" : "text-danger"}`}>
          {msg.ok ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />} {msg.text}
        </div>
      )}
    </Card>
  );
}
