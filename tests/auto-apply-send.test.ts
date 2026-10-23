import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import { upsertOffreFromSource } from "@/lib/db/offres";
import { saveDocument } from "@/lib/db/documents";
import { claimSend, releaseSend, saveMailConfig } from "@/lib/mail/send";
import { getAutoJob, startAuto } from "@/lib/auto/apply";

// Vrai lot automatique (applyOne compris) ; seuls l'envoi, le DNS et le profil sont remplacés.
const sendMail = vi.fn<() => Promise<void>>();
vi.mock("@/lib/mail/send", async (orig) => ({ ...(await orig<typeof import("@/lib/mail/send")>()), sendMail: () => sendMail() }));
vi.mock("@/lib/mail/dns-check", () => ({ checkDomain: async () => "ok" }));
vi.mock("@/lib/db/queries", () => ({ getProfile: () => ({ full_name: "Test User", phone: null, email: null }) }));

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

beforeEach(() => {
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
});
