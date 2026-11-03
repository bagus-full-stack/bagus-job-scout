import { listCandidatures, candidaturesCounts, successBySource } from "@/lib/db/candidatures";
import { PageHeader } from "@/components/app/page-header";
import { SOURCES_META } from "@/lib/sources-meta";
import { CandidaturesTable } from "./table";

export const dynamic = "force-dynamic";

export default async function CandidaturesPage() {
  const items = listCandidatures();
  const { upcoming } = candidaturesCounts();
  const stats = successBySource();
  const inProgress = items.filter((item) => item.status === "en_cours").length;
  // Sous-titre chiffré (comme en 3.4.10) plutôt qu'un slogan.
  const subtitle = items.length
    ? `${items.length} candidature${items.length > 1 ? "s" : ""} · ${inProgress} en préparation · ${upcoming ? `${upcoming} échéance${upcoming > 1 ? "s" : ""} à venir` : "aucune échéance à venir"}`
    : "Aucune candidature suivie pour l'instant.";
  return (
    <>
      <PageHeader eyebrow="Faire avancer" title="Candidatures" subtitle={subtitle} />
      {items.length > 0 && (
        <section aria-label="Réussite par source" className="glass-panel mb-6 p-5">
          <h2 className="font-display text-[19px] font-medium">Réussite par source</h2>
          <p className="mt-0.5 text-caption text-textSecondary">Entretiens et acceptations sur le total suivi. Peu parlant sous une vingtaine de candidatures par source.</p>
          <table className="mt-4 w-full text-small">
            <thead><tr className="text-left text-caption text-textSecondary"><th className="pb-2 font-medium">Source</th><th className="pb-2 text-right font-medium">Candidatures</th><th className="pb-2 text-right font-medium">Entretiens +</th><th className="pb-2 text-right font-medium">Taux</th></tr></thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.source} className="border-t border-border">
                  <td className="py-2">{s.source === "import" ? "Importées" : SOURCES_META.find((m) => m.id === s.source)?.label ?? s.source}</td>
                  <td className="py-2 text-right tabular-nums">{s.total}</td>
                  <td className="py-2 text-right tabular-nums">{s.positive}</td>
                  <td className="py-2 text-right tabular-nums">{Math.round((s.positive / s.total) * 100)} %</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <CandidaturesTable initial={items} />
    </>
  );
}
