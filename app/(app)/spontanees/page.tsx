import Link from "next/link";
import { ArrowUpRight, ChevronLeft, ChevronRight, Mail } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { listSpontaneous } from "@/lib/db/spontanees";
import { ImportContacts } from "../offres/import-contacts";
import { DeleteContact } from "./delete-contact";
import { RoleEditor, BulkRole } from "./role-editor";
import { getProfile } from "@/lib/db/queries";
import { VerifyButton } from "./verify-button";
import { AiRoleButton } from "./ai-role-button";
import { AutoPanel } from "./auto-panel";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  envoyee: "Envoyée",
  en_cours: "En cours",
  entretien: "Entretien",
  acceptee: "Acceptée",
  refusee: "Refusée",
};

const PAGE_SIZE = 25;

/** Numéros affichés : première, dernière, et la page courante avec ses voisines (« 1 … 4 5 6 … 10 »). */
function pageNumbers(page: number, pages: number): (number | null)[] {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const out: (number | null)[] = [];
  [...keep].sort((a, b) => a - b).forEach((n, i, all) => {
    if (i > 0 && n - all[i - 1] > 1) out.push(null);
    out.push(n);
  });
  return out;
}

export default async function SpontaneesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const all = listSpontaneous();
  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Math.floor(Number((await searchParams).page)) || 1));
  const contacts = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const roles = getProfile()?.target_titles ?? [];
  const sent = all.filter((c) => c.status && c.status !== "en_cours").length;
  const subtitle = all.length
    ? `${all.length} contact${all.length > 1 ? "s" : ""} · ${sent} candidature${sent > 1 ? "s" : ""} envoyée${sent > 1 ? "s" : ""}`
    : "Importez un fichier de contacts pour postuler sans offre publiée.";
  return (
    <>
      <PageHeader eyebrow="Prendre les devants" title="Candidatures spontanées" subtitle={subtitle} actions={
          <div className="flex flex-wrap items-start gap-2">
            {all.length > 0 && <AiRoleButton />}
            {all.length > 0 && <VerifyButton />}
            <ImportContacts />
          </div>
        } />

      {all.length === 0 ? (
        <div className="glass-panel px-6 py-16 text-center">
          <Mail className="mx-auto mb-4 h-9 w-9 text-accent" />
          <h2 className="font-display text-h2">Aucun contact importé</h2>
          <p className="mx-auto mt-2 max-w-[52ch] text-body text-textSecondary">
            Importez un fichier Excel, CSV ou texte : une ligne par contact, avec l'adresse e-mail et l'entreprise. Pour chaque contact, vous générez un CV et une
            lettre adaptés, puis vous les envoyez par e-mail après relecture.
          </p>
        </div>
      ) : (
        <>
        <AutoPanel />
      <BulkRole options={roles} />
        <ul className="glass-panel divide-y divide-border">
          {contacts.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{c.company}</p>
                <p className="truncate text-small text-textSecondary">{c.email}</p>
              </div>
              <RoleEditor id={c.id} role={c.title} options={roles} hasDocs={!!(c.has_cv || c.has_lm)} reason={c.role_source === "ai" ? c.role_reason : null} />
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={c.has_cv && c.has_lm ? "success" : "default"}>{c.has_cv && c.has_lm ? "Dossier prêt" : "À préparer"}</Badge>
                {c.dns === "ok" && <Badge variant="success">Domaine valide</Badge>}
                {c.dns === "invalid" && <Badge variant="danger">Domaine injoignable</Badge>}
                {c.dns === "unknown" && <Badge variant="warning">Non vérifié</Badge>}
                {c.status && <Badge>{STATUS_LABELS[c.status] ?? c.status}</Badge>}
                {!c.status && c.auto_error && <Badge variant="danger" title={c.auto_error}>Échec de l'envoi auto</Badge>}
              </div>
              <Link
                href={`/offres/${c.id}`}
                className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-3 text-small font-semibold transition-colors hover:border-accent hover:text-accent"
              >
                {c.has_cv && c.has_lm ? "Envoyer" : "Préparer"} <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
              <DeleteContact id={c.id} label={c.company} />
            </li>
          ))}
        </ul>
        {pages > 1 && (
          <nav aria-label="Pagination" className="mt-5 flex flex-wrap items-center justify-center gap-1.5">
            {page > 1 ? (
              <Link href={`/spontanees?page=${page - 1}`} aria-label="Page précédente" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border hover:border-accent hover:text-accent">
                <ChevronLeft className="h-4 w-4" />
              </Link>
            ) : null}
            {pageNumbers(page, pages).map((n, i) =>
              n === null ? (
                <span key={`gap${i}`} className="px-1 text-textSecondary">…</span>
              ) : (
                <Link
                  key={n}
                  href={`/spontanees?page=${n}`}
                  aria-current={n === page ? "page" : undefined}
                  className={`inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-2 text-small font-semibold ${n === page ? "border-accent bg-accent text-onAccent" : "border-border hover:border-accent hover:text-accent"}`}
                >
                  {n}
                </Link>
              )
            )}
            {page < pages ? (
              <Link href={`/spontanees?page=${page + 1}`} aria-label="Page suivante" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border hover:border-accent hover:text-accent">
                <ChevronRight className="h-4 w-4" />
              </Link>
            ) : null}
          </nav>
        )}
        <p className="mt-2 text-center text-caption text-textSecondary">
          {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, all.length)} sur {all.length}
        </p>
        </>
      )}
    </>
  );
}
