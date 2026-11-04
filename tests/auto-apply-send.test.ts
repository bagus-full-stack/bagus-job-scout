import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import { upsertOffreFromSource } from "@/lib/db/offres";
import fs from "node:fs";
import { deleteDocuments, listDocuments, saveDocument } from "@/lib/db/documents";
import { SPONTANEOUS_SOURCE } from "@/lib/mail/contacts-file";
import { claimSend, releaseSend, saveMailConfig } from "@/lib/mail/send";
import { getAutoJob, startAuto } from "@/lib/auto/apply";

// Vrai lot automatique (applyOne compris) ; seuls l'envoi, le DNS et le profil sont remplacés.
const sendMail = vi.fn<() => Promise<void>>();
vi.mock("@/lib/mail/send", async (orig) => ({ ...(await orig<typeof import("@/lib/mail/send")>()), sendMail: () => sendMail() }));
vi.mock("@/lib/mail/dns-check", () => ({ checkDomain: async () => "ok" }));
vi.mock("@/lib/db/queries", () => ({ getProfile: () => ({ full_name: "Test User", phone: null, email: null }) }));
// Génération IA remplacée : la lettre sauvegarde un faux PDF, la génération complète est espionnée.
const genAll = vi.fn();
const genLm = vi.fn(async (req: Request) => {
  const { offreId } = await req.json();
  saveDocument({ type: "lm", offreId, format: "pdf", buffer: Buffer.from("%PDF"), meta: { company: "B", title: "Dev IA" } });
  return Response.json({ ok: true });
});
vi.mock("@/app/api/generate/all/route", () => ({ POST: () => genAll() }));
vi.mock("@/app/api/generate/lm/route", () => ({ POST: (r: Request) => genLm(r) }));

function addOffre(): number {
  const id = upsertOffreFromSource("hellowork", {
    source_id: `l-${Math.random()}`,
    url: "https://example.org/o",
    title: "Poste",
    company: "Acme",
    country: "France",
    location: "Lyon",
    contract_type: "CDI",
    salary: null,
    description_html: "<p>x</p>",
    description_text: "Envoyez votre candidature à rh@acme.test",
    description_status: "ok",
    posted_at: "2026-01-15",
    is_vie: false,
    raw_payload: {},
  });
  getDb().prepare("UPDATE offres SET score = 90 WHERE id = ?").run(id);
  for (const type of ["cv", "lm"] as const) saveDocument({ type, offreId: id, format: "pdf", buffer: Buffer.from("%PDF"), meta: { company: "Acme", title: "Poste" } });
  return id;
}

/** Lance un lot d'une offre et attend sa fin. */
async function runBatch() {
  const r = startAuto("offres", 1, 70);
  expect(r.ok).toBe(true);
  await vi.waitFor(() => expect(getAutoJob()?.running).toBe(false));
  return getAutoJob()!.items[0];
}

/** Contact spontané (poste « Dev IA ») ; `withDocs` : il a déjà son CV et sa lettre. */
function addContact(email: string, country: string, withDocs: boolean): number {
  const id = upsertOffreFromSource(SPONTANEOUS_SOURCE, {
    source_id: email,
    url: `mailto:${email}`,
    title: "Dev IA",
    company: email,
    country,
    location: null,
    contract_type: null,
    salary: null,
    description_html: "<p>x</p>",
    description_text: "x",
    description_status: "ok",
    posted_at: null,
    is_vie: false,
    raw_payload: {},
  } as never);
  if (withDocs) for (const type of ["cv", "lm"] as const) saveDocument({ type, offreId: id, format: "pdf", buffer: Buffer.from("%PDF"), meta: { company: email, title: "Dev IA" } });
  return id;
}

async function runContact(id: number) {
  expect(startAuto("spontanees", 1, 70, undefined, [id]).ok).toBe(true);
  await vi.waitFor(() => expect(getAutoJob()?.running).toBe(false));
}

