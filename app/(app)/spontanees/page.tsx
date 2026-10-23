import Link from "next/link";
import { ArrowUpRight, Mail } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { listSpontaneous } from "@/lib/db/spontanees";
import { ImportContacts } from "../offres/import-contacts";
import { DeleteContact } from "./delete-contact";
import { RoleEditor, BulkRole } from "./role-editor";
import { getProfile } from "@/lib/db/queries";
import { VerifyButton } from "./verify-button";
import { AiRoleButton } from "./ai-role-button";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  envoyee: "Envoyée",
  en_cours: "En cours",
  entretien: "Entretien",
  acceptee: "Acceptée",
  refusee: "Refusée",
};

export default function SpontaneesPage() {
  const contacts = listSpontaneous();
  const roles = getProfile()?.target_titles ?? [];
  const sent = contacts.filter((c) => c.status && c.status !== "en_cours").length;
  const subtitle = contacts.length
    ? `${contacts.length} contact${contacts.length > 1 ? "s" : ""} · ${sent} candidature${sent > 1 ? "s" : ""} envoyée${sent > 1 ? "s" : ""}`
    : "Importez un fichier de contacts pour postuler sans offre publiée.";
  return (
    <>
      <PageHeader eyebrow="Prendre les devants" title="Candidatures spontanées" subtitle={subtitle} actions={
          <div className="flex flex-wrap items-start gap-2">
            {contacts.length > 0 && <AiRoleButton />}
            {contacts.length > 0 && <VerifyButton />}
            <ImportContacts />
          </div>
        } />

      {contacts.length === 0 ? (
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
        </>
      )}
    </>
  );
}
