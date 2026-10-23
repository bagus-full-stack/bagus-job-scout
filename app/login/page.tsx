"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

function LoginForm() {
  const next = useSearchParams().get("next");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password, next }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) return setError(d?.error || `Erreur serveur (HTTP ${res.status}).`);
      window.location.assign(d?.next || "/"); // rechargement complet : le cookie est lu par le serveur
    } catch {
      setError("Serveur injoignable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-4">
      <Card className="w-full max-w-sm p-8">
        <div className="mb-5 flex items-center gap-2">
          <Lock className="h-5 w-5 text-accent" />
          <h1 className="font-display text-h2">JobScout</h1>
        </div>
        <p className="mb-5 text-small text-textSecondary">Accès protégé. Saisissez le mot de passe.</p>
        <form onSubmit={submit} className="space-y-3">
          <Input type="password" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mot de passe" aria-label="Mot de passe" />
          <Button type="submit" size="lg" className="w-full" disabled={busy || !password}>
            {busy ? <Spinner size={16} className="text-current" /> : null}
            Se connecter
          </Button>
          {error && (
            <p role="alert" className="text-small text-danger">
              {error}
            </p>
          )}
        </form>
      </Card>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
