import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { upsertOffreFromSource } from "@/lib/db/offres";
import { createCandidature } from "@/lib/db/candidatures";
import { saveDocument } from "@/lib/db/documents";

// Aucun mail ne part : sendMail est remplacé, claimSend / releaseSend restent les vrais.
const sendMail = vi.fn<() => Promise<void>>();
vi.mock("@/lib/mail/send", async (orig) => ({ ...(await orig<typeof import("@/lib/mail/send")>()), sendMail: () => sendMail() }));
vi.mock("@/lib/mail/dns-check", () => ({ checkDomain: async () => "ok" }));

import { POST } from "@/app/api/apply/email/route";

function addOffre(): number {
  const id = upsertOffreFromSource("hellowork", {
    source_id: `m-${Math.random()}`,
    url: "https://example.org/o",
    title: "Poste",
    company: "Acme",
    country: "France",
    location: "Lyon",
    contract_type: "CDI",
    salary: null,
    description_html: "<p>x</p>",
    description_text: "x",
    description_status: "ok",
    posted_at: "2026-01-15",
    is_vie: false,
    raw_payload: {},
  });
  for (const type of ["cv", "lm"] as const) saveDocument({ type, offreId: id, format: "pdf", buffer: Buffer.from("%PDF"), meta: { company: "Acme", title: "Poste" } });
  return id;
}

const send = (offreId: number) =>
  POST(
    new NextRequest("http://localhost/api/apply/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ offreId, to: "rh@acme.test", subject: "Candidature", body: "Bonjour" }),
    })
  );

beforeEach(() => {
  sendMail.mockReset().mockResolvedValue();
  const db = getDb();
  db.exec("DELETE FROM candidatures");
  db.exec("DELETE FROM documents");
  db.exec("DELETE FROM offres");
});

describe("POST /api/apply/email : jamais deux mails pour la même offre", () => {
  it("envoie puis enregistre la candidature « envoyée »", async () => {
    const id = addOffre();
    expect((await send(id)).status).toBe(200);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(getDb().prepare("SELECT status FROM candidatures WHERE offre_id = ?").get(id)).toMatchObject({ status: "envoyee" });
  });

  it("refuse (409) si une candidature « envoyée » existe déjà, sans envoyer", async () => {
    const id = addOffre();
    createCandidature({ offre_id: id, status: "envoyee", contact: "rh@acme.test" });
    expect((await send(id)).status).toBe(409);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("n'est pas bloqué par une candidature seulement « en cours »", async () => {
    const id = addOffre();
    createCandidature({ offre_id: id, status: "en_cours" });
    expect((await send(id)).status).toBe(200);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it("deux requêtes simultanées : un seul envoi, l'autre reçoit 409", async () => {
    const id = addOffre();
    let release!: () => void;
    sendMail.mockReturnValue(new Promise<void>((r) => (release = r)));
    const first = send(id);
    await vi.waitFor(() => expect(sendMail).toHaveBeenCalledTimes(1));
    expect((await send(id)).status).toBe(409);
    release();
    expect((await first).status).toBe(200);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it("libère l'offre si l'envoi échoue : un nouvel essai est possible", async () => {
    const id = addOffre();
    sendMail.mockRejectedValueOnce(new Error("SMTP down"));
    expect((await send(id)).status).toBe(502);
    expect((await send(id)).status).toBe(200);
  });
});
