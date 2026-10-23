import "server-only";
import fs from "node:fs";
import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getOffre } from "@/lib/db/offres";
import { getProfile } from "@/lib/db/queries";
import { buildDocFilename, listDocuments } from "@/lib/db/documents";
import { createCandidature, updateCandidature } from "@/lib/db/candidatures";
import { listSpontaneous, setAutoResult } from "@/lib/db/spontanees";
import { SPONTANEOUS_SOURCE } from "@/lib/mail/contacts-file";
import { findApplyEmail, isEmail } from "@/lib/mail/contact";
import { mailDraft } from "@/lib/mail/draft";
import { claimSend, getMailConfig, releaseSend, sendMail } from "@/lib/mail/send";
import { checkDomain } from "@/lib/mail/dns-check";
import { detectDocLanguage, sourceLanguageHint } from "@/lib/text/lang";

/**
 * Candidature automatique, pour les contacts spontanés (`kind: "spontanees"`) comme pour les offres des sources qui
 * donnent une adresse de candidature (`kind: "offres"`) : génère le CV et la lettre (s'ils n'existent pas déjà),
 * envoie le mail et enregistre la candidature « envoyée ». Un seul lot à la fois, dans ce processus.
 * Les offres sans adresse (candidature par formulaire sur le site de la source) ne sont jamais traitées.
 *
 * Garde-fous, parce qu'un envoi ne se rattrape pas : lot borné (AUTO_MAX), pause aléatoire entre deux envois
 * (jamais de rafale), arrêt à la demande, arrêt après AUTO_MAX_FAILS échecs de suite ou si la messagerie refuse
 * l'identifiant, jamais deux fois le même contact, jamais un domaine sans courrier.
 */
export const AUTO_MAX = 50;
export const AUTO_DEFAULT = 10;
const AUTO_MAX_FAILS = 3;
export const PAUSE_MS: [number, number] = [45_000, 120_000];

export type AutoKind = "spontanees" | "offres";
export const AUTO_MIN_SCORE = 70;

export type AutoItem = { id: number; kind: AutoKind; company: string; title?: string; email: string; state: "waiting" | "running" | "sent" | "failed"; error?: string };
export type AutoJob = {
  kind: AutoKind;
  running: boolean;
  stopping: boolean;
  startedAt: string;
  finishedAt: string | null;
  /** Pourquoi le lot s'est arrêté avant la fin (null : terminé ou en cours). */
  stopReason: string | null;
  items: AutoItem[];
};

const g = globalThis as { __jobscoutAuto?: AutoJob };
export const getAutoJob = (): AutoJob | null => g.__jobscoutAuto ?? null;

/** Contacts qu'on peut candidater : adresse valide, domaine qui reçoit du courrier, aucune candidature encore. */
export function eligibleContacts() {
  return listSpontaneous().filter((c) => !c.status && c.dns !== "invalid" && isEmail(c.email));
}

/**
 * Offres des sources prêtes à candidater : score suffisant, aucune candidature, pas d'échec d'envoi automatique
 * antérieur (à retenter à la main), et une adresse de candidature dans l'annonce. Les meilleures d'abord.
 */
export function eligibleOffres(minScore: number): { id: number; company: string; title: string; email: string }[] {
  const rows = getDb()
    .prepare(
      `SELECT o.id, o.company, o.title, o.description_text AS text FROM offres o
       WHERE o.source <> ? AND o.score >= ?
         AND NOT EXISTS (SELECT 1 FROM candidatures c WHERE c.offre_id = o.id)
         AND (NOT json_valid(o.raw_payload) OR json_extract(o.raw_payload, '$.auto_error') IS NULL)
       ORDER BY o.score DESC, o.id DESC`
    )
    .all(SPONTANEOUS_SOURCE, minScore) as { id: number; company: string; title: string; text: string }[];
  const out: { id: number; company: string; title: string; email: string }[] = [];
  for (const r of rows) {
    const email = findApplyEmail(r.text);
    if (email && isEmail(email)) out.push({ id: r.id, company: r.company, title: r.title, email });
  }
  return out;
}

class SkipError extends Error {}

