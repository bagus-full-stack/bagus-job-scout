"use client";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

export function AliveBanner({ offreId }: { offreId: number }) {
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    fetch(`/api/offres/${offreId}/alive`)
      .then((r) => r.json())
      .then((d) => setClosed(d.state === "closed"))
      .catch(() => {});
  }, [offreId]);
  if (!closed) return null;
  return (
    <div role="status" className="glass-panel mb-6 flex items-start gap-3 p-4">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
      <p className="text-small"><span className="font-semibold">Annonce probablement clôturée.</span> L'annonce d'origine ne répond plus ou indique que le poste est pourvu. Vérifiez avant de postuler.</p>
    </div>
  );
}