beforeEach(() => {
  genAll.mockReset();
  genLm.mockClear();
  sendMail.mockReset().mockResolvedValue();
  saveMailConfig({ host: "smtp.x.fr", port: 465, user: "a@x.fr", pass: "pw", fromName: "" });
  const db = getDb();
  db.exec("DELETE FROM candidatures");
  db.exec("DELETE FROM documents");
  db.exec("DELETE FROM offres");
});

describe("lot automatique : jamais deux mails pour la même offre", () => {
  it("envoie, enregistre la candidature et libère l'offre", async () => {
    const id = addOffre();
    const item = await runBatch();
    expect(item.state).toBe("sent");
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(getDb().prepare("SELECT status FROM candidatures WHERE offre_id = ?").get(id)).toMatchObject({ status: "envoyee" });
    expect(claimSend(id)).toBe(true); // libérée
    releaseSend(id);
  });

  it("saute l'offre si un envoi manuel est en cours, sans envoyer", async () => {
    const id = addOffre();
    expect(claimSend(id)).toBe(true);
    const item = await runBatch();
    releaseSend(id);
    expect(item.state).toBe("failed");
    expect(item.error).toMatch(/déjà en cours/);
    expect(sendMail).not.toHaveBeenCalled();
    expect(getDb().prepare("SELECT 1 FROM candidatures WHERE offre_id = ?").get(id)).toBeUndefined();
  });

  it("libère l'offre si l'envoi échoue", async () => {
    const id = addOffre();
    sendMail.mockRejectedValueOnce(new Error("SMTP down"));
    const item = await runBatch();
    expect(item.state).toBe("failed");
    expect(claimSend(id)).toBe(true);
    releaseSend(id);
  });

  it("onlyIds : un lot n'envoie qu'à la cible demandée (bouton Réessayer)", async () => {
    const first = addOffre();
    addOffre(); // plus récente : sans filtre, c'est elle qui passerait d'abord
    const r = startAuto("offres", 1, 70, undefined, [first]);
    expect(r.ok).toBe(true);
    await vi.waitFor(() => expect(getAutoJob()?.running).toBe(false));
    expect(getAutoJob()!.items.map((i) => i.id)).toEqual([first]);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(startAuto("offres", 1, 70, undefined, [999999]).ok).toBe(false); // cible inéligible ou inconnue
  });
});

describe("contacts spontanés : un CV par poste et pays", () => {
  it("copie le CV d'un contact du même poste et pays, ne génère que la lettre, et survit à sa suppression", async () => {
    const a = addContact("a@acme.test", "France", true);
    const b = addContact("b@beta.test", "France", false);
    await runContact(b);
    expect(genAll).not.toHaveBeenCalled();
    expect(genLm).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const cvB = listDocuments({ offreId: b }).find((d) => d.type === "cv")!;
    expect(cvB.file_path).not.toBe(listDocuments({ offreId: a }).find((d) => d.type === "cv")!.file_path);
    deleteDocuments({ offreId: a });
    expect(fs.existsSync(cvB.file_path)).toBe(true);
    expect(getDb().prepare("SELECT cv_doc_id FROM candidatures WHERE offre_id = ?").get(b)).toMatchObject({ cv_doc_id: cvB.id });
  });

  it("ne réutilise pas le CV d'un autre pays (langue différente) : génération complète", async () => {
    addContact("a@acme.test", "France", true);
    const b = addContact("b@beta.test", "Suisse", false);
    genAll.mockImplementationOnce(async () => {
      for (const type of ["cv", "lm"] as const) saveDocument({ type, offreId: b, format: "pdf", buffer: Buffer.from("%PDF"), meta: { company: "B", title: "Dev IA" } });
      return Response.json({ ok: true });
    });
    await runContact(b);
    expect(genAll).toHaveBeenCalledTimes(1);
    expect(genLm).not.toHaveBeenCalled();
  });
});