/** Prépare et envoie la candidature d'un contact. Lève une erreur au message lisible en cas d'échec. */
async function applyOne(item: AutoItem): Promise<void> {
  const offre = getOffre(item.id);
  const profile = getProfile();
  if (!offre || !profile) throw new Error("Contact ou profil introuvable.");
  if ((await checkDomain(item.email.split("@")[1])) === "invalid") throw new Error("Le domaine ne reçoit pas de courrier.");

  const have = () => listDocuments({ offreId: item.id });
  const pdf = (type: string) => have().find((d) => d.type === type && d.format === "pdf");
  if (!pdf("cv") || !pdf("lm")) {
    // Import tardif : la génération PDF (JSX) n'est chargée qu'au moment d'en avoir besoin.
    const { POST: generateAll } = await import("@/app/api/generate/all/route");
    const res = await generateAll(
      new NextRequest("http://localhost/api/generate/all", { method: "POST", body: JSON.stringify({ offreId: item.id }), headers: { "content-type": "application/json" } })
    );
    if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `Génération impossible (HTTP ${res.status}).`);
  }
  const cv = pdf("cv");
  const lm = pdf("lm");
  if (!cv || !lm) throw new Error("CV ou lettre manquant après la génération.");
  if (![cv, lm].every((d) => fs.existsSync(d.file_path))) throw new Error("Un document est introuvable sur le disque.");

  // Dernier contrôle avant l'envoi : une candidature enregistrée entre-temps (envoi manuel) ne doit pas être doublée.
  if (getDb().prepare("SELECT 1 FROM candidatures WHERE offre_id = ?").get(item.id)) throw new SkipError("Déjà candidaté.");

  if (!claimSend(item.id)) throw new SkipError("Envoi déjà en cours pour cette offre.");
  try {
    const draft = mailDraft({
      lang: detectDocLanguage(offre.title, offre.description_text, sourceLanguageHint(offre.source, offre.raw_payload), offre.country),
      title: offre.title,
      company: offre.company,
      fullName: profile.full_name ?? "",
      phone: profile.phone,
      email: profile.email,
      spontaneous: item.kind === "spontanees",
    });
    await sendMail({
      to: item.email,
      subject: draft.subject,
      text: draft.body,
      attachments: [cv, lm].map((d) => ({
        filename: buildDocFilename({ type: d.type, format: d.format, fullName: profile.full_name ?? null, title: offre.title }),
        path: d.file_path,
      })),
    });
    // Le mail est parti : on enregistre tout de suite.
    try {
      const id = createCandidature({ offre_id: item.id, cv_doc_id: cv.id, lm_doc_id: lm.id, status: "envoyee", contact: item.email });
      updateCandidature(id, { status: "envoyee", contact: item.email });
    } catch (e) {
      throw new Error(`Mail envoyé, mais candidature non enregistrée (${e instanceof Error ? e.message : "erreur base"}) : ajoutez-la à la main.`);
    }
  } finally {
    releaseSend(item.id);
  }
}

type Deps = {
  apply: (item: AutoItem) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  record: (id: number, error: string | null) => void;
  pause: () => number;
};
const realDeps: Deps = {
  apply: applyOne,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  record: setAutoResult,
  pause: () => PAUSE_MS[0] + Math.random() * (PAUSE_MS[1] - PAUSE_MS[0]),
};

/** Attend `ms` par tranches d'une seconde pour que « Arrêter » prenne effet sans délai. */
async function wait(job: AutoJob, ms: number, sleep: Deps["sleep"]) {
  for (let left = ms; left > 0 && !job.stopping; left -= 1000) await sleep(Math.min(1000, left));
}

export async function runAuto(job: AutoJob, deps: Deps = realDeps): Promise<void> {
  let fails = 0;
  let first = true;
  try {
    for (const item of job.items) {
      if (job.stopping) break;
      if (!first) await wait(job, deps.pause(), deps.sleep);
      if (job.stopping) break;
      first = false;
      item.state = "running";
      try {
        await deps.apply(item);
        item.state = "sent";
        deps.record(item.id, null);
        fails = 0;
      } catch (e) {
        if (e instanceof SkipError) {
          item.state = "failed";
          item.error = e.message;
          first = true; // rien n'a été envoyé : pas de pause
          continue;
        }
        const message = e instanceof Error ? e.message : "Erreur inconnue.";
        item.state = "failed";
        item.error = message;
        deps.record(item.id, message);
        fails++;
        if ((e as { code?: string }).code === "EAUTH") {
          job.stopReason = "La messagerie refuse l'identifiant : vérifiez le serveur SMTP et le mot de passe d'application.";
          break;
        }
        if (fails >= AUTO_MAX_FAILS) {
          job.stopReason = `${AUTO_MAX_FAILS} échecs de suite : lot interrompu. Dernière erreur : ${message}`;
          break;
        }
      }
    }
    if (job.stopping && !job.stopReason) job.stopReason = "Arrêté à votre demande.";
  } finally {
    job.running = false;
    job.finishedAt = new Date().toISOString();
  }
}

export type StartResult = { ok: true; job: AutoJob } | { ok: false; error: string };

export function startAuto(kind: AutoKind, count: number, minScore = AUTO_MIN_SCORE, deps?: Deps): StartResult {
  if (getAutoJob()?.running) return { ok: false, error: "Un lot est déjà en cours." };
  if (!getMailConfig()) return { ok: false, error: "Messagerie non configurée : renseignez-la dans Profil › Messagerie." };
  if (!getProfile()) return { ok: false, error: "Profil introuvable." };
  const n = Math.floor(count);
  if (!(n >= 1 && n <= AUTO_MAX)) return { ok: false, error: `Choisissez entre 1 et ${AUTO_MAX} candidatures.` };
  const pool: Omit<AutoItem, "kind" | "state">[] =
    kind === "offres" ? eligibleOffres(Math.max(0, Math.min(100, Math.floor(minScore) || 0))) : eligibleContacts();
  const items: AutoItem[] = pool.slice(0, n).map((c) => ({ id: c.id, kind, company: c.company, title: c.title, email: c.email, state: "waiting" }));
  if (!items.length)
    return {
      ok: false,
      error:
        kind === "offres"
          ? `Aucune offre éligible : il faut un score d'au moins ${minScore}, une adresse de candidature dans l'annonce et aucune candidature existante.`
          : "Aucun contact éligible : tous ont déjà une candidature ou un domaine injoignable.",
    };
  const job: AutoJob = { kind, running: true, stopping: false, startedAt: new Date().toISOString(), finishedAt: null, stopReason: null, items };
  g.__jobscoutAuto = job;
  void runAuto(job, deps);
  return { ok: true, job };
}

export function stopAuto(): boolean {
  const job = getAutoJob();
  if (!job?.running) return false;
  job.stopping = true;
  return true;
}
