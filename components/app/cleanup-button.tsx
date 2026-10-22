"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function CleanupButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{
    experiencesMerged: number;
    educationsMerged: number;
    projectsMerged?: number;
    skillsRemoved: number;
  } | null>(null);

  async function run() {
    if (loading) return;
    if (
      !confirm(
        "Ceci va fusionner les expériences/formations similaires (même entreprise/école + dates qui se chevauchent) et supprimer les compétences en doublon. Continuer ?"
      )
    )
      return;
    setLoading(true);
    try {
      const res = await fetch("/api/profile/cleanup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "Erreur");
        return;
      }
      setDone(data.report);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    const projectsMerged = done.projectsMerged ?? 0;
    const total = done.experiencesMerged + done.educationsMerged + projectsMerged + done.skillsRemoved;
    return (
      <div role="status" className="text-small text-textSecondary inline-flex items-center gap-1.5">
        <Check className="h-4 w-4 text-success" />
        {total === 0
          ? "Aucun doublon trouvé"
          : `${done.experiencesMerged} expérience${done.experiencesMerged > 1 ? "s" : ""} et ${done.educationsMerged} formation${done.educationsMerged > 1 ? "s" : ""}${projectsMerged > 0 ? ` et ${projectsMerged} projet${projectsMerged > 1 ? "s" : ""}` : ""} fusionnée${done.experiencesMerged + done.educationsMerged + projectsMerged > 1 ? "s" : ""} · ${done.skillsRemoved} compétence${done.skillsRemoved > 1 ? "s" : ""} en double retirée${done.skillsRemoved > 1 ? "s" : ""}`}
      </div>
    );
  }

  return (
    <Button variant="ghost" onClick={run} disabled={loading}>
      {loading ? <Spinner size={16} /> : <Sparkles className="h-4 w-4" />}
      Nettoyer les doublons
    </Button>
  );
}
